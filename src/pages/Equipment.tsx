import { useMemo, useState } from 'react';
import { Button, Card, Col, Grid, Row, Segmented, Select, Space, Statistic, Table, Tag, Typography } from 'antd';
import {
  BulbOutlined,
  DashboardOutlined,
  ThunderboltOutlined,
  ToolOutlined,
  UsbOutlined,
} from '@ant-design/icons';
import { useOutletContext } from 'react-router-dom';
import type { AppLayoutContextValue } from '../components/MainLayout';
import { useStressTestContextOptional } from '../context/StressTestContext';
import EquipmentDrawer from '../components/EquipmentDrawer';
import { useHealthScore, useObjectSensors, useRul, useSummary, type ObjectSensor } from '../api/hooks';
import { averageByCategory, healthColor, rulColor } from '../utils/metricsUtils';

const POLL_MS = 2000;
const METRICS_POLL_MS = 30_000;

const { Text, Title } = Typography;
const { useBreakpoint } = Grid;

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
  const screens = useBreakpoint();
  const isMobile = !screens.md;
  const { selectedObjectId, selectedObject } = useOutletContext<AppLayoutContextValue>();
  const stress = useStressTestContextOptional();
  const stressActive = !!stress?.active;
  const metricsObjectId = stressActive && stress?.objectId ? stress.objectId : selectedObjectId;
  const healthSince = stressActive && stress?.startedAt
    ? new Date(stress.startedAt).toISOString()
    : undefined;
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [drawerCategory, setDrawerCategory] = useState<string | null>(null);

  const metricsPoll = stressActive ? POLL_MS : METRICS_POLL_MS;

  const { data: sensors = [], isLoading: sensorsLoading } = useObjectSensors(metricsObjectId);
  const { data: summary = [] } = useSummary(metricsObjectId, metricsPoll);
  const { data: healthScore, isLoading: healthLoading } = useHealthScore(
    metricsObjectId,
    metricsPoll,
    healthSince,
  );
  const { data: rul, isLoading: rulLoading } = useRul(metricsObjectId, metricsPoll, healthSince);

  const summaryByCategory = useMemo(() => {
    const map = new Map<string, { avg: number; unit: string }>();
    for (const cat of Object.keys(CATEGORY_CONFIG)) {
      const row = averageByCategory(summary, cat);
      if (row) map.set(cat, row);
    }
    return map;
  }, [summary]);

  const rows = useMemo<CategoryRow[]>(() => {
    const grouped = sensors.reduce<Record<string, ObjectSensor[]>>((acc, s) => {
      acc[s.category] ??= [];
      acc[s.category].push(s);
      return acc;
    }, {});

    // Все 4 категории показываем всегда — пустые отображаются серым
    return Object.keys(CATEGORY_CONFIG).map((cat) => {
      const catSensors = grouped[cat] ?? [];
      const catSummary = summaryByCategory.get(cat);
      const hasData = stressActive
        ? catSummary != null || catSensors.length > 0
        : catSensors.some((s) => isRecent(s.last_reading_at));
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

  const cellStyle = { padding: '10px 16px' };

  const columns = [
    {
      title: 'Категория',
      dataIndex: 'category',
      key: 'category',
      onCell: () => ({ style: cellStyle }),
      onHeaderCell: () => ({ style: cellStyle }),
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
      onCell: () => ({ style: cellStyle }),
      onHeaderCell: () => ({ style: cellStyle }),
      render: (s: ObjectSensor[]) => s.length,
    },
    {
      title: 'Среднее',
      key: 'avg',
      onCell: () => ({ style: cellStyle }),
      onHeaderCell: () => ({ style: cellStyle }),
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
      onCell: () => ({ style: cellStyle }),
      onHeaderCell: () => ({ style: cellStyle }),
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
      onCell: () => ({ style: cellStyle }),
      onHeaderCell: () => ({ style: cellStyle }),
      render: (_: unknown, row: CategoryRow) => (
        <Button size="small" onClick={() => setDrawerCategory(row.category)}>
          Подробнее
        </Button>
      ),
    },
  ];

  const healthTint = healthColor(healthScore?.grade);
  const rulTint = rulColor(rul?.status);

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Row gutter={[10, 10]}>
        <Col xs={24} sm={8}>
          <Card className="surface-card stat-card" style={{ height: '100%' }}>
            {healthLoading ? (
              <Statistic title={stressActive ? 'Health (сессия)' : 'Health Score'} value="—" />
            ) : (
            <Statistic
              title={stressActive ? 'Health (сессия)' : 'Health Score'}
              value={healthScore ? `${healthScore.score}` : '—'}
              suffix={healthScore ? ` ${healthScore.grade}` : ''}
              valueStyle={{ color: healthScore ? healthTint : undefined, fontSize: 'clamp(16px, 3.5vw, 26px)', fontWeight: 700 }}
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
            {rulLoading ? (
              <Statistic title={stressActive ? 'RUL (сессия)' : 'RUL'} value="—" />
            ) : (
            <Statistic
              title={stressActive ? 'RUL (сессия)' : 'RUL'}
              value={rul ? `${rul.rul_days}` : '—'}
              suffix={rul ? ' дн.' : ''}
              valueStyle={{ color: rul ? rulTint : undefined, fontSize: 'clamp(16px, 3.5vw, 26px)', fontWeight: 700 }}
            />
            )}
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card className="surface-card stat-card" style={{ height: '100%' }}>
            <Statistic
              title="Категорий"
              value={rows.length}
              valueStyle={{ fontSize: 'clamp(16px, 3.5vw, 26px)', fontWeight: 700 }}
            />
          </Card>
        </Col>
      </Row>

      <Card
        className="surface-card table-card"
        title={<Title level={4} style={{ margin: 0 }}>Оборудование по категориям</Title>}
        extra={!isMobile ? (
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
        ) : undefined}
      >
        {isMobile && (
          <Space direction="vertical" size={8} style={{ width: '100%', marginBottom: 12 }}>
            <Select
              style={{ width: '100%' }}
              value={categoryFilter}
              onChange={setCategoryFilter}
              options={[
                { label: 'Все категории', value: 'all' },
                ...Object.entries(CATEGORY_CONFIG).map(([k, v]) => ({ label: v.label, value: k })),
              ]}
            />
            <Select
              style={{ width: '100%' }}
              value={statusFilter}
              onChange={setStatusFilter}
              options={[
                { label: 'Все статусы', value: 'all' },
                { label: 'Норма', value: 'ok' },
                { label: 'Нет данных', value: 'no-data' },
              ]}
            />
          </Space>
        )}
        <Table
          columns={columns}
          dataSource={filtered}
          loading={sensorsLoading}
          pagination={false}
          size="small"
          scroll={{ x: 480 }}
          locale={{ emptyText: 'Нет оборудования для выбранного объекта' }}
        />
      </Card>

      <EquipmentDrawer
        open={!!drawerCategory}
        category={drawerCategory ?? ''}
        sensors={drawerSensors}
        objectId={metricsObjectId}
        objectItem={selectedObject}
        onClose={() => setDrawerCategory(null)}
      />
    </Space>
  );
};

export default Equipment;
