import { useMemo, useState } from 'react';
import { Button, Card, Col, Row, Segmented, Space, Statistic, Table, Tag, Typography } from 'antd';
import {
  BulbOutlined,
  DashboardOutlined,
  ThunderboltOutlined,
  ToolOutlined,
  UsbOutlined,
} from '@ant-design/icons';
import { useOutletContext } from 'react-router-dom';
import type { AppLayoutContextValue } from '../components/MainLayout';
import EquipmentDrawer from '../components/EquipmentDrawer';
import { useHealthScore, useObjectSensors, useRul, useSummary, type ObjectSensor } from '../api/hooks';

const { Text, Title } = Typography;

const CATEGORY_CONFIG: Record<string, { label: string; icon: typeof ThunderboltOutlined }> = {
  servers: { label: 'Серверы', icon: ThunderboltOutlined },
  cooling: { label: 'Охлаждение', icon: ToolOutlined },
  ups: { label: 'ИБП', icon: UsbOutlined },
  lighting: { label: 'Освещение', icon: BulbOutlined },
};

const isRecent = (ts?: string | null) =>
  !!ts && Date.now() - new Date(ts).getTime() < 24 * 3_600_000;

interface CategoryRow {
  key: string;
  category: string;
  sensors: ObjectSensor[];
  avgValue: number | null;
  unit: string;
  hasData: boolean;
}

const Equipment = () => {
  const { selectedObjectId } = useOutletContext<AppLayoutContextValue>();
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [drawerCategory, setDrawerCategory] = useState<string | null>(null);

  const { data: sensors = [], isLoading: sensorsLoading } = useObjectSensors(selectedObjectId);
  const { data: summary = [] } = useSummary(selectedObjectId);
  const { data: healthScore } = useHealthScore(selectedObjectId);
  const { data: rul } = useRul(selectedObjectId);

  const summaryByCategory = useMemo(() => {
    const map = new Map<string, { avg: number; unit: string }>();
    summary.forEach((s) => {
      if (!map.has(s.category)) {
        map.set(s.category, { avg: s.average, unit: s.unit });
      }
    });
    return map;
  }, [summary]);

  const rows = useMemo<CategoryRow[]>(() => {
    const grouped = sensors.reduce<Record<string, ObjectSensor[]>>((acc, s) => {
      acc[s.category] ??= [];
      acc[s.category].push(s);
      return acc;
    }, {});

    return Object.entries(grouped).map(([cat, catSensors]) => {
      const catSummary = summaryByCategory.get(cat);
      const hasData = catSensors.some((s) => isRecent(s.last_reading_at));
      return {
        key: cat,
        category: cat,
        sensors: catSensors,
        avgValue: catSummary?.avg ?? null,
        unit: catSummary?.unit ?? '',
        hasData,
      };
    });
  }, [sensors, summaryByCategory]);

  const filtered = useMemo(() => {
    return rows
      .filter((r) => categoryFilter === 'all' || r.category === categoryFilter)
      .filter((r) => {
        if (statusFilter === 'ok') return r.hasData;
        if (statusFilter === 'no-data') return !r.hasData;
        return true;
      });
  }, [rows, categoryFilter, statusFilter]);

  const drawerSensors = useMemo(
    () => sensors.filter((s) => s.category === drawerCategory),
    [sensors, drawerCategory],
  );

  const columns = [
    {
      title: 'Категория',
      dataIndex: 'category',
      key: 'category',
      render: (cat: string) => {
        const cfg = CATEGORY_CONFIG[cat] ?? { label: cat, icon: DashboardOutlined };
        const Icon = cfg.icon;
        return (
          <Space>
            <Icon style={{ color: '#0f766e' }} />
            <Text strong>{cfg.label}</Text>
          </Space>
        );
      },
    },
    {
      title: 'Сенсоров',
      dataIndex: 'sensors',
      key: 'count',
      render: (s: ObjectSensor[]) => s.length,
    },
    {
      title: 'Среднее',
      key: 'avg',
      render: (_: unknown, row: CategoryRow) =>
        row.avgValue != null ? (
          <Text>{row.avgValue.toFixed(2)} {row.unit}</Text>
        ) : (
          <Text type="secondary">—</Text>
        ),
    },
    {
      title: 'Статус',
      key: 'status',
      render: (_: unknown, row: CategoryRow) =>
        row.hasData ? (
          <Tag color="success">Норма</Tag>
        ) : (
          <Tag color="default">Нет данных</Tag>
        ),
    },
    {
      title: '',
      key: 'action',
      render: (_: unknown, row: CategoryRow) => (
        <Button size="small" onClick={() => setDrawerCategory(row.category)}>
          Подробнее
        </Button>
      ),
    },
  ];

  const healthColor =
    healthScore?.grade === 'A'
      ? '#15803d'
      : healthScore?.grade === 'B'
        ? '#0f766e'
        : healthScore?.grade === 'C'
          ? '#d97706'
          : '#d4380d';

  const rulColor =
    rul?.status === 'ok' ? '#15803d' : rul?.status === 'warning' ? '#d97706' : '#d4380d';

  return (
    <Space direction="vertical" size={20} style={{ width: '100%' }}>
      <Row gutter={[16, 16]}>
        <Col xs={24} md={8}>
          <Card className="surface-card stat-card">
            <Statistic
              title="Health Score"
              value={healthScore ? `${healthScore.score} (${healthScore.grade})` : '—'}
              valueStyle={{ color: healthScore ? healthColor : undefined }}
            />
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card className="surface-card stat-card">
            <Statistic
              title="Прогнозный ресурс (RUL)"
              value={rul ? `${rul.rul_days} дн.` : '—'}
              valueStyle={{ color: rul ? rulColor : undefined }}
            />
            <Text type="secondary">Уверенность: {rul ? 'низкая (эвристика)' : '—'}</Text>
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card className="surface-card stat-card">
            <Statistic title="Категорий оборудования" value={rows.length} />
          </Card>
        </Col>
      </Row>

      <Card
        className="surface-card"
        title={<Title level={4} style={{ margin: 0 }}>Оборудование по категориям</Title>}
        extra={
          <Space wrap>
            <Segmented
              options={[
                { label: 'Все', value: 'all' },
                ...Object.entries(CATEGORY_CONFIG).map(([k, v]) => ({ label: v.label, value: k })),
              ]}
              value={categoryFilter}
              onChange={(v) => setCategoryFilter(String(v))}
            />
            <Segmented
              options={[
                { label: 'Все', value: 'all' },
                { label: 'Норма', value: 'ok' },
                { label: 'Нет данных', value: 'no-data' },
              ]}
              value={statusFilter}
              onChange={(v) => setStatusFilter(String(v))}
            />
          </Space>
        }
      >
        <Table
          columns={columns}
          dataSource={filtered}
          loading={sensorsLoading}
          pagination={false}
          locale={{ emptyText: 'Нет оборудования для выбранного объекта' }}
        />
      </Card>

      <EquipmentDrawer
        open={!!drawerCategory}
        category={drawerCategory ?? ''}
        sensors={drawerSensors}
        objectId={selectedObjectId}
        onClose={() => setDrawerCategory(null)}
      />
    </Space>
  );
};

export default Equipment;
