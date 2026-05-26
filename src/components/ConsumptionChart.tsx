import { memo, useCallback, useEffect, useMemo, useRef, useState, Fragment } from 'react';
import { Alert, Card, Checkbox, Empty, Grid, Select, Segmented, Spin, Typography } from 'antd';
import { useQueries, keepPreviousData } from '@tanstack/react-query';
import {
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceArea,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  fetchTelemetry,
  type AggregatedReading,
  type AnomalyMarker,
  type MonitoringObject,
  type ObjectSensor,
} from '../api/hooks';
import AnomalyDetailModal from './AnomalyDetailModal';
import { computeStressBands, type StressBand } from '../constants/stressSteps';
import {
  buildForecastExtension,
  mergeActualAndForecast,
  formatForecastDuration,
  type ForecastMarker,
  type ForecastZone,
} from '../utils/forecastChartUtils';

const CHART_HEIGHT = 380;
const CHART_HEIGHT_MOBILE = 260;

const { Text } = Typography;
const { useBreakpoint } = Grid;

export type { AnomalyMarker };

export interface StressPhaseInfo {
  phase: number;
  total: number;
  label: string;
}

interface ConsumptionChartProps {
  objectItem?: MonitoringObject;
  sensors: ObjectSensor[];
  refetchInterval?: number | false;
  anomalyMarkers?: AnomalyMarker[];
  liveWindowMinutes?: number;
  stressPhase?: StressPhaseInfo;
  stressStartedAt?: number;
  stressStep?: number;
}

type ChartRow = Record<string, number | string | boolean | null>;

interface PlottedAnomaly {
  anomaly: AnomalyMarker;
  chartTime: string;
  y: number;
}

const RANGE_OPTIONS = [
  { label: '1 ч', value: 'hour' },
  { label: '12 ч', value: '12h' },
  { label: '1 д', value: 'day' },
  { label: '7 д', value: 'week' },
  { label: '30 д', value: 'month' },
];

const RANGE_LABELS: Record<string, string> = {
  hour: '1 час',
  '12h': '12 часов',
  day: '24 часа',
  week: '7 дней',
  month: '30 дней',
};

const SEVERITY_DOT: Record<string, string> = {
  low: '#52c41a',
  medium: '#faad14',
  high: '#fa8c16',
  critical: '#ff4d4f',
};

const CHART_LINE_STYLES = [
  { stroke: '#0f766e', strokeDasharray: undefined, strokeWidth: 2.4 },
  { stroke: '#f97316', strokeDasharray: '8 3', strokeWidth: 2.2 },
  { stroke: '#2563eb', strokeDasharray: '3 3', strokeWidth: 2.0 },
  { stroke: '#7c3aed', strokeDasharray: '10 4 2 4', strokeWidth: 2.2 },
];

const LIVE_BUCKET_MS = 2_000;

function bucketTimeKey(iso: string, bucketMs: number): string {
  const ms = Math.round(new Date(iso).getTime() / bucketMs) * bucketMs;
  return new Date(ms).toISOString();
}

function mergeReadingsToRows(
  sensors: ObjectSensor[],
  telemetryQueries: { data?: AggregatedReading[] }[],
  bucketMs: number,
): ChartRow[] {
  const timeMap = new Map<string, ChartRow>();
  sensors.forEach((sensor, idx) => {
    const readings = telemetryQueries[idx].data;
    if (!readings) return;
    readings.forEach((r) => {
      const key = bucketTimeKey(r.time, bucketMs);
      if (!timeMap.has(key)) timeMap.set(key, { time: key });
      timeMap.get(key)![sensor.label] = r.value;
    });
  });
  return Array.from(timeMap.values()).sort(
    (a, b) => new Date(String(a.time)).getTime() - new Date(String(b.time)).getTime(),
  );
}

