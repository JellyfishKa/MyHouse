import { memo, useMemo } from 'react';
import { Skeleton, Alert, Empty, Tooltip as AntdTooltip, Tag } from 'antd';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ReferenceDot,
} from 'recharts';
import { useTelemetry, useAnomalies, type AnomalyRecord } from '../api/hooks';

// ID сенсоров из seed.py
const SENSORS = [
  { id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', label: 'Серверы', color: '#5D3C97' },
  { id: 'd0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', label: 'Охлаждение', color: '#5B72DA' },
  { id: 'e0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', label: 'ИБП', color: '#8D77B7' },
  { id: 'f0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', label: 'Освещение', color: '#BDB3D8' },
];

const categoryLabels: Record<string, string> = {
    servers: 'Серверы',
    cooling: 'Охлаждение',
    ups: 'ИБП',
    lighting: 'Освещение',
};

const severityConfig: Record<string, { color: string; label: string }> = {
    low: { color: 'green', label: 'Низкий' },
    medium: { color: 'gold', label: 'Средний' },
    high: { color: 'orange', label: 'Высокий' },
    critical: { color: 'red', label: 'Критический' },
};

const AnomalyDot = (props: any) => {
    const { cx, cy, payload } = props;
    const an = payload as AnomalyRecord;

    const title = (
        <div>
            <span>{categoryLabels[an.category] || an.category}</span><br/>
            <span>Значение: {an.value.toFixed(2)}</span><br/>
            <Tag color={severityConfig[an.severity]?.color}>{severityConfig[an.severity]?.label}</Tag>
        </div>
    )

    return (
        <AntdTooltip title={title}>
            <circle cx={cx} cy={cy} r={5} stroke="red" strokeWidth={2} fill="white" />
        </AntdTooltip>
    );
};


const ConsumptionChart = () => {
  const now = useMemo(() => new Date().toISOString(), []);
  const weekAgo = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString();
  }, []);

  const telemetryQueries = SENSORS.map((s) => useTelemetry(s.id, weekAgo, now, 'hour'));
  const anomaliesQuery = useAnomalies();

  const isLoading = telemetryQueries.some((q) => q.isLoading) || anomaliesQuery.isLoading;
  const hasError = telemetryQueries.some((q) => q.error) || anomaliesQuery.error;

  const chartData = useMemo(() => {
    const timeMap = new Map<string, Record<string, number | string>>();

    SENSORS.forEach((sensor, idx) => {
      const readings = telemetryQueries[idx].data;
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
  }, [telemetryQueries.map((q) => q.data)]);

  if (isLoading) {
    return (
        <div style={{ width: '100%', height: 400, paddingTop: 40 }}>
            <Skeleton active />
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
            type="category"
            allowDuplicatedCategory
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
          {anomaliesQuery.data?.map(an => (
             <ReferenceDot
                key={an.id}
                x={an.time}
                y={an.value}
                ifOverflow="extendDomain"
                shape={<AnomalyDot />}
             />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};

export default memo(ConsumptionChart);
