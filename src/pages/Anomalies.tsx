import { useMemo, useState } from 'react';
import { Alert, Card, Empty, Select, Space, Statistic, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useOutletContext } from 'react-router-dom';
import type { AppLayoutContextValue } from '../components/MainLayout';
import { useStressTestContextOptional } from '../context/StressTestContext';
import { useAnomalies, type AnomalyRecord } from '../api/hooks';

const POLL_MS = 2000;

const { Paragraph, Text, Title } = Typography;

const severityConfig: Record<string, { color: string; label: string }> = {
  low: { color: 'green', label: 'Низкий' },
  medium: { color: 'gold', label: 'Средний' },
  high: { color: 'orange', label: 'Высокий' },
  critical: { color: 'red', label: 'Критический' },
};

const Anomalies = () => {
  const { selectedObject, selectedObjectId } = useOutletContext<AppLayoutContextValue>();
  const stress = useStressTestContextOptional();
  const stressActive = !!stress?.active;
  const metricsObjectId = stressActive && stress?.objectId ? stress.objectId : selectedObjectId;
  const [severity, setSeverity] = useState<string>();
  const { data = [], isLoading, error } = useAnomalies(
    metricsObjectId,
    severity,
    stressActive ? POLL_MS : false,
  );

  const columns = useMemo<ColumnsType<AnomalyRecord>>(
    () => [
      {
        title: 'Время',
        dataIndex: 'time',
        key: 'time',
        sorter: (a, b) => new Date(a.time).getTime() - new Date(b.time).getTime(),
        defaultSortOrder: 'descend',
        render: (time: string) => new Date(time).toLocaleString('ru-RU'),
      },
      {
        title: 'Сенсор',
        dataIndex: 'sensor_label',
        key: 'sensor_label',
        render: (value?: string | null, record?: AnomalyRecord) => value || record?.category || 'unknown',
      },
      {
        title: 'Уровень',
        dataIndex: 'severity',
        key: 'severity',
        render: (value: string) => {
          const config = severityConfig[value] || { color: 'default', label: value };
          return <Tag color={config.color}>{config.label}</Tag>;
        },
      },
      {
        title: 'Факт',
        dataIndex: 'value',
        key: 'value',
        sorter: (a, b) => a.value - b.value,
        render: (value: number) => value.toFixed(3),
      },
      {
        title: 'Ожидание',
        dataIndex: 'expected',
        key: 'expected',
        render: (value: number | null) => (value == null ? '—' : value.toFixed(3)),
      },
      {
        title: 'Отклонение',
        key: 'delta',
        render: (_, record) => {
          if (record.expected == null || record.expected === 0) {
            return '—';
          }

          const delta = ((record.value - record.expected) / Math.abs(record.expected)) * 100;
          return `${delta.toFixed(1)}%`;
        },
      },
    ],
    [],
  );

  if (!selectedObject) {
    return <Empty description="Нет выбранного объекта" />;
  }


  return (
    <Space direction="vertical" size={20} style={{ width: '100%' }}>
      <Card className="surface-card">
        <Space direction="vertical" size={8} style={{ width: '100%' }}>
          <Text className="eyebrow">Контроль качества сигнала</Text>
          <Title level={2} style={{ margin: 0 }}>
            Журнал аномалий
          </Title>
          <Paragraph style={{ margin: 0 }}>
            Показываем последние срабатывания для объекта <strong>{selectedObject.name}</strong>.
            Фильтр по severity работает прямо от backend API.
          </Paragraph>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <Select
              allowClear
              placeholder="Все уровни"
              value={severity}
              onChange={(value) => setSeverity(value)}
              style={{ minWidth: 180 }}
              options={Object.entries(severityConfig).map(([value, item]) => ({
                value,
                label: item.label,
              }))}
            />
            <Statistic title="Всего записей" value={data.length} />
          </div>
        </Space>
      </Card>

      {error ? (
        <Alert type="error" message="Ошибка загрузки аномалий" showIcon />
      ) : (
        <Card className="surface-card">
          <Table
            columns={columns}
            dataSource={data}
            loading={isLoading}
            rowKey="id"
            pagination={{ pageSize: 12, showSizeChanger: true }}
            locale={{
              emptyText: (
                <Empty
                  description="Срабатываний пока нет. После запуска ML-анализ появится здесь."
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                />
              ),
            }}
          />
        </Card>
      )}
    </Space>
  );
};

export default Anomalies;
