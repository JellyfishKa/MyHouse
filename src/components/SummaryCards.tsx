import { Row, Col, Card, Typography, Space } from 'antd';
import { summaryData } from '../mocks/summary';

const { Title, Text } = Typography;

const SummaryCards = () => {
  return (
    <div style={{ padding: '20px' }}>
      <Row gutter={[16, 16]}>
        {summaryData.map((item) => (
          <Col xs={24} sm={12} md={6} key={item.id}>
            <Card>
              <Space direction="vertical" align="center" style={{ width: '100%' }}>
                <item.icon style={{ fontSize: '32px' }} />
                <Title level={5}>{item.category}</Title>
                <Text>{item.kwh} кВт*ч</Text>
                <Text strong>{item.rub} ₽</Text>
              </Space>
            </Card>
          </Col>
        ))}
      </Row>
    </div>
  );
};

export default SummaryCards;
