import { Card, Col, Row, Skeleton, Tag, Typography } from 'antd';
import {
  AlertOutlined,
  LineChartOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import { usePredictiveInsights, type PredictiveInsightItem } from '../api/hooks';

const { Paragraph, Text, Title } = Typography;

const KIND_META: Record<string, { icon: typeof AlertOutlined; accent: string }> = {
  spike_risk: { icon: AlertOutlined, accent: '#e67e22' },
  consumption_growth: { icon: LineChartOutlined, accent: '#2563eb' },
  savings_window: { icon: ThunderboltOutlined, accent: '#2ecc72' },
};

const riskColor: Record<string, string> = {
  low: 'success',
  medium: 'warning',
  high: 'error',
};

function InsightCard({ item }: { item: PredictiveInsightItem }) {
  const meta = KIND_META[item.kind] ?? KIND_META.spike_risk;
  const Icon = meta.icon;

  return (
    <Card className="surface-card predict-card" style={{ height: '100%' }}>
      <div className="predict-card__head">
        <div className="predict-card__icon" style={{ background: `${meta.accent}18`, color: meta.accent }}>
          <Icon />
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <Text type="secondary" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            {item.horizon_days} дн.
          </Text>
          <Title level={5} style={{ margin: '2px 0 0', fontSize: 15 }}>
            {item.title}
          </Title>
        </div>
        {item.risk_level && (
          <Tag color={riskColor[item.risk_level] ?? 'default'} style={{ margin: 0 }}>
            {item.risk_level === 'low' ? 'низкий' : item.risk_level === 'medium' ? 'средний' : 'высокий'}
          </Tag>
        )}
        {item.impact_pct != null && item.kind !== 'spike_risk' && (
          <Tag color={item.impact_pct >= 0 ? 'orange' : 'green'} style={{ margin: 0 }}>
            {item.impact_pct >= 0 ? '+' : ''}{item.impact_pct.toFixed(1)}%
          </Tag>
        )}
      </div>
      <Paragraph style={{ margin: '12px 0 8px', fontSize: 13, lineHeight: 1.5 }}>
        {item.summary}
      </Paragraph>
      {item.window_label && (
        <Text type="secondary" style={{ fontSize: 12 }}>
          Окно: {item.window_label}
        </Text>
      )}
      <Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 8 }}>
        Уверенность: {item.confidence === 'high' ? 'высокая' : item.confidence === 'medium' ? 'средняя' : 'низкая'}
      </Text>
    </Card>
  );
}

interface PredictiveInsightsPanelProps {
  objectId?: string;
  refetchInterval?: number | false;
}

export default function PredictiveInsightsPanel({ objectId, refetchInterval }: PredictiveInsightsPanelProps) {
  const { data, isLoading, error } = usePredictiveInsights(objectId, refetchInterval);

  if (!objectId) return null;

  return (
    <div className="predict-panel">
      <div className="predict-panel__header">
        <Text className="eyebrow">Предиктивная аналитика</Text>
        <Title level={3} style={{ margin: '4px 0 0' }}>
          Прогноз на ближайшие дни
        </Title>
        <Paragraph type="secondary" style={{ margin: '4px 0 0', maxWidth: 720 }}>
          ML-модель анализирует 7-дневный профиль нагрузки: риск скачков, тренд потребления и окно для снижения тока.
        </Paragraph>
      </div>

      {error ? (
        <Card className="surface-card">
          <Text type="danger">Не удалось загрузить прогнозы. Проверьте телеметрию объекта.</Text>
        </Card>
      ) : isLoading ? (
        <Row gutter={[12, 12]}>
          {[0, 1, 2].map((k) => (
            <Col xs={24} md={8} key={k}>
              <Card className="surface-card"><Skeleton active paragraph={{ rows: 3 }} /></Card>
            </Col>
          ))}
        </Row>
      ) : data ? (
        <Row gutter={[12, 12]}>
          <Col xs={24} md={8}>
            <InsightCard item={data.spike_risk} />
          </Col>
          <Col xs={24} md={8}>
            <InsightCard item={data.consumption_growth} />
          </Col>
          <Col xs={24} md={8}>
            <InsightCard item={data.savings_window} />
          </Col>
        </Row>
      ) : null}
    </div>
  );
}