const rangeToWindow = (range: string, anchor: Date) => {
  const from = new Date(anchor);
  if (range === 'hour') {
    from.setHours(anchor.getHours() - 1);
    return { from, agg: 'raw' as const };
  }
  if (range === '12h') {
    from.setHours(anchor.getHours() - 12);
    return { from, agg: 'hour' as const };
  }
  if (range === 'day') {
    from.setDate(anchor.getDate() - 1);
    return { from, agg: 'hour' as const };
  }
  if (range === 'week') {
    from.setDate(anchor.getDate() - 7);
    return { from, agg: 'day' as const };
  }
  from.setDate(anchor.getDate() - 30);
  return { from, agg: 'day' as const };
};

function computeBaselines(
  rawChartData: ChartRow[],
  sensors: ObjectSensor[],
  stressStartedAt?: number,
): Map<string, number> {
  const map = new Map<string, number>();

  sensors.forEach((sensor) => {
    const values: number[] = [];

    if (stressStartedAt) {
      const preStart = stressStartedAt - 10 * 60_000;
      rawChartData.forEach((row) => {
        const t = new Date(String(row.time)).getTime();
        if (t >= preStart && t < stressStartedAt) {
          const v = row[sensor.label];
          if (typeof v === 'number') values.push(v);
        }
      });
    }

    if (!values.length && stressStartedAt) {
      const alignedStart = stressStartedAt;
      const earlyEnd = stressStartedAt + 30_000;
      rawChartData.forEach((row) => {
        const t = new Date(String(row.time)).getTime();
        if (t >= alignedStart && t <= earlyEnd) {
          const v = row[sensor.label];
          if (typeof v === 'number') values.push(v);
        }
      });
    }

    if (values.length) {
      map.set(sensor.label, values.reduce((a, b) => a + b, 0) / values.length);
    }
  });

  return map;
}

const SNAP_MS = 90_000;

const buildAnchorDate = (objectItem?: MonitoringObject) =>
  objectItem?.last_reading_at ? new Date(objectItem.last_reading_at) : new Date();

function resolveSensorLabel(anomaly: AnomalyMarker, sensors: ObjectSensor[]): string | undefined {
  const match = sensors.find(
    (s) =>
      s.category === anomaly.category
      || s.label === anomaly.sensor_label
      || s.id === anomaly.category,
  );
  return match?.label ?? anomaly.sensor_label ?? sensors[0]?.label;
}

function snapAnomalyToChart(
  anomaly: AnomalyMarker,
  sensorLabel: string | undefined,
  chartData: ChartRow[],
  percentMode: boolean,
): { chartTime: string; y: number } | null {
  if (!sensorLabel) return null;

  const target = new Date(anomaly.time).getTime();
  let bestRow: ChartRow | undefined;
  let bestDiff = Infinity;

  chartData.forEach((row) => {
    const diff = Math.abs(new Date(String(row.time)).getTime() - target);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestRow = row;
    }
  });

  const chartTime = bestRow && bestDiff <= SNAP_MS
    ? String(bestRow.time)
    : anomaly.time;

  if (bestRow && bestDiff <= SNAP_MS) {
    const snapped = bestRow[sensorLabel];
    if (typeof snapped === 'number') {
      return { chartTime, y: snapped };
    }
  }

  if (percentMode && anomaly.expected != null && anomaly.expected > 0) {
    return { chartTime, y: Math.round((anomaly.value / anomaly.expected) * 1000) / 10 };
  }

  if (!percentMode) {
    return { chartTime, y: anomaly.value };
  }

  return null;
}

interface ChartCanvasProps {
  chartData: ChartRow[];
  sensors: ObjectSensor[];
  hiddenSensors: Set<string>;
  isMobile: boolean;
  isLive: boolean;
  percentMode: boolean;
  yDomain: [number, number] | [string, string];
  stressStartX?: string;
  stressStartedAt?: number;
  stressPhase?: StressPhaseInfo;
  stressBands?: StressBand[];
  forecastNowTime?: string;
  forecastEndTime?: string;
  forecastZones?: ForecastZone[];
  forecastMarkers?: ForecastMarker[];
  showForecast?: boolean;
  plottedAnomalies: PlottedAnomaly[];
  onAnomalyClick: (anomaly: AnomalyMarker) => void;
}

