import { Row, Col, Card, Typography, Space, Skeleton, Alert } from 'antd';
import {
  ThunderboltOutlined,
  ToolOutlined,
  UsbOutlined,
  BulbOutlined,
} from '@ant-design/icons';
import { useSummary, type CategorySummary } from '../api/hooks';

const { Title, Text } = Typography;

const categoryConfig: Record<string, { icon: typeof ThunderboltOutlined; label: string }> = {
  servers: { icon: ThunderboltOutlined, label: 'Серверы' },
  cooling: { icon: ToolOutlined, label: 'Охлаждение' },
  ups: { icon: UsbOutlined, label: 'ИБП' },
  lighting: { icon: BulbOutlined, label: 'Освещение' },
};

const SummaryCards = () => {
  const { data, isLoading, error } = useSummary();

  if (isLoading) {
    return (
      <div style={{ padding: '20px' }}>
        <Row gutter={[16, 16]}>
          {Array.from({ length: 4 }).map((_, index) => (
            <Col xs={24} sm={12} md={6} key={index}>
              <Card>
                <Skeleton active paragraph={{ rows: 2 }} />
              </Card>
            </Col>
          ))}
        </Row>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: 20 }}>
        <Alert type="error" message="Ошибка загрузки данных" showIcon />
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div style={{ padding: 20 }}>
        <Alert type="info" message="Нет данных за последние 7 дней" showIcon />
      </div>
    );
  }

  return (
    <div style={{ padding: '20px' }}>
      <Row gutter={[16, 16]}>
        {data.map((item: CategorySummary) => {
          const config = categoryConfig[item.category] || {
            icon: ThunderboltOutlined,
            label: item.category,
          };
          const IconComponent = config.icon;

          return (
            <Col xs={24} sm={12} md={6} key={item.category}>
              <Card>
                <Space direction="vertical" align="center" style={{ width: '100%' }}>
                  <IconComponent style={{ fontSize: '32px', color: '#5D3C97' }} />
                  <Title level={5}>{config.label}</Title>
                  <Text>{item.kwh} кВт*ч</Text>
                  <Text strong>{item.cost_rub} ₽</Text>
                </Space>
              </Card>
            </Col>
          );
        })}
      </Row>
    </div>
  );
};

export default SummaryCards;
