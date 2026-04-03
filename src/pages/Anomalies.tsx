import { Table, Tag, Typography, Empty, Alert, Skeleton } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useAnomalies, type AnomalyRecord } from '../api/hooks';

const { Title } = Typography;

const severityConfig: Record<string, { color: string; label: string }> = {
  low: { color: 'green', label: 'Низкий' },
  medium: { color: 'gold', label: 'Средний' },
  high: { color: 'orange', label: 'Высокий' },
  critical: { color: 'red', label: 'Критический' },
};

const categoryLabels: Record<string, string> = {
  servers: 'Серверы',
  cooling: 'Охлаждение',
  ups: 'ИБП',
  lighting: 'Освещение',
};

const columns: ColumnsType<AnomalyRecord> = [
  {
    title: 'Время',
    dataIndex: 'time',
    key: 'time',
    sorter: (a, b) => new Date(a.time).getTime() - new Date(b.time).getTime(),
    defaultSortOrder: 'descend',
    render: (time: string) =>
      new Date(time).toLocaleString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }),
  },
  {
    title: 'Категория оборудования',
    dataIndex: 'category',
    key: 'category',
    filters: Object.entries(categoryLabels).map(([value, text]) => ({ text, value })),
    onFilter: (value, record) => record.category === value,
    render: (cat: string) => categoryLabels[cat] || cat,
  },
  {
    title: 'Уровень',
    dataIndex: 'severity',
    key: 'severity',
    filters: Object.entries(severityConfig).map(([value, { label }]) => ({
      text: label,
      value,
    })),
    onFilter: (value, record) => record.severity === value,
    render: (severity: string) => {
      const config = severityConfig[severity] || { color: 'default', label: severity };
      return <Tag color={config.color}>{config.label}</Tag>;
    },
  },
  {
    title: 'Значение',
    dataIndex: 'value',
    key: 'value',
    sorter: (a, b) => a.value - b.value,
    render: (val: number) => val.toFixed(2),
  },
];

const Anomalies = () => {
  const { data, isLoading, error } = useAnomalies();

  const tableContent = () => {
    if (isLoading) {
      return <Skeleton active />;
    }

    if (error) {
      return (
        <Alert
          type="error"
          message="Ошибка загрузки аномалий"
          style={{ margin: 20 }}
          showIcon
        />
      );
    }
    
    return (
        <Table
            columns={columns}
            dataSource={data}
            rowKey="id"
            locale={{
            emptyText: (
                <Empty
                description="Аномалий не обнаружено"
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                />
            ),
            }}
            pagination={{ pageSize: 20, showSizeChanger: true }}
        />
    )
  }


  return (
    <div>
      <Title level={3} style={{ color: '#5D3C97' }}>Аномалии</Title>
      {tableContent()}
    </div>
  );
};

export default Anomalies;
