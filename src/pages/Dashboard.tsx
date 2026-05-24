import { useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Col,
  Empty,
  List,
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
import {
  useHealthScore,
  useObjectSensors,
  useRul,
  useStressTest,
  useSummary,
  useTriggerDetection,
} from '../api/hooks';

const POLL_MS = 2000;

const { Paragraph, Text, Title } = Typography;

const typeLabels: Record<string, string> = {
  datacenter: 'Датацентр',
  workshop: 'Производственный узел',
  building: 'Здание',
};

const Dashboard = () => {
  const { selectedObject, selectedObjectId, objectsLoading, mlHealth } =
    useOutletContext<AppLayoutContextValue>();
  const queryClient = useQueryClient();
  const [stressActive, setStressActive] = useState(false);
  const [messageApi, contextHolder] = message.useMessage();
  const { data: sensors = [], isLoading: sensorsLoading, error: sensorsError } =
    useObjectSensors(selectedObjectId);
  const { data: summary = [], isLoading: summaryLoading, error: summaryError } =
    useSummary(selectedObjectId, stressActive ? POLL_MS : false);
  const { data: healthScore, isLoading: healthLoading } = useHealthScore(selectedObjectId, stressActive ? POLL_MS : false);
  const { data: rul, isLoading: rulLoading } = useRul(selectedObjectId, stressActive ? POLL_MS : false);
  const detectMutation = useTriggerDetection();
  const stressMutation = useStressTest();

  const sourceLabel = useMemo(() => {
    const source = selectedObject?.meta_data?.source;
    if (typeof source !== 'string') {
      return 'manual';
    }
    return source;
  }, [selectedObject?.meta_data]);

  const handleDetect = async () => {
    if (!selectedObjectId) return;
    try {
      const result = await detectMutation.mutateAsync({ object_id: selectedObjectId, days: 1 });
      await queryClient.invalidateQueries({ queryKey: ['anomalies', selectedObjectId] });
      messageApi.success(
        `ML завершил анализ: найдено ${result.anomalies_found}, записано ${result.anomalies_inserted}`,
      );
    } catch (error) {
      const text = error instanceof Error ? error.message : 'Неизвестная ошибка';
      messageApi.error(`Не удалось запустить ML-анализ: ${text}`);
    }
  };

  const handleStressTest = async () => {
    if (!selectedObjectId) return;
    try {
      await stressMutation.mutateAsync({ object_id: selectedObjectId, duration_seconds: 60 });
      setStressActive(true);
      messageApi.warning('Стресс-тест запущен на 60 секунд');
      setTimeout(() => {
        setStressActive(false);
        messageApi.info('Стресс-тест завершён');
      }, 90_000);
    } catch (error) {
      const text = error instanceof Error ? error.message : 'Неизвестная ошибка';
      messageApi.error(`Не удалось запустить стресс-тест: ${text}`);
    }
  };

  return (
    <Space direction="vertical" size={20} style={{ width: '100%' }}>
      {contextHolder}

      {stressActive && (
        <Alert
          type="warning"
          message="Стресс-тест активен — данные обновляются каждые 2 секунды"
          showIcon
          banner
        />
      )}

      <Card className="hero-card">
        <div className="hero-card__content">
          <div>
            <Text className="eyebrow">
              {selectedObject ? 'Активный объект' : 'Панель управления'}
            </Text>
            <Title level={1} className="page-title">
              {selectedObject ? selectedObject.name : 'MyHouse Monitor'}
            </Title>
            {selectedObject && (
              <>
                <Paragraph className="page-subtitle">
                  Интерфейс строится от реальных объектов и сенсоров API.
                </Paragraph>
                <Space wrap>
                  <Tag color="cyan">{typeLabels[selectedObject.type] ?? selectedObject.type}</Tag>
                  <Tag color="geekblue">Источник: {sourceLabel}</Tag>
                  <Tag color={mlHealth?.status === 'ok' ? 'success' : 'error'}>
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
              Запустить ML-анализ
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
              {stressActive ? 'Стресс-тест активен...' : 'Стресс-тест'}
            </Button>
          </Space>
        </div>
      </Card>

      {objectsLoading && !selectedObject && (
        <Card className="surface-card"><Skeleton active /></Card>
      )}

      {!objectsLoading && !selectedObject && (
        <Empty description="Выберите объект в верхней панели для просмотра данных" />
      )}

      {selectedObject && <><Row gutter={[16, 16]}>
        <Col xs={24} md={8}>
          <Card className="surface-card stat-card">
            {healthLoading ? <Skeleton active paragraph={{ rows: 1 }} /> : (
              <Statistic
                title="Health Score"
                value={healthScore ? `${healthScore.score} (${healthScore.grade})` : '—'}
                valueStyle={{
                  color: healthScore
                    ? healthScore.grade === 'A' ? '#15803d'
                    : healthScore.grade === 'B' ? '#0f766e'
                    : healthScore.grade === 'C' ? '#d97706'
                    : '#d4380d'
                    : undefined,
                }}
              />
            )}
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card className="surface-card stat-card">
            {summaryLoading ? <Skeleton active paragraph={{ rows: 1 }} /> : (
              <Statistic
                title="Потребление"
                value={summary[0]?.average != null ? summary[0].average.toFixed(2) : '—'}
                suffix={summary[0]?.unit ?? 'кВт'}
                prefix={<ThunderboltOutlined />}
              />
            )}
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card className="surface-card stat-card">
            {rulLoading ? <Skeleton active paragraph={{ rows: 1 }} /> : (
              <>
                <Statistic
                  title="Прогноз (RUL)"
                  value={rul ? `${rul.rul_days} дн.` : '—'}
                  valueStyle={{
                    color: rul
                      ? rul.status === 'ok' ? '#15803d'
                      : rul.status === 'warning' ? '#d97706'
                      : '#d4380d'
                      : undefined,
                  }}
                />
                <Text type="secondary">
                  {rul ? `Статус: ${rul.status === 'ok' ? 'норма' : rul.status === 'warning' ? 'предупреждение' : 'критично'}` : 'Загрузка...'}
                </Text>
              </>
            )}
          </Card>
        </Col>
      </Row>

      <SummaryCards data={summary} isLoading={summaryLoading} error={summaryError} />

      <Row gutter={[16, 16]}>
        <Col xs={24} xl={16}>
          <ConsumptionChart
            key={selectedObject.id}
            objectItem={selectedObject}
            sensors={sensors}
            refetchInterval={stressActive ? POLL_MS : false}
          />
        </Col>
        <Col xs={24} xl={8}>
          <Card className="surface-card" title="Сенсоры объекта">
            {sensorsError ? (
              <Alert type="error" message="Не удалось загрузить сенсоры" showIcon />
            ) : (
              <List
                loading={sensorsLoading}
                dataSource={sensors}
                locale={{ emptyText: 'У объекта пока нет сенсоров' }}
                renderItem={(sensor) => (
                  <List.Item>
                    <List.Item.Meta
                      title={sensor.label}
                      description={`${sensor.unit} • ${sensor.reading_count.toLocaleString('ru-RU')} точек`}
                    />
                    <Text type="secondary">
                      {sensor.last_reading_at
                        ? new Date(sensor.last_reading_at).toLocaleString('ru-RU')
                        : 'нет данных'}
                    </Text>
                  </List.Item>
                )}
              />
            )}
          </Card>
        </Col>
      </Row>
      </>}
    </Space>
  );
};

export default Dashboard;
