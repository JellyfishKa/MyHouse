import { useMemo } from 'react';
import {
  Button,
  Card,
  Col,
  Empty,
  Row,
  Skeleton,
  Space,
  Statistic,
  Tag,
  Typography,
  message,
} from 'antd';
import { useQueryClient } from '@tanstack/react-query';
import { useOutletContext } from 'react-router-dom';
import { ExperimentOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { unlockAudio } from '../utils/alertSound';
import ConsumptionChart from '../components/ConsumptionChart';
import PredictiveInsightsPanel from '../components/PredictiveInsightsPanel';
import type { AppLayoutContextValue } from '../components/MainLayout';
import SummaryCards from '../components/SummaryCards';
import { useStressTestContext } from '../context/StressTestContext';
import {
  useHealthScore,
  useObjectSensors,
  useRul,
  useStressTest,
  useSummary,
  useTriggerDetection,
} from '../api/hooks';
import {
  aggregateTotalAverage,
  healthColor,
  invalidateObjectMetrics,
  rulColor,
} from '../utils/metricsUtils';

const POLL_MS = 2000;
const METRICS_POLL_MS = 30_000;

const { Text, Title } = Typography;

const typeLabels: Record<string, string> = {
  datacenter: 'Датацентр',
  workshop: 'Производственный узел',
  building: 'Здание',
};

const Dashboard = () => {
  const { selectedObject, selectedObjectId, objectsLoading, mlHealth } =
    useOutletContext<AppLayoutContextValue>();
  const {
    active: stressActive,
    startedAt: stressStartedAt,
    objectId: stressObjectId,
    stressPhase,
    stressStep,
    startStressTest,
    endStressTest,
    anomalies: stressAnomalies,
  } = useStressTestContext();
  const queryClient = useQueryClient();
  const [messageApi, contextHolder] = message.useMessage();

  const metricsObjectId = stressActive && stressObjectId ? stressObjectId : selectedObjectId;

  const healthSince = stressActive && stressStartedAt
    ? new Date(stressStartedAt).toISOString()
    : undefined;

  const metricsPoll = stressActive ? POLL_MS : METRICS_POLL_MS;

  const { data: sensors = [] } = useObjectSensors(metricsObjectId);
  const { data: summary = [], isLoading: summaryLoading, error: summaryError } =
    useSummary(metricsObjectId, metricsPoll);
  const { data: healthScore, isLoading: healthLoading } =
    useHealthScore(metricsObjectId, metricsPoll, healthSince);
  const { data: rul, isLoading: rulLoading } =
    useRul(metricsObjectId, metricsPoll, healthSince);

  const totalConsumption = useMemo(() => aggregateTotalAverage(summary), [summary]);

  const detectMutation = useTriggerDetection();
  const stressMutation = useStressTest();

  const sourceLabel = useMemo(() => {
    const source = selectedObject?.meta_data?.source;
    return typeof source === 'string' ? source : 'manual';
  }, [selectedObject?.meta_data]);

  const anomalyMarkers = useMemo(() => {
    if (!stressActive || !stressStartedAt) return [];
    return stressAnomalies.filter((a) => new Date(a.time).getTime() >= stressStartedAt - 5000);
  }, [stressAnomalies, stressActive, stressStartedAt]);

  const handleDetect = async () => {
    if (!selectedObjectId) return;
    try {
      const result = await detectMutation.mutateAsync({ object_id: selectedObjectId, days: 30 });
      await invalidateObjectMetrics(queryClient, selectedObjectId);
      messageApi.success(`ML завершил анализ: найдено ${result.anomalies_found}, записано ${result.anomalies_inserted}`);
    } catch (error) {
      messageApi.error(`Не удалось запустить ML-анализ: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`);
    }
  };

  const handleStressTest = async () => {
    if (!selectedObjectId) return;
    unlockAudio();
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      void Notification.requestPermission();
    }
    try {
      const result = await stressMutation.mutateAsync({
        object_id: selectedObjectId,
        duration_seconds: 180,
      });
      startStressTest({
        equipmentId: result.equipment_id,
        objectId: selectedObjectId,
        durationSeconds: result.duration_seconds,
      });
      messageApi.warning('Стресс-тест · 3 мин = 30 сут — следите за уведомлениями и прогнозом');
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Неизвестная ошибка';
      if (msg.includes('409') || msg.toLowerCase().includes('already running')) {
        messageApi.warning('Стресс-тест уже выполняется');
      } else {
        messageApi.error({ content: `Не удалось запустить стресс-тест: ${msg}`, key: 'stress' });
      }
    }
  };

  return (
    <Space direction="vertical" size={12} style={{ width: '100%' }}>
      {contextHolder}

      <Card className="hero-card">
        <div className="hero-card__content">
          <div>
            <Text className="eyebrow" style={{ color: 'rgba(46,204,114,0.8)' }}>
              {selectedObject ? 'Активный объект' : 'Панель управления'}
            </Text>
            <Title level={2} style={{ color: '#e8f5ee', margin: '4px 0 8px', fontWeight: 700, letterSpacing: '-0.3px' }}>
              {selectedObject ? selectedObject.name : 'ПУЛЬСТОК'}
            </Title>
            {selectedObject && (
              <>
                <Text style={{ color: '#a8d5ba', fontSize: 13, display: 'block', marginBottom: 12 }}>
                  Мониторинг объекта в реальном времени
                </Text>
                <Space wrap size={6}>
                  <Tag style={{ background: 'rgba(46,204,114,0.2)', color: '#7de8a8', border: '1px solid rgba(46,204,114,0.35)', borderRadius: 20, fontWeight: 500 }}>
                    {typeLabels[selectedObject.type] ?? selectedObject.type}
                  </Tag>
                  <Tag style={{ background: 'rgba(96,165,250,0.2)', color: '#93c5fd', border: '1px solid rgba(96,165,250,0.35)', borderRadius: 20, fontWeight: 500 }}>
                    Источник: {sourceLabel}
                  </Tag>
                  <Tag style={{
                    background: mlHealth?.status === 'ok' ? 'rgba(46,204,114,0.2)' : 'rgba(239,68,68,0.2)',
                    color: mlHealth?.status === 'ok' ? '#7de8a8' : '#fca5a5',
                    border: `1px solid ${mlHealth?.status === 'ok' ? 'rgba(46,204,114,0.35)' : 'rgba(239,68,68,0.35)'}`,
                    borderRadius: 20,
                    fontWeight: 500,
                  }}>
                    ML {mlHealth?.status === 'ok' ? 'доступен' : 'недоступен'}
                  </Tag>
                </Space>
              </>
            )}
          </div>

          <Space wrap>
            <Button
              type="primary"
              size="large"
              icon={<ExperimentOutlined />}
              onClick={handleDetect}
              loading={detectMutation.isPending}
              disabled={!selectedObjectId}
            >
              ML-анализ
            </Button>
            <Button
              type="primary"
              danger
              size="large"
              icon={<ThunderboltOutlined />}
              onClick={handleStressTest}
              loading={stressMutation.isPending}
              disabled={stressActive || !selectedObjectId}
            >
              {stressActive ? 'Активен...' : 'Стресс-тест'}
            </Button>
            {stressActive && (
              <Button size="large" onClick={endStressTest}>
                Остановить
              </Button>
            )}
          </Space>
        </div>
      </Card>

      {objectsLoading && !selectedObject && (
        <Card className="surface-card"><Skeleton active /></Card>
      )}

      {!objectsLoading && !selectedObject && (
        <Empty description="Выберите объект для просмотра данных" />
      )}

      {selectedObject && (
        <>
          <PredictiveInsightsPanel
            objectId={metricsObjectId}
            refetchInterval={stressActive ? POLL_MS * 2 : 120_000}
            stressActive={stressActive}
          />

          <Row gutter={[10, 10]}>
            <Col xs={24} sm={8}>
              <Card className="surface-card stat-card" style={{ height: '100%' }}>
                {healthLoading ? <Skeleton active paragraph={{ rows: 1 }} /> : (
                  <Statistic
                    title={stressActive ? 'Health (сессия)' : 'Health'}
                    value={healthScore ? `${healthScore.score}` : '—'}
                    suffix={healthScore ? ` ${healthScore.grade}` : ''}
                    valueStyle={{ color: healthColor(healthScore?.grade), fontSize: 'clamp(16px, 3.5vw, 26px)', fontWeight: 700 }}
                  />
                )}
                {stressActive && healthScore && (
                  <Text type="secondary" style={{ fontSize: 11 }}>
                    C:{healthScore.critical} H:{healthScore.high} M:{healthScore.medium} L:{healthScore.low}
                  </Text>
                )}
              </Card>
            </Col>
            <Col xs={24} sm={8}>
              <Card className="surface-card stat-card" style={{ height: '100%' }}>
                {summaryLoading ? <Skeleton active paragraph={{ rows: 1 }} /> : (
                  <Statistic
                    title="Потребл. Σ"
                    value={totalConsumption.value != null ? totalConsumption.value.toFixed(1) : '—'}
                    suffix={totalConsumption.unit}
                    valueStyle={{ color: '#2ecc72', fontSize: 'clamp(16px, 3.5vw, 26px)', fontWeight: 700 }}
                  />
                )}
              </Card>
            </Col>
            <Col xs={24} sm={8}>
              <Card className="surface-card stat-card" style={{ height: '100%' }}>
                {rulLoading ? <Skeleton active paragraph={{ rows: 1 }} /> : (
                  <Statistic
                    title={stressActive ? 'RUL (сессия)' : 'RUL'}
                    value={rul ? `${rul.rul_days}` : '—'}
                    suffix={rul ? ' дн.' : ''}
                    valueStyle={{ color: rulColor(rul?.status), fontSize: 'clamp(16px, 3.5vw, 26px)', fontWeight: 700 }}
                  />
                )}
                {rul && (
                  <Text type="secondary" style={{ fontSize: 11 }}>
                    {rul.confidence === 'high' ? 'уверенность высокая' : rul.confidence === 'medium' ? 'уверенность средняя' : 'эвристика'}
                  </Text>
                )}
              </Card>
            </Col>
          </Row>

          <SummaryCards data={summary} sensors={sensors} isLoading={summaryLoading} error={summaryError} />

          <ConsumptionChart
            key={selectedObject.id}
            objectItem={selectedObject}
            sensors={sensors}
            refetchInterval={stressActive ? POLL_MS : false}
            anomalyMarkers={stressActive ? anomalyMarkers : []}
            liveWindowMinutes={stressActive ? 3 : 30}
            stressPhase={stressActive ? stressPhase : undefined}
            stressStartedAt={stressActive ? stressStartedAt : undefined}
            stressStep={stressActive ? stressStep : undefined}
          />
        </>
      )}
    </Space>
  );
};

export default Dashboard;
