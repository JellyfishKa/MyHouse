import { memo, useMemo } from 'react';
import { Spin, Alert, Empty } from 'antd';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { useTelemetry } from '../api/hooks';

// ID сенсоров из seed.py
const SENSORS = [
  { id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', label: 'Серверы', color: '#5D3C97' },
  { id: 'd0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', label: 'Охлаждение', color: '#5B72DA' },
  { id: 'e0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', label: 'ИБП', color: '#8D77B7' },
  { id: 'f0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', label: 'Освещение', color: '#BDB3D8' },
];

const ConsumptionChart = () => {
  const now = useMemo(() => new Date().toISOString(), []);
  const weekAgo = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString();
  }, []);

  const queries = SENSORS.map((s) => useTelemetry(s.id, weekAgo, now, 'hour'));

  const isLoading = queries.some((q) => q.isLoading);
  const hasError = queries.some((q) => q.error);

  const chartData = useMemo(() => {
    const timeMap = new Map<string, Record<string, number | string>>();

    SENSORS.forEach((sensor, idx) => {
      const readings = queries[idx].data;
      if (!readings) return;
      readings.forEach((r) => {
        const timeKey = r.time;
        if (!timeMap.has(timeKey)) {
          timeMap.set(timeKey, { time: timeKey });
        }
        const entry = timeMap.get(timeKey)!;
        entry[sensor.label] = r.value ?? 0;
      });
    });

    return Array.from(timeMap.values()).sort(
      (a, b) => new Date(a.time as string).getTime() - new Date(b.time as string).getTime(),
    );
  }, [queries.map((q) => q.data)]);

  if (isLoading) {
    return (
      <div style={{ width: '100%', height: 400, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Spin size="large" />
      </div>
    );
  }

  if (hasError) {
    return <Alert type="error" message="Ошибка загрузки графика" showIcon />;
  }

  if (chartData.length === 0) {
    return <Empty description="Нет данных для отображения" />;
  }

  return (
    <div style={{ width: '100%', height: 400 }}>
      <ResponsiveContainer>
        <AreaChart
          data={chartData}
          margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis
            dataKey="time"
            tickFormatter={(time) => new Date(time).toLocaleDateString('ru-RU')}
          />
          <YAxis />
          <Tooltip
            labelFormatter={(label) =>
              new Date(label).toLocaleString('ru-RU')
            }
          />
          <Legend verticalAlign="bottom" height={36} />
          {SENSORS.map((sensor) => (
            <Area
              key={sensor.id}
              type="monotone"
              dataKey={sensor.label}
              stroke={sensor.color}
              fill={sensor.color}
              fillOpacity={0.6}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};

export default memo(ConsumptionChart);
