import { Button, Space, Typography } from 'antd';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const { Title } = Typography;

const data = [
  { name: 'Пн', value: 400 },
  { name: 'Вт', value: 300 },
  { name: 'Ср', value: 600 },
  { name: 'Чт', value: 800 },
  { name: 'Пт', value: 500 },
];

function App() {
  return (
    <div style={{ padding: '20px' }}>
      <Title level={2}>Проверка библиотек</Title>
      
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        {/* Проверка Ant Design */}
        <section>
          <Title level={4}>Ant Design Button:</Title>
          <Button type="primary" size="large">
            Работает!
          </Button>
        </section>

        {/* Проверка Recharts */}
        <section style={{ height: 300, background: '#f5f5f5', padding: '10px', borderRadius: '8px' }}>
          <Title level={4}>Recharts LineChart:</Title>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Line type="monotone" dataKey="value" stroke="#1677ff" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </section>
      </Space>
    </div>
  );
}

export default App;