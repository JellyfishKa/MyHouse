import { memo, useEffect, useMemo, useState } from 'react';
import { Alert, Card, Empty, Grid, Select, Segmented, Spin, Typography } from 'antd';
import { useQueries } from '@tanstack/react-query';
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  fetchTelemetry,
  type AggregatedReading,
  type AnomalyRecord,
  type MonitoringObject,
  type ObjectSensor,
} from '../api/hooks';

const { Text } = Typography;
const { useBreakpoint } = Grid;

export interface AnomalyMarker {
  time: string;
  severity: AnomalyRecord['severity'];
}

interface ConsumptionChartProps {
  objectItem?: MonitoringObject;
  sensors: ObjectSensor[];
  refetchInterval?: number | false;
  anomalyMarkers?: AnomalyMarker[];
}

type ChartRow = Record<string, number | string | null>;

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

const buildAnchorDate = (objectItem?: MonitoringObject) =>
  objectItem?.last_reading_at ? new Date(objectItem.last_reading_at) : new Date();

const findNearestY = (chartData: ChartRow[], time: string, key: string): number | undefined => {
  const target = new Date(time).getTime();
  let best: ChartRow | undefined;
  let bestDiff = Infinity;
  chartData.forEach((row) => {
    const diff = Math.abs(new Date(String(row.time)).getTime() - target);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = row;
    }
  });
  const v = best?.[key];
  return typeof v === 'number' ? v : undefined;
};

const ConsumptionChart = ({
  objectItem,
  sensors,
  refetchInterval,
  anomalyMarkers = [],
}: ConsumptionChartProps) => {
  const screens = useBreakpoint();
  const isMobile = !screens.md;
  const isLive = !!refetchInterval;
  const [selectedRange, setSelectedRange] = useState('week');

  useEffect(() => {
    if (isLive) setSelectedRange('hour');
  }, [isLive]);

  const to = useMemo(
    () => (isLive ? new Date() : buildAnchorDate(objectItem)),
    [objectItem, isLive],
  );

  const { from, agg } = useMemo(() => rangeToWindow(selectedRange, to), [selectedRange, to]);
  const toIso = to.toISOString();
  const fromIso = from.toISOString();

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

  const chartData = useMemo(() => {
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

  const stats = useMemo(() => {
    const values: number[] = [];
    chartData.forEach((row) => {
      sensors.forEach((s) => {
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
  }, [chartData, sensors]);

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

  const primarySensor = sensors[0]?.label;

  return (
    <Card
      className="surface-card chart-card"
      title={`Потребление — ${RANGE_LABELS[selectedRange] ?? selectedRange}`}
      extra={!isMobile ? rangeControl : undefined}
    >
      {isMobile && (
        <div className="chart-card__controls">{rangeControl}</div>
      )}

      <div className="chart-card__meta">
        <Text type="secondary">
          {isLive
            ? `Live · до ${to.toLocaleString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`
            : `${from.toLocaleDateString('ru-RU')} — ${to.toLocaleDateString('ru-RU')} · ${agg}`}
          {stats && ` · min ${stats.min.toFixed(0)} / max ${stats.max.toFixed(0)} Вт`}
        </Text>
      </div>

      <div className="chart-shell">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 8, right: 8, left: -8, bottom: 4 }}>
            <defs>
              <linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#0f766e" stopOpacity={0.25} />
                <stop offset="100%" stopColor="#0f766e" stopOpacity={0.02} />
              </linearGradient>
            </defs>
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
            <YAxis unit=" Вт" tick={{ fontSize: isMobile ? 10 : 11 }} width={isMobile ? 48 : 56} />
            <Tooltip
              contentStyle={{ borderRadius: 10, border: '1px solid rgba(13,40,24,0.1)' }}
              labelFormatter={(label) => new Date(label).toLocaleString('ru-RU')}
              formatter={(value, name) => [
                typeof value === 'number' ? `${value.toFixed(1)} Вт` : String(value),
                name,
              ]}
            />
            {!isMobile && <Legend verticalAlign="top" wrapperStyle={{ fontSize: 12 }} />}

            {primarySensor && (
              <Area
                type="monotone"
                dataKey={primarySensor}
                stroke="none"
                fill="url(#chartFill)"
                isAnimationActive={false}
                legendType="none"
              />
            )}

            {sensors.map((sensor, index) => {
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

            {primarySensor && anomalyMarkers.map((m, i) => (
              <ReferenceDot
                key={`${m.time}-${m.severity}-${i}`}
                x={m.time}
                y={findNearestY(chartData, m.time, primarySensor)}
                r={5}
                fill={SEVERITY_DOT[m.severity] ?? '#999'}
                stroke="#fff"
                strokeWidth={2}
              />
            ))}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
};

export default memo(ConsumptionChart);
