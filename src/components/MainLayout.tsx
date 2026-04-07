import { useMemo, useState } from 'react';
import { ConfigProvider, Layout, Menu, Select, Space, Spin, Tag, Typography } from 'antd';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { DashboardOutlined, DeploymentUnitOutlined, WarningOutlined } from '@ant-design/icons';
import { useMlHealth, useObjects, type MlHealth, type MonitoringObject } from '../api/hooks';

const { Header, Content, Sider } = Layout;
const { Text, Title } = Typography;

const items = [
  {
    key: '/',
    icon: <DashboardOutlined />,
    label: <Link to="/">Обзор</Link>,
  },
  {
    key: '/anomalies',
    icon: <WarningOutlined />,
    label: <Link to="/anomalies">Аномалии</Link>,
  },
];

export interface AppLayoutContextValue {
  objects: MonitoringObject[];
  selectedObject?: MonitoringObject;
  selectedObjectId?: string;
  setSelectedObjectId: (value: string) => void;
  mlHealth?: MlHealth;
  objectsLoading: boolean;
}

const formatMlStatus = (mlHealth?: MlHealth) => {
  if (!mlHealth) {
    return { color: 'default', label: 'ML: неизвестно' };
  }

  if (mlHealth.status === 'ok') {
    return { color: 'success', label: 'ML: online' };
  }

  return { color: 'error', label: 'ML: offline' };
};

const MainLayout = () => {
  const [collapsed, setCollapsed] = useState(false);
  const [selectedObjectId, setSelectedObjectId] = useState<string>();
  const location = useLocation();
  const { data: objects = [], isLoading: objectsLoading } = useObjects();
  const { data: mlHealth } = useMlHealth();

  const selectedObject = useMemo(
    () => objects.find((item) => item.id === selectedObjectId) ?? objects[0],
    [objects, selectedObjectId],
  );

  const resolvedObjectId = selectedObject?.id;

  const layoutContext = useMemo<AppLayoutContextValue>(
    () => ({
      objects,
      selectedObject,
      selectedObjectId: resolvedObjectId,
      setSelectedObjectId,
      mlHealth,
      objectsLoading,
    }),
    [mlHealth, objects, objectsLoading, resolvedObjectId, selectedObject],
  );

  const mlStatus = formatMlStatus(mlHealth);

  return (
    <ConfigProvider
      theme={{
        token: {
          colorPrimary: '#0f766e',
          colorInfo: '#0f766e',
          colorSuccess: '#15803d',
          borderRadius: 18,
          colorBgLayout: '#f3f7f6',
          fontFamily: "Aptos, 'Segoe UI', 'Trebuchet MS', sans-serif",
        },
      }}
    >
      <Layout className="shell-layout">
        <Sider
          collapsible
          collapsed={collapsed}
          onCollapse={(value) => setCollapsed(value)}
          className="shell-sidebar"
          breakpoint="lg"
        >
          <div className="shell-brand">
            <div className="shell-brand__mark">MH</div>
            {!collapsed && (
              <div>
                <Title level={4} style={{ margin: 0, color: '#effcf9' }}>
                  MyHouse
                </Title>
                <Text style={{ color: 'rgba(239, 252, 249, 0.72)' }}>
                  Мониторинг телеметрии
                </Text>
              </div>
            )}
          </div>

          <Menu
            selectedKeys={[location.pathname]}
            mode="inline"
            items={items}
            className="shell-menu"
          />
        </Sider>

        <Layout>
          <Header className="shell-header">
            <div>
              <Text className="eyebrow">Панель наблюдения</Text>
              <Title level={2} className="shell-title">
                Телеметрия, датасеты и аномалии
              </Title>
            </div>

            <Space size={12} wrap>
              <Tag color={mlStatus.color}>{mlStatus.label}</Tag>
              <Tag color="processing">
                <DeploymentUnitOutlined /> {objects.length} объектов
              </Tag>
              <Select
                className="object-select"
                placeholder="Выберите объект"
                loading={objectsLoading}
                value={resolvedObjectId}
                onChange={setSelectedObjectId}
                options={objects.map((item) => ({
                  label: item.name,
                  value: item.id,
                }))}
                notFoundContent={objectsLoading ? <Spin size="small" /> : 'Объекты не найдены'}
              />
            </Space>
          </Header>

          <Content className="shell-content">
            <Outlet context={layoutContext} />
          </Content>
        </Layout>
      </Layout>
    </ConfigProvider>
  );
};

export default MainLayout;
