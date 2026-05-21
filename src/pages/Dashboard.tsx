import { useMemo } from 'react';
import {
  Alert,
  Button,
  Card,
  Col,
  Empty,
  List,
  Row,
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
import { useHealthScore, useObjectSensors, useRul, useSummary, useTriggerDetection } from '../api/hooks';

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
  const { data: sensors = [], isLoading: sensorsLoading, error: sensorsError } =
    useObjectSensors(selectedObjectId);
  const { data: summary = [], isLoading: summaryLoading, error: summaryError } =
    useSummary(selectedObjectId);
  const detectMutation = useTriggerDetection();
  const { data: healthScore } = useHealthScore(selectedObjectId);
  const { data: rul } = useRul(selectedObjectId);
  const [messageApi, contextHolder] = message.useMessage();

  const sourceLabel = useMemo(() => {
    const source = selectedObject?.meta_data?.source;
    if (typeof source !== 'string') {
      return 'manual';
    }
    return source;
  }, [selectedObject?.meta_data]);

  const handleDetect = async () => {
    if (!selectedObjectId) {
      return;
    }

    try {
      const result = await detectMutation.mutateAsync({
        object_id: selectedObjectId,
        days: 1,
      });
      await queryClient.invalidateQueries({ queryKey: ['anomalies', selectedObjectId] });
      messageApi.success(
        `ML завершил анализ: найдено ${result.anomalies_found}, записано ${result.anomalies_inserted}`,
      );
    } catch (error) {
      const text = error instanceof Error ? error.message : 'Неизвестная ошибка';
      messageApi.error(`Не удалось запустить ML-анализ: ${text}`);
    }
  };

  if (objectsLoading && !selectedObject) {
    return <Card className="hero-card">Загрузка объектов...</Card>;
  }

  if (!selectedObject) {
    return <Empty description="Сначала зарегистрируйте объект и сенсоры, затем импортируйте данные" />;
  }

  return (
    <Space direction="vertical" size={20} style={{ width: '100%' }}>
      {contextHolder}

      <Card className="hero-card">
        <div className="hero-card__content">
          <div>
            <Text className="eyebrow">Активный объект</Text>
            <Title level={1} className="page-title">
              {selectedObject.name}
            </Title>
            <Paragraph className="page-subtitle">
              Интерфейс теперь строится от реальных объектов и сенсоров API. Это позволяет
              одинаково работать с demo-данными и с импортированным motor dataset.
            </Paragraph>
            <Space wrap>
              <Tag color="cyan">{typeLabels[selectedObject.type] ?? selectedObject.type}</Tag>
              <Tag color="geekblue">Источник: {sourceLabel}</Tag>
              <Tag color={mlHealth?.status === 'ok' ? 'success' : 'error'}>
                ML {mlHealth?.status === 'ok' ? 'доступен' : 'недоступен'}
              </Tag>
            </Space>
          </div>

          <Space wrap>
            <Button
              type="primary"
              size="large"
              icon={<ExperimentOutlined />}
              onClick={handleDetect}
              loading={detectMutation.isPending}
            >
              Запустить ML-анализ
            </Button>
          </Space>
        </div>
      </Card>

      <Row gutter={[16, 16]}>
        <Col xs={24} md={8}>
          <Card className="surface-card stat-card">
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
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card className="surface-card stat-card">
            <Statistic
              title="Потребление"
              value={summary[0]?.average != null ? summary[0].average.toFixed(2) : '—'}
              suffix={summary[0]?.unit ?? 'кВт'}
              prefix={<ThunderboltOutlined />}
            />
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card className="surface-card stat-card">
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
    </Space>
  );
};

export default Dashboard;
