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
import { fetchTelemetry, type AggregatedReading, type MonitoringObject, type ObjectSensor } from '../api/hooks';

const { Text } = Typography;

const CHART_COLORS = ['#0f766e', '#f97316', '#2563eb', '#7c3aed', '#ea580c', '#0891b2'];

interface ConsumptionChartProps {
  objectItem?: MonitoringObject;
  sensors: ObjectSensor[];
}

type ChartRow = Record<string, number | string | null>;

const RANGE_OPTIONS = [
  { label: '1 час', value: 'hour' },
  { label: '1 день', value: 'day' },
  { label: '7 дней', value: 'week' },
];

const rangeToWindow = (range: string, anchor: Date) => {
  const from = new Date(anchor);

  if (range === 'hour') {
    from.setHours(anchor.getHours() - 1);
    return { from, agg: 'raw' as const };
  }

  if (range === 'day') {
    from.setDate(anchor.getDate() - 1);
    return { from, agg: 'hour' as const };
  }

  from.setDate(anchor.getDate() - 7);
  return { from, agg: 'day' as const };
};

const buildAnchorDate = (objectItem?: MonitoringObject) =>
  objectItem?.last_reading_at ? new Date(objectItem.last_reading_at) : new Date();

const MOCK_SENSOR_LABEL = 'Моковые данные';

const generateMockData = (): ChartRow[] =>
  Array.from({ length: 24 }, (_, i) => ({
    time: new Date(Date.now() - (23 - i) * 3_600_000).toISOString(),
    [MOCK_SENSOR_LABEL]: parseFloat((220 + Math.sin(i / 3) * 40 + Math.random() * 15).toFixed(2)),
  }));

const ConsumptionChart = ({ objectItem, sensors }: ConsumptionChartProps) => {
  const [selectedRange, setSelectedRange] = useState('day');

  const { from, agg } = useMemo(() => {
    const anchor = buildAnchorDate(objectItem);
    return rangeToWindow(selectedRange, anchor);
  }, [objectItem, selectedRange]);

  const to = useMemo(() => buildAnchorDate(objectItem), [objectItem]);

  const telemetryQueries = useQueries({
    queries: sensors.map((sensor) => ({
      queryKey: ['telemetry', sensor.id, from.toISOString(), to.toISOString(), agg],
      queryFn: () => fetchTelemetry(sensor.id, from.toISOString(), to.toISOString(), agg),
      enabled: !!sensor.id,
    })),
  });

  const isLoading = telemetryQueries.some((query) => query.isLoading);
  const hasError = telemetryQueries.some((query) => query.error);

  const chartData = useMemo(() => {
    const timeMap = new Map<string, ChartRow>();

    sensors.forEach((sensor, sensorIndex) => {
      const readings = telemetryQueries[sensorIndex].data as AggregatedReading[] | undefined;
      if (!readings) {
        return;
      }

      readings.forEach((reading) => {
        if (!timeMap.has(reading.time)) {
          timeMap.set(reading.time, { time: reading.time });
        }

        const row = timeMap.get(reading.time)!;
        row[sensor.label] = reading.value;
      });
    });

    return Array.from(timeMap.values()).sort(
      (left, right) =>
        new Date(String(left.time)).getTime() - new Date(String(right.time)).getTime(),
    );
  }, [sensors, telemetryQueries]);

  if (isLoading) {
    return (
      <div className="chart-loading">
        <Spin size="large" />
      </div>
    );
  }

  if (hasError) {
    return <Alert type="error" message="Не удалось загрузить временной ряд" showIcon />;
  }

  const useMock = !sensors.length || !chartData.length;
  const displayData = useMock ? generateMockData() : chartData;

  return (
    <Card
      className="surface-card"
      title="Потребление за 24ч"
      extra={
        <Segmented
          options={RANGE_OPTIONS}
          value={selectedRange}
          onChange={(value) => setSelectedRange(String(value))}
        />
      }
    >
      <div className="chart-card__meta">
        <Text type="secondary">
          {useMock
            ? 'Демо-данные (реальные сенсоры не подключены)'
            : `Показан интервал до ${to.toLocaleString('ru-RU')} c агрегацией ${agg}`}
        </Text>
      </div>
      <div className="chart-shell">
        <ResponsiveContainer>
          <LineChart data={displayData} margin={{ top: 8, right: 12, left: 0, bottom: 8 }}>
            <CartesianGrid stroke="#d7e3e0" strokeDasharray="3 3" />
            <XAxis
              dataKey="time"
              minTickGap={28}
              tickFormatter={(value) =>
                new Date(value).toLocaleString('ru-RU', {
                  day: '2-digit',
                  month: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit',
                })
              }
            />
            <YAxis />
            <Tooltip
              labelFormatter={(label) => new Date(label).toLocaleString('ru-RU')}
              formatter={(value) =>
                typeof value === 'number' ? value.toFixed(3) : String(value)
              }
            />
            <Legend verticalAlign="top" />
            {useMock ? (
              <Line
                type="monotone"
                dataKey={MOCK_SENSOR_LABEL}
                stroke={CHART_COLORS[0]}
                strokeWidth={2.2}
                strokeDasharray="6 3"
                dot={false}
                activeDot={{ r: 4 }}
                isAnimationActive={false}
              />
            ) : (
              sensors.map((sensor, index) => (
                <Line
                  key={sensor.id}
                  type="monotone"
                  dataKey={sensor.label}
                  stroke={CHART_COLORS[index % CHART_COLORS.length]}
                  strokeWidth={2.2}
                  dot={false}
                  activeDot={{ r: 4 }}
                  isAnimationActive={false}
                />
              ))
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
};

export default memo(ConsumptionChart);
