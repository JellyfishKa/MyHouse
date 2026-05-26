import { useCallback, useMemo, useState } from 'react';
import {
  Alert,
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
import ConsumptionChart from '../components/ConsumptionChart';
import type { AppLayoutContextValue } from '../components/MainLayout';
import SummaryCards from '../components/SummaryCards';
import { useStressNotifications } from '../hooks/useStressNotifications';
import {
  useAnomalies,
  useEquipmentAlerts,
  useHealthScore,
  useObjectSensors,
  useRul,
  useStressTest,
  useSummary,
  useTriggerDetection,
} from '../api/hooks';

const POLL_MS = 2000;

const { Text, Title } = Typography;

const typeLabels: Record<string, string> = {
  datacenter: 'Датацентр',
  workshop: 'Производственный узел',
  building: 'Здание',
};

const SEVERITY_LEGEND = [
  { key: 'low', label: 'Низкий', color: '#52c41a' },
  { key: 'medium', label: 'Средний', color: '#faad14' },
  { key: 'high', label: 'Высокий', color: '#fa8c16' },
  { key: 'critical', label: 'Критический', color: '#ff4d4f' },
];

const healthColor = (grade?: string) => {
  if (grade === 'A') return '#2ecc72';
  if (grade === 'B') return '#f0a500';
  if (grade === 'C') return '#e67e22';
  return '#e74c3c';
};

const rulColor = (status?: string) => {
  if (status === 'ok') return '#2ecc72';
  if (status === 'warning') return '#f0a500';
  return '#e74c3c';
};

const Dashboard = () => {
  const { selectedObject, selectedObjectId, objectsLoading, mlHealth } =
    useOutletContext<AppLayoutContextValue>();
  const queryClient = useQueryClient();
  const [stressActive, setStressActive] = useState(false);
  const [stressEquipmentId, setStressEquipmentId] = useState<string>();
  const [messageApi, contextHolder] = message.useMessage();

  const { data: sensors = [] } = useObjectSensors(selectedObjectId);
  const { data: summary = [], isLoading: summaryLoading, error: summaryError } =
    useSummary(selectedObjectId, stressActive ? POLL_MS : false);
  const { data: healthScore, isLoading: healthLoading } =
    useHealthScore(selectedObjectId, stressActive ? POLL_MS : false);
  const { data: rul, isLoading: rulLoading } =
    useRul(selectedObjectId, stressActive ? POLL_MS : false);
  const { data: anomalies = [] } = useAnomalies(
    selectedObjectId,
    undefined,
    stressActive ? POLL_MS : false,
  );
  const { data: alerts = [] } = useEquipmentAlerts(
    stressEquipmentId,
    stressActive ? POLL_MS : false,
  );

  const detectMutation = useTriggerDetection();
  const stressMutation = useStressTest();

  const sourceLabel = useMemo(() => {
    const source = selectedObject?.meta_data?.source;
    return typeof source === 'string' ? source : 'manual';
  }, [selectedObject?.meta_data]);

  const anomalyMarkers = useMemo(
    () => anomalies.map((a) => ({ time: a.time, severity: a.severity })),
    [anomalies],
  );

  const handleAutoMl = useCallback(async () => {
    if (!selectedObjectId) return;
    try {
      const result = await detectMutation.mutateAsync({ object_id: selectedObjectId, days: 1 });
      await queryClient.invalidateQueries({ queryKey: ['anomalies', selectedObjectId] });
      messageApi.info(
        `ML-анализ (авто): найдено ${result.anomalies_found}, записано ${result.anomalies_inserted}`,
      );
    } catch {
      messageApi.warning('Авто ML-анализ недоступен — продолжаем сценарий стресс-теста');
    }
  }, [selectedObjectId, detectMutation, queryClient, messageApi]);

  useStressNotifications({
    active: stressActive,
    anomalies,
    alerts,
    onMlTrigger: handleAutoMl,
  });

  const handleDetect = async () => {
    if (!selectedObjectId) return;
    try {
      const result = await detectMutation.mutateAsync({ object_id: selectedObjectId, days: 1 });
      await queryClient.invalidateQueries({ queryKey: ['anomalies', selectedObjectId] });
      messageApi.success(`ML завершил анализ: найдено ${result.anomalies_found}, записано ${result.anomalies_inserted}`);
    } catch (error) {
      messageApi.error(`Не удалось запустить ML-анализ: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`);
    }
  };

  const handleStressTest = async () => {
    if (!selectedObjectId) return;
    try {
      const result = await stressMutation.mutateAsync({
        object_id: selectedObjectId,
        duration_seconds: 300,
      });
      setStressEquipmentId(result.equipment_id);
      setStressActive(true);
      messageApi.warning('Стресс-тест запущен на 5 минут — следите за уведомлениями');
      setTimeout(() => {
        setStressActive(false);
        messageApi.info('Стресс-тест завершён');
      }, 360_000);
    } catch (error) {
      messageApi.error(`Не удалось запустить стресс-тест: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`);
    }
  };

  return (
    <Space direction="vertical" size={12} style={{ width: '100%' }}>
      {contextHolder}

      {stressActive && (
        <>
          <Alert
            type="warning"
            message="Стресс-тест активен — данные и аномалии обновляются каждые 2 секунды"
            showIcon
            banner
          />
          <Space wrap size={8}>
            {SEVERITY_LEGEND.map((s) => (
              <Tag key={s.key} color={s.color} style={{ margin: 0 }}>
                {s.label}
              </Tag>
            ))}
          </Space>
        </>
      )}

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
          <Row gutter={[10, 10]}>
            <Col xs={8} md={8}>
              <Card className="surface-card stat-card" style={{ height: '100%' }}>
                {healthLoading ? <Skeleton active paragraph={{ rows: 1 }} /> : (
                  <Statistic
                    title="Health"
                    value={healthScore ? `${healthScore.score}` : '—'}
                    suffix={healthScore ? ` ${healthScore.grade}` : ''}
                    valueStyle={{ color: healthColor(healthScore?.grade), fontSize: 'clamp(16px, 3.5vw, 26px)', fontWeight: 700 }}
                  />
                )}
              </Card>
            </Col>
            <Col xs={8} md={8}>
              <Card className="surface-card stat-card" style={{ height: '100%' }}>
                {summaryLoading ? <Skeleton active paragraph={{ rows: 1 }} /> : (
                  <Statistic
                    title="Потребл."
                    value={summary[0]?.average != null ? summary[0].average.toFixed(1) : '—'}
                    suffix={summary[0]?.unit ?? 'кВт'}
                    valueStyle={{ color: '#2ecc72', fontSize: 'clamp(16px, 3.5vw, 26px)', fontWeight: 700 }}
                  />
                )}
              </Card>
            </Col>
            <Col xs={8} md={8}>
              <Card className="surface-card stat-card" style={{ height: '100%' }}>
                {rulLoading ? <Skeleton active paragraph={{ rows: 1 }} /> : (
                  <Statistic
                    title="RUL"
                    value={rul ? `${rul.rul_days}` : '—'}
                    suffix={rul ? ' дн.' : ''}
                    valueStyle={{ color: rulColor(rul?.status), fontSize: 'clamp(16px, 3.5vw, 26px)', fontWeight: 700 }}
                  />
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
          />
        </>
      )}
    </Space>
  );
};

export default Dashboard;
