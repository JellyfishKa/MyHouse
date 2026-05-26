import { memo, useEffect, useMemo, useState } from 'react';
import { Alert, Card, Checkbox, Empty, Grid, Select, Segmented, Spin, Typography } from 'antd';
import { useQueries } from '@tanstack/react-query';
import {
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
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
}

type ChartRow = Record<string, number | string | null>;

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

const SNAP_MS = 90_000;

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

const liveWindow = (anchor: Date, minutes: number) => {
  const from = new Date(anchor);
  from.setMinutes(anchor.getMinutes() - minutes);
  return { from, agg: 'minute' as const };
};

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
  anomalyTime: string,
  sensorLabel: string | undefined,
  chartData: ChartRow[],
): { chartTime: string; y?: number } {
  if (!chartData.length || !sensorLabel) return { chartTime: anomalyTime };

  const target = new Date(anomalyTime).getTime();
  let bestRow: ChartRow | undefined;
  let bestDiff = Infinity;

  chartData.forEach((row) => {
    const diff = Math.abs(new Date(String(row.time)).getTime() - target);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestRow = row;
    }
  });

  if (!bestRow || bestDiff > SNAP_MS) return { chartTime: anomalyTime };

  const y = bestRow[sensorLabel];
  return {
    chartTime: String(bestRow.time),
    y: typeof y === 'number' ? y : undefined,
  };
}

