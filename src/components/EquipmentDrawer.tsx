import { Card, Col, Collapse, Drawer, Progress, Row, Space, Statistic, Tag, Typography } from 'antd';
import {
  BulbOutlined,
  DashboardOutlined,
  FileTextOutlined,
  ThunderboltOutlined,
  ToolOutlined,
  UsbOutlined,
} from '@ant-design/icons';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import ConsumptionChart from './ConsumptionChart';
import { useHealthScore, useRul, type ObjectSensor } from '../api/hooks';
import { EQUIPMENT_PASSPORTS } from '../data/equipment-passports';

const { Text, Title } = Typography;

const CATEGORY_CONFIG: Record<string, { label: string; icon: typeof ThunderboltOutlined }> = {
  servers:  { label: 'Серверы',    icon: ThunderboltOutlined },
  cooling:  { label: 'Охлаждение', icon: ToolOutlined },
  ups:      { label: 'ИБП',        icon: UsbOutlined },
  lighting: { label: 'Освещение',  icon: BulbOutlined },
};

// 12 полностью уникальных цветов — по одному на каждый порядок гармоники (2–13)
const HARMONIC_COLORS_12 = [
  '#0f766e', // 2-я  — тёмно-зелёный
  '#2ecc72', // 3-я  — яркий зелёный
  '#2563eb', // 4-я  — синий
  '#7c3aed', // 5-я  — фиолетовый
  '#db2777', // 6-я  — малиновый
  '#dc2626', // 7-я  — красный
  '#ea580c', // 8-я  — оранжевый
  '#d97706', // 9-я  — янтарный
  '#65a30d', // 10-я — лаймовый
  '#0891b2', // 11-я — голубой
  '#6366f1', // 12-я — индиго
  '#a16207', // 13-я — коричнево-золотой
];
const harmColor = (idx: number) => HARMONIC_COLORS_12[idx] ?? HARMONIC_COLORS_12[idx % HARMONIC_COLORS_12.length];

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

  const passport = EQUIPMENT_PASSPORTS[category];

  const progressColor = health ? gradeColor(health.grade) : '#0f766e';
  const progressPct = health ? Math.round(health.score) : 0;

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width={640}
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

        {/* ── Health + RUL ── */}
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
                  color: rul
                    ? (rulStatusColor(rul.status) === 'success'
                        ? '#15803d'
                        : rulStatusColor(rul.status) === 'warning'
                          ? '#d97706'
                          : '#d4380d')
                    : undefined,
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

        {/* ── Паспорт оборудования ── */}
        {passport && (
          <Collapse
            items={[{
              key: 'passport',
              label: (
                <Space>
                  <FileTextOutlined style={{ color: '#0f766e' }} />
                  <Text strong>Паспорт оборудования</Text>
                  <Tag color="processing" style={{ marginLeft: 4 }}>THD {passport.thd} %</Tag>
                </Space>
              ),
              children: (
                <Space direction="vertical" size={16} style={{ width: '100%' }}>
                  {/* Description */}
                  <Text type="secondary" style={{ fontSize: 13 }}>
                    {passport.description}
                  </Text>

                  {/* Specs table */}
                  <div>
                    <Text
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        letterSpacing: '0.07em',
                        color: '#6a9478',
                        display: 'block',
                        marginBottom: 8,
                      }}
                    >
                      Технические характеристики
                    </Text>
                    {passport.specs.map(({ key, value }) => (
                      <div
                        key={key}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'baseline',
                          padding: '5px 0',
                          borderBottom: '1px solid rgba(13,40,24,0.06)',
                          gap: 8,
                        }}
                      >
                        <Text style={{ fontSize: 13, color: '#6a9478', flexShrink: 0 }}>{key}</Text>
                        <Text style={{ fontSize: 13, fontWeight: 500, color: '#0d1f15', textAlign: 'right' }}>
                          {value}
                        </Text>
                      </div>
                    ))}
                  </div>

                  {/* Harmonic spectrum */}
                  <div>
                    <Text
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        letterSpacing: '0.07em',
                        color: '#6a9478',
                        display: 'block',
                        marginBottom: 8,
                      }}
                    >
                      Гармонический спектр тока (2–13 порядок)
                    </Text>
                    <div style={{ height: 180 }}>
                      <ResponsiveContainer>
                        <BarChart
                          data={passport.harmonics}
                          margin={{ top: 4, right: 4, left: -18, bottom: 4 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(13,40,24,0.08)" />
                          <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#6a9478' }} />
                          <YAxis tick={{ fontSize: 11, fill: '#6a9478' }} unit="%" />
                          <Tooltip
                            formatter={(v) => [`${typeof v === 'number' ? v.toFixed(1) : String(v)} %`, 'Амплитуда']}
                            labelFormatter={(l) => `Гармоника: ${l}`}
                            contentStyle={{
                              background: '#ecf0e8',
                              border: '1px solid rgba(13,40,24,0.1)',
                              borderRadius: 8,
                              fontSize: 12,
                            }}
                          />
                          <Bar dataKey="percent" radius={[4, 4, 0, 0]}>
                            {passport.harmonics.map((_, idx) => (
                              <Cell key={idx} fill={harmColor(idx)} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* Notes */}
                  <Card
                    size="small"
                    style={{
                      background: 'rgba(46,204,114,0.06)',
                      border: '1px solid rgba(46,204,114,0.18)',
                      borderRadius: 10,
                    }}
                    styles={{ body: { padding: '10px 14px' } }}
                  >
                    <Text style={{ fontSize: 12, color: '#4a7a5e', lineHeight: 1.6 }}>
                      <strong>Диагностика NILM: </strong>{passport.notes}
                    </Text>
                  </Card>
                </Space>
              ),
            }]}
            style={{
              background: '#ecf0e8',
              border: '1px solid rgba(13,40,24,0.07)',
              borderRadius: 12,
            }}
            styles={{
              header: { background: '#ecf0e8', padding: '10px 16px' },
              body: { background: '#f0f4ed', padding: '14px 16px' },
            }}
          />
        )}

        {/* ── Consumption chart ── */}
        <ConsumptionChart sensors={sensors} />
      </Space>
    </Drawer>
  );
};

export default EquipmentDrawer;
