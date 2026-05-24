import { Alert, Card, Col, Collapse, Empty, Grid, Row, Skeleton, Space, Typography } from 'antd';
import {
  BulbOutlined,
  ClockCircleOutlined,
  DashboardOutlined,
  DownOutlined,
  ThunderboltOutlined,
  ToolOutlined,
  UsbOutlined,
} from '@ant-design/icons';
import type { ObjectSensor, SensorSummary } from '../api/hooks';

const { Text, Title } = Typography;
const { useBreakpoint } = Grid;

const categoryConfig: Record<string, { icon: typeof ThunderboltOutlined; label: string }> = {
  servers:  { icon: ThunderboltOutlined, label: 'Серверы' },
  cooling:  { icon: ToolOutlined,        label: 'Охлаждение' },
  ups:      { icon: UsbOutlined,         label: 'ИБП' },
  lighting: { icon: BulbOutlined,        label: 'Освещение' },
};

interface SummaryCardsProps {
  data?: SensorSummary[];
  sensors?: ObjectSensor[];
  isLoading: boolean;
  error: unknown;
}

const MetricBody = ({ item }: { item: SensorSummary }) => (
  <Space direction="vertical" size={10} style={{ width: '100%' }}>
    <div className="metric-card__value">
      {item.average.toFixed(2)}{' '}
      <span style={{ fontSize: 14, fontWeight: 400, color: '#6a9478' }}>{item.unit}</span>
    </div>
    <Text style={{ fontSize: 11, color: '#6a9478', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
      Среднее значение
    </Text>
    <div className="metric-card__footer">
      {[
        { label: 'Пик',    val: item.maximum.toFixed(2) + ' ' + item.unit },
        { label: 'Мин',    val: item.minimum.toFixed(2) + ' ' + item.unit },
        { label: 'Точек',  val: item.readings_count.toLocaleString('ru-RU') },
      ].map(({ label, val }) => (
        <div key={label}>
          <Text style={{ fontSize: 11, color: '#6a9478', display: 'block' }}>{label}</Text>
          <Text style={{ fontSize: 13, fontWeight: 500, color: '#0d1f15' }}>{val}</Text>
        </div>
      ))}
    </div>
  </Space>
);

const SensorList = ({ sensors, category }: { sensors: ObjectSensor[]; category: string }) => {
  const filtered = sensors.filter((s) => s.category === category);
  if (!filtered.length) return null;
  return (
    <div style={{ marginTop: 12, borderTop: '1px solid rgba(13,40,24,0.08)', paddingTop: 12 }}>
      <Text style={{ fontSize: 11, color: '#6a9478', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 8 }}>
        Сенсоры
      </Text>
      {filtered.map((s) => (
        <div key={s.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid rgba(13,40,24,0.05)' }}>
          <div>
            <Text style={{ fontSize: 13, fontWeight: 500, color: '#0d1f15', display: 'block' }}>{s.label}</Text>
            <Text style={{ fontSize: 11, color: '#6a9478' }}>{s.unit} · {s.reading_count.toLocaleString('ru-RU')} точек</Text>
          </div>
          {s.last_reading_at && (
            <Text style={{ fontSize: 11, color: '#6a9478', display: 'flex', alignItems: 'center', gap: 4 }}>
              <ClockCircleOutlined style={{ fontSize: 11 }} />
              {new Date(s.last_reading_at).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
            </Text>
          )}
        </div>
      ))}
    </div>
  );
};

const SummaryCards = ({ data, sensors = [], isLoading, error }: SummaryCardsProps) => {
  const screens = useBreakpoint();
  const isMobile = !screens.md;

  if (isLoading) {
    return (
      <Row gutter={[12, 12]}>
        {Array.from({ length: 4 }).map((_, i) => (
          <Col xs={24} sm={12} xl={6} key={i}>
            <Card className="surface-card"><Skeleton active paragraph={{ rows: 3 }} /></Card>
          </Col>
        ))}
      </Row>
    );
  }

  if (error) return <Alert type="error" message="Не удалось загрузить сводку по сенсорам" showIcon />;
  if (!data || data.length === 0) return <Empty description="Нет агрегированных данных" />;

  /* ── Мобиль: аккордеон с сенсорами внутри ── */
  if (isMobile) {
    const collapseItems = data.map((item) => {
      const config = categoryConfig[item.category] ?? { icon: DashboardOutlined, label: item.sensor_label };
      const IconComponent = config.icon;
      return {
        key: item.sensor_id,
        label: (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(46,204,114,0.14)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#16a34a', fontSize: 16, flexShrink: 0 }}>
              <IconComponent />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#0d1f15' }}>{config.label}</div>
              <div style={{ fontSize: 11, color: '#6a9478' }}>{item.sensor_label}</div>
            </div>
            <div style={{ textAlign: 'right', marginRight: 8 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#0d1f15' }}>{item.average.toFixed(1)}</div>
              <div style={{ fontSize: 10, color: '#6a9478' }}>{item.unit}</div>
            </div>
          </div>
        ),
        children: (
          <>
            <MetricBody item={item} />
            <SensorList sensors={sensors} category={item.category} />
          </>
        ),
      };
    });

    return (
      <Collapse
        items={collapseItems}
        expandIconPosition="end"
        expandIcon={({ isActive }) => (
          <DownOutlined style={{ color: '#6a9478', transition: 'transform 0.2s', transform: isActive ? 'rotate(180deg)' : 'rotate(0)' }} />
        )}
        style={{ background: '#ecf0e8', border: '1px solid rgba(13,40,24,0.07)', borderRadius: 14, overflow: 'hidden' }}
        styles={{
          header: { background: '#ecf0e8', borderBottom: '1px solid rgba(13,40,24,0.07)', padding: '10px 16px' },
          body: { background: '#f0f4ed', padding: '14px 16px' },
        }}
      />
    );
  }

  /* ── Десктоп: сетка карточек ── */
  return (
    <Row gutter={[12, 12]}>
      {data.map((item) => {
        const config = categoryConfig[item.category] ?? { icon: DashboardOutlined, label: item.sensor_label };
        const IconComponent = config.icon;
        return (
          <Col xs={24} sm={12} xl={6} key={item.sensor_id}>
            <Card className="metric-card">
              <Space direction="vertical" size={10} style={{ width: '100%' }}>
                <div className="metric-card__header">
                  <div className="metric-card__icon"><IconComponent /></div>
                  <div>
                    <Text className="muted-label">{config.label}</Text>
                    <Title level={5} style={{ margin: 0, color: '#0d1f15', fontWeight: 600 }}>{item.sensor_label}</Title>
                  </div>
                </div>
                <MetricBody item={item} />
                <SensorList sensors={sensors} category={item.category} />
              </Space>
            </Card>
          </Col>
        );
      })}
    </Row>
  );
};

export default SummaryCards;