const ConsumptionChart = ({
  objectItem,
  sensors,
  refetchInterval,
  anomalyMarkers = [],
  liveWindowMinutes = 30,
  stressPhase,
}: ConsumptionChartProps) => {
  const screens = useBreakpoint();
  const isMobile = !screens.md;
  const isLive = !!refetchInterval;
  const percentMode = isLive;
  const [selectedRange, setSelectedRange] = useState('week');
  const [hiddenSensors, setHiddenSensors] = useState<Set<string>>(new Set());
  const [selectedAnomaly, setSelectedAnomaly] = useState<AnomalyMarker | null>(null);

  useEffect(() => {
    if (isLive) setSelectedRange('hour');
  }, [isLive]);

  const to = useMemo(
    () => (isLive ? new Date() : buildAnchorDate(objectItem)),
    [objectItem, isLive],
  );

  const { from, agg } = useMemo(() => {
    if (isLive) return liveWindow(to, liveWindowMinutes);
    return rangeToWindow(selectedRange, to);
  }, [isLive, liveWindowMinutes, selectedRange, to]);

  const toIso = to.toISOString();
  const fromIso = from.toISOString();

  const visibleSensors = useMemo(
    () => sensors.filter((s) => !hiddenSensors.has(s.id)),
    [sensors, hiddenSensors],
  );

  const telemetryQueries = useQueries({
    queries: sensors.map((sensor) => ({
      queryKey: ['telemetry', sensor.id, fromIso, toIso, agg, isLive ? 'live' : 'static'],
      queryFn: () => fetchTelemetry(sensor.id, fromIso, toIso, agg),
      enabled: !!sensor.id,
      refetchInterval: refetchInterval ?? false,
    })),
  });

  const isLoading = telemetryQueries.some((q) => q.isLoading);
  const hasError = telemetryQueries.some((q) => q.error);

  const rawChartData = useMemo(() => {
    const timeMap = new Map<string, ChartRow>();
    sensors.forEach((sensor, idx) => {
      const readings = telemetryQueries[idx].data as AggregatedReading[] | undefined;
      if (!readings) return;
      readings.forEach((r) => {
        if (!timeMap.has(r.time)) timeMap.set(r.time, { time: r.time });
        timeMap.get(r.time)![sensor.label] = r.value;
      });
    });
    return Array.from(timeMap.values()).sort(
      (a, b) => new Date(String(a.time)).getTime() - new Date(String(b.time)).getTime(),
    );
  }, [sensors, telemetryQueries]);

  const baselines = useMemo(() => {
    const map = new Map<string, number>();
    if (!percentMode || !rawChartData.length) return map;

    const baselineEnd = new Date(String(rawChartData[0].time)).getTime() + 5 * 60_000;
    sensors.forEach((sensor) => {
      const values: number[] = [];
      rawChartData.forEach((row) => {
        if (new Date(String(row.time)).getTime() > baselineEnd) return;
        const v = row[sensor.label];
        if (typeof v === 'number') values.push(v);
      });
      if (values.length) {
        map.set(sensor.label, values.reduce((a, b) => a + b, 0) / values.length);
      }
    });
    return map;
  }, [rawChartData, sensors, percentMode]);

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

  const plottedAnomalies = useMemo((): PlottedAnomaly[] => {
    return anomalyMarkers.flatMap((anomaly) => {
      const sensorLabel = resolveSensorLabel(anomaly, sensors);
      const { chartTime, y } = snapAnomalyToChart(anomaly.time, sensorLabel, chartData);
      if (y == null) return [];
      return [{ anomaly, chartTime, y }];
    });
  }, [anomalyMarkers, sensors, chartData]);

  const stats = useMemo(() => {
    const values: number[] = [];
    chartData.forEach((row) => {
      visibleSensors.forEach((s) => {
        const v = row[s.label];
        if (typeof v === 'number') values.push(v);
      });
    });
    if (!values.length) return null;
    return {
      min: Math.min(...values),
      max: Math.max(...values),
      count: chartData.length,
    };
  }, [chartData, visibleSensors]);

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

  if (isLoading) return <div className="chart-loading"><Spin size="large" /></div>;
  if (hasError) return <Alert type="error" message="Не удалось загрузить временной ряд" showIcon />;

  if (!sensors.length || !chartData.length) {
    return (
      <Card className="surface-card chart-card" title="Потребление">
        <Empty description="Нет данных телеметрии. Запустите: python scripts/seed_demo.py" />
      </Card>
    );
  }

  const yDomain: [number | string, number | string] = percentMode
    ? [70, 160]
    : ['dataMin - 5', 'dataMax + 5'];

  return (
    <>
      <Card
        className="surface-card chart-card"
        title={percentMode ? 'Потребление — live (% от нормы)' : `Потребление — ${RANGE_LABELS[selectedRange] ?? selectedRange}`}
        extra={!isMobile ? rangeControl : undefined}
      >
        {isMobile && (
          <div className="chart-card__controls">{rangeControl}</div>
        )}

        <div className="chart-card__meta">
          <Text type="secondary">
            {isLive
              ? `Live · ${liveWindowMinutes} мин · ${agg}`
              : `${from.toLocaleDateString('ru-RU')} — ${to.toLocaleDateString('ru-RU')} · ${agg}`}
            {stressPhase && ` · Фаза ${stressPhase.phase}/${stressPhase.total} · ${stressPhase.label}`}
            {stats && (
              percentMode
                ? ` · min ${stats.min.toFixed(0)}% / max ${stats.max.toFixed(0)}%`
                : ` · min ${stats.min.toFixed(0)} / max ${stats.max.toFixed(0)} Вт`
            )}
            {plottedAnomalies.length > 0 && ' · клик по точке — детали аномалии'}
          </Text>
        </div>

        {isLive && (
          <div className="chart-card__legend-toggle" style={{ marginBottom: 8 }}>
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

        <div className="chart-shell">
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
                labelFormatter={(label) => new Date(label).toLocaleString('ru-RU')}
                formatter={(value, name, item) => {
                  if (typeof value !== 'number') return [String(value), name];
                  const payload = item?.payload as ChartRow | undefined;
                  const wKey = `__w_${String(name)}`;
                  const w = payload?.[wKey];
                  if (percentMode && typeof w === 'number') {
                    return [`${value.toFixed(1)}% (${w.toFixed(0)} Вт)`, name];
                  }
                  return [`${value.toFixed(1)}${percentMode ? '%' : ' Вт'}`, name];
                }}
              />
              {!isMobile && <Legend verticalAlign="top" wrapperStyle={{ fontSize: 12 }} />}

              {percentMode && (
                <ReferenceLine
                  y={100}
                  stroke="#94a3b8"
                  strokeDasharray="4 4"
                  label={{ value: '100%', position: 'insideTopRight', fontSize: 10 }}
                />
              )}

              {plottedAnomalies.map(({ anomaly, chartTime, y }) => (
                <ReferenceDot
                  key={anomaly.id}
                  x={chartTime}
                  y={y}
                  r={7}
                  fill={SEVERITY_DOT[anomaly.severity] ?? '#999'}
                  stroke="#fff"
                  strokeWidth={2}
                  style={{ cursor: 'pointer' }}
                  onClick={() => setSelectedAnomaly(anomaly)}
                />
              ))}

              {sensors.map((sensor, index) => {
                if (hiddenSensors.has(sensor.id)) return null;
                const style = CHART_LINE_STYLES[index % CHART_LINE_STYLES.length];
                return (
                  <Line
                    key={sensor.id}
                    type="monotone"
                    dataKey={sensor.label}
                    stroke={style.stroke}
                    strokeWidth={style.strokeWidth}
                    strokeDasharray={style.strokeDasharray}
                    dot={false}
                    activeDot={{ r: 4 }}
                    isAnimationActive={false}
                  />
                );
              })}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <AnomalyDetailModal
        anomaly={selectedAnomaly}
        open={!!selectedAnomaly}
        onClose={() => setSelectedAnomaly(null)}
      />
    </>
  );
};

export default memo(ConsumptionChart);
