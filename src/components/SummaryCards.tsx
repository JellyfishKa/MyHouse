import { Alert, Card, Col, Empty, Row, Skeleton, Space, Typography } from 'antd';
import {
  DashboardOutlined,
  ThunderboltOutlined,
  ToolOutlined,
  UsbOutlined,
  BulbOutlined,
} from '@ant-design/icons';
import type { SensorSummary } from '../api/hooks';

const { Title, Text } = Typography;

const categoryConfig: Record<string, { icon: typeof ThunderboltOutlined; label: string }> = {
  servers: { icon: ThunderboltOutlined, label: 'Серверы' },
  cooling: { icon: ToolOutlined, label: 'Охлаждение' },
  ups: { icon: UsbOutlined, label: 'ИБП' },
  lighting: { icon: BulbOutlined, label: 'Освещение' },
};

interface SummaryCardsProps {
  data?: SensorSummary[];
  isLoading: boolean;
  error: unknown;
}

const SummaryCards = ({ data, isLoading, error }: SummaryCardsProps) => {
  if (isLoading) {
    return (
      <Row gutter={[16, 16]}>
        {Array.from({ length: 4 }).map((_, index) => (
          <Col xs={24} sm={12} xl={6} key={index}>
            <Card className="surface-card">
              <Skeleton active paragraph={{ rows: 4 }} />
            </Card>
          </Col>
        ))}
      </Row>
    );
  }

  if (error) {
    return <Alert type="error" message="Не удалось загрузить сводку по сенсорам" showIcon />;
  }

  if (!data || data.length === 0) {
    return <Empty description="Для выбранного объекта пока нет агрегированных данных" />;
  }

  return (
    <Row gutter={[16, 16]}>
      {data.map((item) => {
        const config = categoryConfig[item.category] || {
          icon: DashboardOutlined,
          label: item.sensor_label,
        };
        const IconComponent = config.icon;

        return (
          <Col xs={24} sm={12} xl={6} key={item.sensor_id}>
            <Card className="metric-card">
              <Space direction="vertical" size={12} style={{ width: '100%' }}>
                <div className="metric-card__header">
                  <div className="metric-card__icon">
                    <IconComponent />
                  </div>
                  <div>
                    <Text className="muted-label">{config.label}</Text>
                    <Title level={4} style={{ margin: 0 }}>
                      {item.sensor_label}
                    </Title>
                  </div>
                </div>

                <div className="metric-card__value">
                  {item.average.toFixed(2)} {item.unit}
                </div>
                <Text className="muted-label">Среднее значение</Text>

                <div className="metric-card__footer">
                  <div>
                    <Text className="muted-label">Пик</Text>
                    <div>{item.maximum.toFixed(2)} {item.unit}</div>
                  </div>
                  <div>
                    <Text className="muted-label">Мин</Text>
                    <div>{item.minimum.toFixed(2)} {item.unit}</div>
                  </div>
                  <div>
                    <Text className="muted-label">Точек</Text>
                    <div>{item.readings_count.toLocaleString('ru-RU')}</div>
                  </div>
                </div>
              </Space>
            </Card>
          </Col>
        );
      })}
    </Row>
  );
};

export default SummaryCards;