const ChartCanvas = memo(function ChartCanvas({
  chartData,
  sensors,
  hiddenSensors,
  isMobile,
  isLive,
  percentMode,
  yDomain,
  stressStartX,
  stressStartedAt,
  stressPhase,
  stressBands,
  forecastNowTime,
  forecastEndTime,
  forecastZones,
  forecastMarkers,
  showForecast,
  plottedAnomalies,
  onAnomalyClick,
}: ChartCanvasProps) {
  return (
    <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={chartData} margin={{ top: 8, right: 8, left: -8, bottom: 4 }}>
          <CartesianGrid stroke="#d7e3e0" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="time"
            minTickGap={isMobile ? 48 : 36}
            tick={{ fontSize: isMobile ? 10 : 11 }}
            tickFormatter={(v) =>
              new Date(v).toLocaleString('ru-RU', {
                day: '2-digit',
                month: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
              })
            }
          />
          <YAxis
            unit={percentMode ? ' %' : ' Вт'}
            domain={yDomain}
            tick={{ fontSize: isMobile ? 10 : 11 }}
            width={isMobile ? 48 : 56}
          />
          <Tooltip
            contentStyle={{ borderRadius: 10, border: '1px solid rgba(13,40,24,0.1)' }}
            labelFormatter={(label, payload) => {
              const row = payload?.[0]?.payload as ChartRow | undefined;
              const prefix = row?.__forecast ? 'Прогноз · ' : row?.__now ? 'Сейчас · ' : '';
              return prefix + new Date(label).toLocaleString('ru-RU');
            }}
            formatter={(value, name, item) => {
              if (typeof value !== 'number') return [String(value), name];
              const payload = item?.payload as ChartRow | undefined;
              const isFc = String(name).endsWith(' (прогноз)');
              const baseName = isFc ? String(name).replace(' (прогноз)', '') : String(name);
              const wKey = `__w_${baseName}`;
              const w = payload?.[wKey];
              if (percentMode && typeof w === 'number') {
                return [`${value.toFixed(1)}% (${w.toFixed(0)} Вт)`, isFc ? `${baseName} (прогноз)` : baseName];
              }
              const suffix = payload?.__forecast ? ' · прогноз' : '';
              return [`${value.toFixed(1)}${percentMode ? '%' : ' Вт'}${suffix}`, name];
            }}
          />
          {!isMobile && !isLive && <Legend verticalAlign="top" wrapperStyle={{ fontSize: 12 }} />}

          {percentMode && (
            <ReferenceLine
              y={100}
              stroke="#64748b"
              strokeWidth={1.5}
              strokeDasharray="4 4"
              label={{ value: 'норма 100%', position: 'insideTopRight', fontSize: 10, fill: '#64748b' }}
            />
          )}

          {showForecast && forecastNowTime && forecastEndTime && (
            <ReferenceArea
              x1={forecastNowTime}
              x2={forecastEndTime}
              fill="#722ed1"
              fillOpacity={0.04}
              label={{ value: 'Прогноз ML · 30 дн.', position: 'insideTopRight', fontSize: 10, fill: '#722ed1' }}
            />
          )}

          {showForecast && forecastNowTime && (
            <ReferenceLine
              x={forecastNowTime}
              stroke="#141414"
              strokeWidth={2}
              strokeDasharray="4 2"
              label={{ value: 'сейчас', position: 'insideTopLeft', fontSize: 11, fill: '#141414', fontWeight: 600 }}
            />
          )}

          {showForecast && forecastZones?.map((zone, i) => (
            <ReferenceArea
              key={`fz-${zone.label}-${i}`}
              x1={zone.x1}
              x2={zone.x2}
              y1={zone.yLow}
              y2={zone.yHigh}
              fill={zone.fill}
              fillOpacity={zone.fillOpacity}
              label={{ value: zone.label, position: 'insideTop', fontSize: 9, fill: zone.fill }}
            />
          ))}

          {forecastMarkers?.map((m, i) => (
            <ReferenceDot
              key={`fm-${m.label}-${i}`}
              x={m.time}
              y={m.y}
              r={7}
              fill={m.fill}
              fillOpacity={0.35}
              stroke={m.fill}
              strokeWidth={2}
            />
          ))}

          {stressStartX && isLive && !showForecast && (
            <ReferenceLine
              x={stressStartX}
              stroke="#1677ff"
              strokeDasharray="3 3"
              label={{ value: 'стресс', position: 'insideTopLeft', fontSize: 10, fill: '#1677ff' }}
            />
          )}

          {stressBands?.map((band, i) => (
            <ReferenceArea
              key={`${band.x1}-${band.label}-${i}`}
              x1={band.x1}
              x2={band.x2}
              fill={band.fill}
              fillOpacity={band.fillOpacity}
              label={{ value: band.label, position: 'insideTop', fontSize: 9, fill: band.fill }}
            />
          ))}

          {stressStartedAt && isLive && stressPhase && !stressBands?.length && (
            <ReferenceArea
              x1={stressStartX}
              x2={chartData.length ? String(chartData[chartData.length - 1].time) : stressStartX}
              fill="#1677ff"
              fillOpacity={0.04}
            />
          )}

          {plottedAnomalies.map(({ anomaly, chartTime, y }) => (
            <ReferenceDot
              key={anomaly.id}
              x={chartTime}
              y={y}
              r={9}
              fill={SEVERITY_DOT[anomaly.severity] ?? '#999'}
              stroke="#fff"
              strokeWidth={2}
              style={{ cursor: 'pointer' }}
              onClick={() => onAnomalyClick(anomaly)}
            />
          ))}

          {sensors.map((sensor, index) => {
            if (hiddenSensors.has(sensor.id)) return null;
            const style = CHART_LINE_STYLES[index % CHART_LINE_STYLES.length];
            const hasSeries = chartData.some((row) => typeof row[sensor.label] === 'number');
            const hasFc = showForecast && chartData.some((row) => typeof row[`${sensor.label}__fc`] === 'number');
            if (!hasSeries && !hasFc) return null;
            return (
              <Fragment key={sensor.id}>
                {hasSeries && (
                  <Line
                    type="monotone"
                    dataKey={sensor.label}
                    stroke={style.stroke}
                    strokeWidth={style.strokeWidth}
                    strokeDasharray={style.strokeDasharray}
                    dot={false}
                    connectNulls={false}
                    activeDot={{ r: 4 }}
                    isAnimationActive={false}
                  />
                )}
                {hasFc && (
                  <Line
                    type="monotone"
                    dataKey={`${sensor.label}__fc`}
                    name={`${sensor.label} (прогноз)`}
                    stroke={style.stroke}
                    strokeWidth={style.strokeWidth * 0.85}
                    strokeDasharray="6 4"
                    strokeOpacity={0.75}
                    dot={false}
                    connectNulls
                    activeDot={{ r: 3 }}
                    isAnimationActive={false}
                  />
                )}
              </Fragment>
            );
          })}
        </ComposedChart>
    </ResponsiveContainer>
  );
});

