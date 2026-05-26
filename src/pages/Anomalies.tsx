import { useMemo, useState } from 'react';
import { Alert, Card, Empty, Select, Space, Statistic, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useOutletContext } from 'react-router-dom';
import type { AppLayoutContextValue } from '../components/MainLayout';
import { useStressTestContextOptional } from '../context/StressTestContext';
import { useAnomalies, type AnomalyRecord } from '../api/hooks';
import { formatAnomalyDeviation } from '../utils/anomalyUtils';

const POLL_MS = 2000;

const { Paragraph, Text, Title } = Typography;

const severityConfig: Record<string, { color: string; label: string }> = {
  low: { color: 'green', label: 'Низкий' },
  medium: { color: 'gold', label: 'Средний' },
  high: { color: 'orange', label: 'Высокий' },
  critical: { color: 'red', label: 'Критический' },
};

function formatDeviation(record: AnomalyRecord) {
  return formatAnomalyDeviation(record);
}

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
        width: 140,
        sorter: (a, b) => new Date(a.time).getTime() - new Date(b.time).getTime(),
        defaultSortOrder: 'descend',
        render: (time: string) => new Date(time).toLocaleString('ru-RU', {
          day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
        }),
      },
      {
        title: 'Сенсор',
        dataIndex: 'sensor_label',
        key: 'sensor_label',
        ellipsis: true,
        render: (value?: string | null, record?: AnomalyRecord) => value || record?.category || '—',
      },
      {
        title: 'Уровень',
        dataIndex: 'severity',
        key: 'severity',
        width: 100,
        render: (value: string) => {
          const config = severityConfig[value] || { color: 'default', label: value };
          return <Tag color={config.color}>{config.label}</Tag>;
        },
      },
      {
        title: 'Факт, Вт',
        dataIndex: 'value',
        key: 'value',
        width: 90,
        render: (value: number) => value.toFixed(1),
      },
      {
        title: 'Норма, Вт',
        dataIndex: 'expected',
        key: 'expected',
        width: 90,
        render: (value: number | null) => (value == null ? '—' : value.toFixed(1)),
      },
      {
        title: 'Δ',
        key: 'delta',
        width: 72,
        render: (_, record) => {
          const { text, color } = formatDeviation(record);
          return color ? <Text style={{ color, fontWeight: 600 }}>{text}</Text> : text;
        },
      },
    ],
    [],
  );

  if (!selectedObject) {
    return <Empty description="Нет выбранного объекта" />;
  }

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Card className="surface-card">
        <Space direction="vertical" size={8} style={{ width: '100%' }}>
          <Text className="eyebrow">Предиктивный контроль</Text>
          <Title level={2} style={{ margin: 0 }}>
            Журнал аномалий
          </Title>
          <Paragraph style={{ margin: 0 }}>
            Объект <strong>{selectedObject.name}</strong> — отклонения от нормы в процентах (±8…42% по severity).
          </Paragraph>
          <div className="anomalies-toolbar">
            <Select
              allowClear
              placeholder="Все уровни"
              value={severity}
              onChange={(value) => setSeverity(value)}
              style={{ minWidth: 160, flex: '1 1 160px' }}
              options={Object.entries(severityConfig).map(([value, item]) => ({
                value,
                label: item.label,
              }))}
            />
            <Statistic title="Записей" value={data.length} style={{ flex: '0 0 auto' }} />
          </div>
        </Space>
      </Card>

      {error ? (
        <Alert type="error" message="Ошибка загрузки аномалий" showIcon />
      ) : (
        <Card className="surface-card table-card">
          <Table
            columns={columns}
            dataSource={data}
            loading={isLoading}
            rowKey="id"
            size="small"
            scroll={{ x: 520 }}
            pagination={{ pageSize: 12, showSizeChanger: false, simple: true }}
            locale={{
              emptyText: (
                <Empty
                  description="Срабатываний пока нет. Запустите ML-анализ или стресс-тест."
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
