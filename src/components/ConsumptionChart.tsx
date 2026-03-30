import { memo } from 'react';
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
import { mockConsumptionData } from '../mocks/consumption';

const colors = {
  'Электроэнергия': '#8884d8',
  'Водоснабжение': '#82ca9d',
  'Газоснабжение': '#ffc658',
  'Отопление': '#ff7300',
};

const ConsumptionChart = () => {
  return (
    <div style={{ width: '100%', height: 400 }}>
      <ResponsiveContainer>
        <AreaChart
          data={mockConsumptionData}
          margin={{
            top: 10,
            right: 30,
            left: 0,
            bottom: 0,
          }}
        >
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="time" tickFormatter={(time) => new Date(time).toLocaleDateString()} />
          <YAxis />
          <Tooltip />
          <Legend verticalAlign="bottom" height={36} />
          {Object.keys(colors).map((category) => (
            <Area
              key={category}
              type="monotone"
              dataKey={category}
              stroke={colors[category]}
              fill={colors[category]}
              fillOpacity={0.6}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};

export default memo(ConsumptionChart);
