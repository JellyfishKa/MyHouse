import { memo, useMemo, useState } from 'react';
import { Alert, Card, Segmented, Spin, Typography } from 'antd';
import { useQueries } from '@tanstack/react-query';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  fetchTelemetry,
  type AggregatedReading,
  type MonitoringObject,
  type ObjectSensor,
} from '../api/hooks';

const { Text } = Typography;

interface ConsumptionChartProps {
  objectItem?: MonitoringObject;
  sensors: ObjectSensor[];
  refetchInterval?: number | false;
}

type ChartRow = Record<string, number | string | null>;

const RANGE_OPTIONS = [
  { label: '1 час',    value: 'hour'  },
  { label: '12 часов', value: '12h'   },
  { label: '1 день',   value: 'day'   },
  { label: '7 дней',   value: 'week'  },
];

const RANGE_LABELS: Record<string, string> = {
  hour:  '1 час',
  '12h': '12 часов',
  day:   '24 часа',
  week:  '7 дней',
  month: '30 дней',
};

// Уникальные стиль + цвет для каждой линии сенсора
const CHART_LINE_STYLES = [
  { stroke: '#0f766e', strokeDasharray: undefined,       strokeWidth: 2.4 },
  { stroke: '#f97316', strokeDasharray: '8 3',           strokeWidth: 2.2 },
  { stroke: '#2563eb', strokeDasharray: '3 3',           strokeWidth: 2.0 },
  { stroke: '#7c3aed', strokeDasharray: '10 4 2 4',      strokeWidth: 2.2 },
  { stroke: '#ea580c', strokeDasharray: '5 2',           strokeWidth: 2.0 },
  { stroke: '#0891b2', strokeDasharray: '12 3',          strokeWidth: 2.2 },
  { stroke: '#16a34a', strokeDasharray: '6 2 2 2',       strokeWidth: 2.0 },
  { stroke: '#db2777', strokeDasharray: '4 4',           strokeWidth: 2.2 },
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
  // month
  from.setDate(anchor.getDate() - 30);
  return { from, agg: 'day' as const };
};

const buildAnchorDate = (objectItem?: MonitoringObject) =>
  objectItem?.last_reading_at ? new Date(objectItem.last_reading_at) : new Date();

// Мок-данные: каждый «сенсор» имеет свою фазу и амплитуду синусоиды
const MOCK_SENSORS = [
  { label: 'Серверы (демо)',    base: 220, amp: 40, phase: 0.0 },
  { label: 'Охлаждение (демо)', base: 185, amp: 25, phase: 1.5 },
  { label: 'ИБП (демо)',        base: 160, amp: 15, phase: 3.1 },
];

const generateMockData = (): ChartRow[] =>
  Array.from({ length: 30 }, (_, i) => {
    const row: ChartRow = {
      time: new Date(Date.now() - (29 - i) * 24 * 3_600_000).toISOString(),
    };
    MOCK_SENSORS.forEach(({ label, base, amp, phase }) => {
      row[label] = parseFloat((base + Math.sin(i / 4 + phase) * amp + Math.random() * 8).toFixed(2));
    });
    return row;
  });

const ConsumptionChart = ({ objectItem, sensors, refetchInterval }: ConsumptionChartProps) => {
  const [selectedRange, setSelectedRange] = useState('week');

  const to = useMemo(
    () => (refetchInterval ? new Date() : buildAnchorDate(objectItem)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [objectItem, refetchInterval],
  );

  const { from, agg } = useMemo(() => rangeToWindow(selectedRange, to), [selectedRange, to]);

  const queryKeys = useMemo(
    () => sensors.map((sensor) => ['telemetry', sensor.id, from.toISOString(), agg, refetchInterval ? 'live' : 'static']),
    [sensors, from, agg, refetchInterval],
  );

  const telemetryQueries = useQueries({
    queries: sensors.map((sensor, i) => ({
      queryKey: queryKeys[i],
      queryFn: () => fetchTelemetry(sensor.id, from.toISOString(), new Date().toISOString(), agg),
      enabled: !!sensor.id,
      refetchInterval: refetchInterval ?? false,
    })),
  });

  const isLoading = telemetryQueries.some((q) => q.isLoading);
  const hasError   = telemetryQueries.some((q) => q.error);

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

  const useMock = !sensors.length || !chartData.length;
  const displayData = useMock ? generateMockData() : chartData;

  if (isLoading) return <div className="chart-loading"><Spin size="large" /></div>;
  if (hasError)  return <Alert type="error" message="Не удалось загрузить временной ряд" showIcon />;

  const mockSensorNames = MOCK_SENSORS.map((s) => s.label);
  const activeSensorNames = useMock ? mockSensorNames : sensors.map((s) => s.label);

  return (
    <Card
      className="surface-card"
      title={`Потребление — ${RANGE_LABELS[selectedRange] ?? selectedRange}`}
      extra={
        <Segmented
          options={RANGE_OPTIONS}
          value={selectedRange}
          onChange={(v) => setSelectedRange(String(v))}
        />
      }
    >
      <div className="chart-card__meta">
        <Text type="secondary">
          {useMock
            ? 'Демо-данные (реальные сенсоры не подключены)'
            : `Интервал до ${to.toLocaleString('ru-RU')} · агрегация: ${agg}`}
        </Text>
      </div>

      <div className="chart-shell">
        <ResponsiveContainer>
          <LineChart data={displayData} margin={{ top: 8, right: 12, left: 0, bottom: 8 }}>
            <CartesianGrid stroke="#d7e3e0" strokeDasharray="3 3" />
            <XAxis
              dataKey="time"
              minTickGap={36}
              tickFormatter={(v) =>
                new Date(v).toLocaleString('ru-RU', {
                  day: '2-digit', month: '2-digit',
                  hour: '2-digit', minute: '2-digit',
                })
              }
            />
            <YAxis />
            <Tooltip
              labelFormatter={(label) => new Date(label).toLocaleString('ru-RU')}
              formatter={(value) => (typeof value === 'number' ? value.toFixed(3) : String(value))}
            />
            <Legend verticalAlign="top" />

            {activeSensorNames.map((name, index) => {
              const style = CHART_LINE_STYLES[index % CHART_LINE_STYLES.length];
              return (
                <Line
                  key={name}
                  type="monotone"
                  dataKey={name}
                  stroke={style.stroke}
                  strokeWidth={style.strokeWidth}
                  strokeDasharray={style.strokeDasharray}
                  dot={false}
                  activeDot={{ r: 4 }}
                  isAnimationActive={false}
                />
              );
            })}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
};

export default memo(ConsumptionChart);
