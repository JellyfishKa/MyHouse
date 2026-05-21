import { Card, Col, Drawer, Progress, Row, Space, Statistic, Tag, Typography } from 'antd';
import {
  BulbOutlined,
  DashboardOutlined,
  ThunderboltOutlined,
  ToolOutlined,
  UsbOutlined,
} from '@ant-design/icons';
import ConsumptionChart from './ConsumptionChart';
import { useHealthScore, useRul, type ObjectSensor } from '../api/hooks';

const { Text, Title } = Typography;

const CATEGORY_CONFIG: Record<string, { label: string; icon: typeof ThunderboltOutlined }> = {
  servers: { label: 'Серверы', icon: ThunderboltOutlined },
  cooling: { label: 'Охлаждение', icon: ToolOutlined },
  ups: { label: 'ИБП', icon: UsbOutlined },
  lighting: { label: 'Освещение', icon: BulbOutlined },
};

const gradeColor = (grade?: string) => {
  if (grade === 'A') return '#15803d';
  if (grade === 'B') return '#0f766e';
  if (grade === 'C') return '#d97706';
  return '#d4380d';
};

const rulStatusColor = (status?: string) => {
  if (status === 'ok') return 'success';
  if (status === 'warning') return 'warning';
  return 'error';
};

interface EquipmentDrawerProps {
  open: boolean;
  category: string;
  sensors: ObjectSensor[];
  objectId?: string;
  onClose: () => void;
}

const EquipmentDrawer = ({ open, category, sensors, objectId, onClose }: EquipmentDrawerProps) => {
  const cfg = CATEGORY_CONFIG[category] ?? { label: category, icon: DashboardOutlined };
  const Icon = cfg.icon;

  const { data: health } = useHealthScore(objectId);
  const { data: rul } = useRul(objectId);

  const progressColor = health ? gradeColor(health.grade) : '#0f766e';
  const progressPct = health ? Math.round(health.score) : 0;

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width={600}
      title={
        <Space>
          <Icon style={{ color: '#0f766e', fontSize: 18 }} />
          <Title level={4} style={{ margin: 0 }}>
            {cfg.label}
          </Title>
          <Text type="secondary">{sensors.length} сенсоров</Text>
        </Space>
      }
    >
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <Row gutter={[12, 12]}>
          <Col xs={24} sm={12}>
            <Card className="surface-card" style={{ textAlign: 'center' }}>
              <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
                Health Score объекта
              </Text>
              <Progress
                type="circle"
                percent={progressPct}
                strokeColor={progressColor}
                format={() => (
                  <span style={{ color: progressColor, fontWeight: 700, fontSize: 22 }}>
                    {health?.grade ?? '—'}
                  </span>
                )}
              />
              <div style={{ marginTop: 8 }}>
                <Text>{health ? `${health.score} / 100` : '—'}</Text>
              </div>
              {health && (
                <div style={{ marginTop: 6 }}>
                  {health.critical > 0 && <Tag color="error">Критичных: {health.critical}</Tag>}
                  {health.high > 0 && <Tag color="orange">Высоких: {health.high}</Tag>}
                  {health.medium > 0 && <Tag color="warning">Средних: {health.medium}</Tag>}
                </div>
              )}
            </Card>
          </Col>

          <Col xs={24} sm={12}>
            <Card className="surface-card">
              <Statistic
                title="Прогнозный ресурс (RUL)"
                value={rul ? `${rul.rul_days} дн.` : '—'}
                valueStyle={{
                  color: rul ? (rulStatusColor(rul.status) === 'success' ? '#15803d' : rulStatusColor(rul.status) === 'warning' ? '#d97706' : '#d4380d') : undefined,
                }}
              />
              {rul && (
                <Space direction="vertical" size={4} style={{ marginTop: 8 }}>
                  <Tag color={rulStatusColor(rul.status)}>
                    {rul.status === 'ok' ? 'В норме' : rul.status === 'warning' ? 'Предупреждение' : 'Критично'}
                  </Tag>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    Уверенность: низкая (эвристика)
                  </Text>
                </Space>
              )}
            </Card>
          </Col>
        </Row>

        <ConsumptionChart sensors={sensors} />
      </Space>
    </Drawer>
  );
};

export default EquipmentDrawer;