const ConsumptionChart = ({
  objectItem,
  sensors,
  refetchInterval,
  anomalyMarkers = [],
  liveWindowMinutes = 30,
  stressPhase,
  stressStartedAt,
  stressStep,
}: ConsumptionChartProps) => {
  const screens = useBreakpoint();
  const isMobile = !screens.md;
  const isLive = !!refetchInterval;
  const percentMode = isLive;
  const [selectedRange, setSelectedRange] = useState('week');
  const [hiddenSensors, setHiddenSensors] = useState<Set<string>>(new Set());
  const [selectedAnomaly, setSelectedAnomaly] = useState<AnomalyMarker | null>(null);
  const frozenBaselinesRef = useRef<Map<string, number> | null>(null);
  const hasShownChartRef = useRef(false);
  const yDomainRef = useRef<[number, number]>([85, 115]);

  const handleAnomalyClick = useCallback((anomaly: AnomalyMarker) => {
    setSelectedAnomaly(anomaly);
  }, []);

  const handleModalClose = useCallback(() => {
    setSelectedAnomaly(null);
  }, []);

  useEffect(() => {
    if (isLive) setSelectedRange('hour');
  }, [isLive]);

  useEffect(() => {
    if (!isLive) {
      frozenBaselinesRef.current = null;
      hasShownChartRef.current = false;
      yDomainRef.current = [85, 115];
    }
  }, [isLive]);

  useEffect(() => {
    frozenBaselinesRef.current = null;
    yDomainRef.current = [85, 115];
  }, [stressStartedAt]);

  const to = buildAnchorDate(objectItem);

  const { from, agg } = useMemo(() => {
    if (isLive) return { from: new Date(), agg: 'raw' as const };
    return rangeToWindow(selectedRange, to);
  }, [isLive, selectedRange, to]);

  const toIso = to.toISOString();
  const fromIso = from.toISOString();

  const telemetryQueries = useQueries({
    queries: sensors.map((sensor) => {
      if (isLive) {
        return {
          queryKey: ['telemetry', sensor.id, 'live', liveWindowMinutes, agg],
          queryFn: () => {
            const now = new Date();
            const windowFrom = new Date(now.getTime() - liveWindowMinutes * 60_000);
            return fetchTelemetry(
              sensor.id,
              windowFrom.toISOString(),
              now.toISOString(),
              agg,
            );
          },
          enabled: !!sensor.id,
          refetchInterval: refetchInterval ?? false,
          placeholderData: keepPreviousData,
        };
      }
      return {
        queryKey: ['telemetry', sensor.id, fromIso, toIso, agg, 'static'],
        queryFn: () => fetchTelemetry(sensor.id, fromIso, toIso, agg),
        enabled: !!sensor.id,
        refetchInterval: false as const,
      };
    }),
  });

  const isInitialLoading = telemetryQueries.some((q) => q.isLoading && !q.data);
  const hasError = telemetryQueries.some((q) => q.error);
  const visibleSensors = useMemo(
    () => sensors.filter((s) => !hiddenSensors.has(s.id)),
    [sensors, hiddenSensors],
  );

  const rawChartData = useMemo(
    () => mergeReadingsToRows(
      sensors,
      telemetryQueries,
      isLive ? LIVE_BUCKET_MS : 60_000,
    ),
    [sensors, telemetryQueries, isLive],
  );

  const baselines = useMemo(() => {
    if (!percentMode || !rawChartData.length) return new Map<string, number>();

    if (frozenBaselinesRef.current?.size) {
      return frozenBaselinesRef.current;
    }

    const map = computeBaselines(rawChartData, sensors, stressStartedAt);
    const allReady = sensors.every((s) => map.has(s.label));

    if (stressStartedAt && allReady) {
      frozenBaselinesRef.current = map;
    }
    return map;
  }, [rawChartData, sensors, percentMode, stressStartedAt]);

  const chartData = useMemo(() => {
    if (!percentMode) return rawChartData;
    return rawChartData.map((row) => {
      const next: ChartRow = { time: row.time };
      sensors.forEach((sensor) => {
        const v = row[sensor.label];
        const base = baselines.get(sensor.label);
        if (typeof v === 'number' && base && base > 0) {
          next[sensor.label] = Math.round((v / base) * 1000) / 10;
          next[`__w_${sensor.label}`] = v;
        } else {
          next[sensor.label] = null;
        }
      });
      return next;
    });
  }, [rawChartData, sensors, percentMode, baselines]);

  const showForecast = isLive && stressStartedAt != null && stressStep != null;

  const forecastBundle = useMemo(() => {
    if (!showForecast || stressStep == null) {
      return null;
    }
    return buildForecastExtension(sensors, chartData, stressStep);
  }, [showForecast, sensors, chartData, stressStep]);

  const displayChartData = useMemo(() => {
    if (!forecastBundle?.rows.length) return chartData;
    return mergeActualAndForecast(chartData, forecastBundle.rows);
  }, [chartData, forecastBundle]);

  const plottedAnomalies = useMemo((): PlottedAnomaly[] => {
    return anomalyMarkers.flatMap((anomaly) => {
      const sensorLabel = resolveSensorLabel(anomaly, sensors);
      const snapped = snapAnomalyToChart(anomaly, sensorLabel, displayChartData, percentMode);
      if (!snapped) return [];
      return [{ anomaly, chartTime: snapped.chartTime, y: snapped.y }];
    });
  }, [anomalyMarkers, sensors, displayChartData, percentMode]);

  const stats = useMemo(() => {
    const values: number[] = [];
    displayChartData.forEach((row) => {
      visibleSensors.forEach((s) => {
        const v = row[s.label];
        const fc = row[`${s.label}__fc`];
        if (typeof v === 'number') values.push(v);
        if (typeof fc === 'number') values.push(fc);
      });
    });
    if (!values.length) return null;
    return {
      min: Math.min(...values),
      max: Math.max(...values),
      count: displayChartData.length,
    };
  }, [displayChartData, visibleSensors]);

  const stressStartX = useMemo(() => {
    if (!stressStartedAt || !displayChartData.length) return undefined;
    const key = bucketTimeKey(new Date(stressStartedAt).toISOString(), LIVE_BUCKET_MS);
    const exact = displayChartData.find((r) => String(r.time) === key);
    if (exact) return String(exact.time);
    let best = String(displayChartData[0].time);
    let bestDiff = Infinity;
    displayChartData.forEach((row) => {
      if (row.__forecast) return;
      const d = Math.abs(new Date(String(row.time)).getTime() - stressStartedAt);
      if (d < bestDiff) {
        bestDiff = d;
        best = String(row.time);
      }
    });
    return best;
  }, [stressStartedAt, displayChartData]);

  const stressBands = useMemo(() => {
    if (!stressStartedAt || stressStep == null || !isLive) return undefined;
    return computeStressBands(stressStartedAt, stressStep);
  }, [stressStartedAt, stressStep, isLive]);

  const yDomain: [number, number] | [string, string] = useMemo(() => {
    if (!percentMode || !stats) return ['dataMin - 5', 'dataMax + 5'];
    const nextLo = Math.max(0, Math.floor(stats.min / 5) * 5 - 5);
    const nextHi = Math.min(200, Math.ceil(stats.max / 5) * 5 + 5);
    const [curLo, curHi] = yDomainRef.current;
    const lo = isLive ? Math.min(curLo, nextLo) : nextLo;
    const hi = isLive ? Math.max(curHi, Math.max(nextHi, lo + 20)) : Math.max(nextHi, nextLo + 20);
    if (isLive) {
      yDomainRef.current = [lo, hi];
    }
    return [lo, hi];
  }, [percentMode, stats, isLive]);

  const toggleSensor = (id: string) => {
    setHiddenSensors((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const rangeControl = isMobile ? (
    <Select
      size="small"
      value={selectedRange}
      onChange={setSelectedRange}
      disabled={isLive}
      options={RANGE_OPTIONS}
      style={{ minWidth: 100 }}
    />
  ) : (
    <Segmented
      size="small"
      options={RANGE_OPTIONS}
      value={selectedRange}
      onChange={(v) => setSelectedRange(String(v))}
      disabled={isLive}
    />
  );

  if (isInitialLoading) return <div className="chart-loading"><Spin size="large" /></div>;
  if (hasError) return <Alert type="error" message="Не удалось загрузить временной ряд" showIcon />;

  if (!sensors.length || !rawChartData.length) {
    return (
      <Card className="surface-card chart-card" title="Потребление">
        <Empty description="Нет данных телеметрии. Запустите: python scripts/seed_demo.py" />
      </Card>
    );
  }

  const forecastEndTime = forecastBundle?.rows.length
    ? String(forecastBundle.rows[forecastBundle.rows.length - 1].time)
    : undefined;

  const hasPlottableData = displayChartData.some((row) =>
    sensors.some((s) => typeof row[s.label] === 'number'),
  );

  if (hasPlottableData) {
    hasShownChartRef.current = true;
  }

  if (percentMode && !hasPlottableData && !hasShownChartRef.current) {
    return (
      <Card className="surface-card chart-card" title="Потребление — live (% от нормы)">
        <div className="chart-loading"><Spin tip="Сбор базовой линии…" /></div>
      </Card>
    );
  }

  const chartHeight = isMobile ? CHART_HEIGHT_MOBILE : CHART_HEIGHT;

  return (
    <>
      <Card
        className="surface-card chart-card chart-card--stable"
        title={percentMode
          ? showForecast
            ? 'Потребление — факт ← · → прогноз ML'
            : 'Потребление — live (% от нормы)'
          : `Потребление — ${RANGE_LABELS[selectedRange] ?? selectedRange}`}
        extra={!isMobile ? rangeControl : undefined}
      >
        {isMobile && (
          <div className="chart-card__controls">{rangeControl}</div>
        )}

        <div className="chart-card__meta chart-card__meta--stable">
          <Text type="secondary" className="chart-card__meta-text">
            {isLive
              ? `Live · ${liveWindowMinutes} мин · ${agg}`
              : `${from.toLocaleDateString('ru-RU')} — ${to.toLocaleDateString('ru-RU')} · ${agg}`}
            {stressPhase && ` · Фаза ${stressPhase.phase}/${stressPhase.total} · ${stressPhase.label}`}
            {stats && (
              percentMode
                ? ` · min ${stats.min.toFixed(0)}% / max ${stats.max.toFixed(0)}%`
                : ` · min ${stats.min.toFixed(0)} / max ${stats.max.toFixed(0)} Вт`
            )}
            {showForecast
              ? ' · слева факт · справа прогноз 30 дн. (сжато)'
              : ''}
            {plottedAnomalies.length > 0
              ? ` · ${plottedAnomalies.length} аномал. — клик по точке`
              : stressStartedAt && isLive && !showForecast
                ? ' · зоны: 7д прогноз → 2д сигнал → ✓'
                : '\u00A0'}
          </Text>
        </div>

        {isLive && (
          <div className="chart-card__legend-toggle chart-card__legend-toggle--stable">
            {sensors.map((sensor) => (
              <Checkbox
                key={sensor.id}
                checked={!hiddenSensors.has(sensor.id)}
                onChange={() => toggleSensor(sensor.id)}
                style={{ marginRight: 12, fontSize: 12 }}
              >
                {sensor.label}
              </Checkbox>
            ))}
          </div>
        )}

        {showForecast && forecastBundle?.upcoming.length ? (
          <div className="chart-forecast-legend">
            {forecastBundle.upcoming.map((ev) => (
              <span
                key={ev.id}
                className="chart-forecast-legend__item"
                style={{ borderColor: ev.cycle?.fill ?? '#1677ff' }}
                title={`${ev.label}: ${ev.magnitudePct}% · ${formatForecastDuration(ev.durationDays)}`}
              >
                <strong>{ev.horizonDays}д</strong> {ev.label}
                <Text type="secondary" style={{ fontSize: 10, marginLeft: 4 }}>
                  {ev.pattern === 'oscillation' ? `±${ev.magnitudeSwing}%` : `${ev.magnitudePct}%`}
                  {' · '}{formatForecastDuration(ev.durationDays)}
                </Text>
              </span>
            ))}
          </div>
        ) : null}

        <div className="chart-shell" style={{ height: chartHeight }}>
          <ChartCanvas
            chartData={displayChartData}
            sensors={sensors}
            hiddenSensors={hiddenSensors}
            isMobile={isMobile}
            isLive={isLive}
            percentMode={percentMode}
            yDomain={yDomain}
            stressStartX={stressStartX}
            stressStartedAt={stressStartedAt}
            stressPhase={stressPhase}
            stressBands={showForecast ? undefined : stressBands}
            forecastNowTime={forecastBundle?.nowTime}
            forecastEndTime={forecastEndTime}
            forecastZones={forecastBundle?.zones}
            forecastMarkers={forecastBundle?.markers}
            showForecast={showForecast}
            plottedAnomalies={plottedAnomalies}
            onAnomalyClick={handleAnomalyClick}
          />
        </div>
      </Card>

      <AnomalyDetailModal
        anomaly={selectedAnomaly}
        open={selectedAnomaly != null}
        onClose={handleModalClose}
      />
    </>
  );
};

export default memo(ConsumptionChart);
