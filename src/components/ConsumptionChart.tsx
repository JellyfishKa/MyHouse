import { memo, useEffect, useMemo, useState } from 'react';
import { Alert, Card, Empty, Segmented, Spin, Typography } from 'antd';
import { useQueries } from '@tanstack/react-query';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
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
  { label: '1 час', value: 'hour' },
  { label: '12 часов', value: '12h' },
  { label: '1 день', value: 'day' },
  { label: '7 дней', value: 'week' },
  { label: '30 дней', value: 'month' },
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
  { stroke: '#ea580c', strokeDasharray: '5 2', strokeWidth: 2.0 },
  { stroke: '#0891b2', strokeDasharray: '12 3', strokeWidth: 2.2 },
  { stroke: '#16a34a', strokeDasharray: '6 2 2 2', strokeWidth: 2.0 },
  { stroke: '#db2777', strokeDasharray: '4 4', strokeWidth: 2.2 },
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

const ConsumptionChart = ({
  objectItem,
  sensors,
  refetchInterval,
  anomalyMarkers = [],
}: ConsumptionChartProps) => {
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

  if (isLoading) return <div className="chart-loading"><Spin size="large" /></div>;
  if (hasError) return <Alert type="error" message="Не удалось загрузить временной ряд" showIcon />;

  if (!sensors.length || !chartData.length) {
    return (
      <Card className="surface-card" title="Потребление">
        <Empty description="Нет данных телеметрии. Запустите: python scripts/seed_demo.py" />
      </Card>
    );
  }

  const firstSensorLabel = sensors[0]?.label;

  return (
    <Card
      className="surface-card"
      title={`Потребление — ${RANGE_LABELS[selectedRange] ?? selectedRange}`}
      extra={
        <Segmented
          options={RANGE_OPTIONS}
          value={selectedRange}
          onChange={(v) => setSelectedRange(String(v))}
          disabled={isLive}
        />
      }
    >
      <div className="chart-card__meta">
        <Text type="secondary">
          {isLive
            ? `Live · raw · до ${to.toLocaleString('ru-RU')}`
            : `Интервал ${from.toLocaleString('ru-RU')} — ${to.toLocaleString('ru-RU')} · агрегация: ${agg}`}
          {stats && ` · точек: ${stats.count} · min ${stats.min.toFixed(1)} / max ${stats.max.toFixed(1)} Вт`}
        </Text>
      </div>

      <div className="chart-shell">
        <ResponsiveContainer>
          <LineChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 8 }}>
            <CartesianGrid stroke="#d7e3e0" strokeDasharray="3 3" />
            <XAxis
              dataKey="time"
              minTickGap={36}
              tickFormatter={(v) =>
                new Date(v).toLocaleString('ru-RU', {
                  day: '2-digit',
                  month: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit',
                })
              }
            />
            <YAxis unit=" Вт" />
            <Tooltip
              labelFormatter={(label) => new Date(label).toLocaleString('ru-RU')}
              formatter={(value, name) => [
                typeof value === 'number' ? `${value.toFixed(2)} Вт` : String(value),
                name,
              ]}
            />
            <Legend verticalAlign="top" />

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

            {firstSensorLabel && anomalyMarkers.map((m, i) => (
              <ReferenceDot
                key={`${m.time}-${m.severity}-${i}`}
                x={m.time}
                y={chartData.find((r) => r.time === m.time)?.[firstSensorLabel] as number | undefined}
                r={6}
                fill={SEVERITY_DOT[m.severity] ?? '#999'}
                stroke="#fff"
                strokeWidth={1}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
};

export default memo(ConsumptionChart);
