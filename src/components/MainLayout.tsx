import React, { useMemo, useState } from 'react';
import { ConfigProvider, Dropdown, Grid, Layout, Menu, Select, Space, Spin, Tag, Typography } from 'antd';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  AlertOutlined,
  DashboardOutlined,
  DeploymentUnitOutlined,
  DownOutlined,
  ToolOutlined,
} from '@ant-design/icons';
import { useMlHealth, useObjects, type MlHealth, type MonitoringObject } from '../api/hooks';
import { StressTestProvider, useStressTestContextOptional } from '../context/StressTestContext';

const { Header, Content, Sider } = Layout;
const { Text, Title } = Typography;
const { useBreakpoint } = Grid;

const navLinks = [
  { key: '/', icon: <DashboardOutlined />, label: 'Обзор' },
  { key: '/equipment', icon: <ToolOutlined />, label: 'Оборудование' },
  { key: '/anomalies', icon: <AlertOutlined />, label: 'Аномалии' },
];

const desktopMenuItems = navLinks.map(({ key, icon, label }) => ({
  key,
  icon,
  label: <Link to={key}>{label}</Link>,
}));

export interface AppLayoutContextValue {
  objects: MonitoringObject[];
  selectedObject?: MonitoringObject;
  selectedObjectId?: string;
  setSelectedObjectId: (value: string) => void;
  mlHealth?: MlHealth;
  objectsLoading: boolean;
}

const formatMlStatus = (mlHealth?: MlHealth) => {
  if (!mlHealth) return { ok: false, label: 'ML: неизвестно' };
  return mlHealth.status === 'ok' ? { ok: true, label: 'ML: online' } : { ok: false, label: 'ML: offline' };
};

const pageTitle: Record<string, string> = {
  '/': 'Dashboard',
  '/equipment': 'Оборудование',
  '/anomalies': 'Аномалии',
};

const antdTheme = {
  token: {
    colorPrimary: '#2ecc72',
    colorInfo: '#16a34a',
    colorSuccess: '#15803d',
    colorWarning: '#d97706',
    colorError: '#dc2626',
    borderRadius: 10,
    colorBgLayout: '#d8ddd4',
    colorBgContainer: '#ecf0e8',
    colorBgElevated: '#f0f4ed',
    colorText: '#0d1f15',
    colorTextSecondary: '#6a9478',
    colorBorder: 'rgba(13,40,24,0.12)',
    fontFamily: "'Inter', 'Segoe UI', sans-serif",
    fontSize: 13,
    controlHeight: 36,
  },
  components: {
    Menu: {
      itemBg: 'transparent',
      itemSelectedBg: 'rgba(46,204,114,0.16)',
      itemSelectedColor: '#2ecc72',
      itemColor: '#ecf0e8',
      itemHoverBg: 'rgba(46,204,114,0.1)',
      itemHoverColor: '#ecf0e8',
    },
    Table: {
      headerBg: 'rgba(13,40,24,0.04)',
      rowHoverBg: 'rgba(46,204,114,0.05)',
      borderColor: 'rgba(13,40,24,0.07)',
    },
    Card: { colorBgContainer: '#ecf0e8' },
    Collapse: { colorBgContainer: '#ecf0e8' },
  },
};

/* ─── Логотип с сервера ─────────────────────────────────── */
const LogoMark = ({ size }: { size: number }) => (
  <div
    style={{
      width: size,
      height: size,
      borderRadius: size * 0.26,
      overflow: 'hidden',
      flexShrink: 0,
      display: 'grid',
      placeItems: 'center',
    }}
  >
    <img src="/logo.svg" alt="ПУЛЬСТОК" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
  </div>
);

/* ─── Mobile layout ─────────────────────────────────────── */
const MobileLayout = ({
  context,
  children,
}: {
  context: AppLayoutContextValue;
  children: React.ReactNode;
}) => {
  const location = useLocation();
  const navigate = useNavigate();
  const stress = useStressTestContextOptional();
  const mlStatus = formatMlStatus(context.mlHealth);
  const title = pageTitle[location.pathname] ?? 'ПУЛЬСТОК';
  const currentNav = navLinks.find((n) => n.key === location.pathname);

  const dropdownItems = {
    items: navLinks.map(({ key, icon, label }) => ({
      key,
      icon: React.cloneElement(icon as React.ReactElement<{ style?: React.CSSProperties }>, { style: { color: '#ecf0e8', fontSize: 16 } }),
      label: (
        <span
          style={{
            fontWeight: location.pathname === key ? 700 : 500,
            color: location.pathname === key ? '#2ecc72' : '#ecf0e8',
            fontSize: 15,
          }}
        >
          {label}
        </span>
      ),
    })),
    onClick: ({ key }: { key: string }) => navigate(key),
  };

  return (
    <div className="mobile-shell">
      <header className="mobile-topbar">
        <div className="mobile-topbar__left">
          <LogoMark size={34} />

          <Dropdown
            menu={dropdownItems}
            trigger={['click']}
            placement="bottomLeft"
            overlayClassName="mobile-nav-menu"
          >
            <button className="mobile-nav-dropdown-btn" aria-label="Навигация">
              <span className="mobile-nav-dropdown-label">
                {currentNav && React.cloneElement(currentNav.icon as React.ReactElement<{ style?: React.CSSProperties }>, { style: { fontSize: 16 } })}
                <span>{title}</span>
              </span>
              <DownOutlined style={{ fontSize: 11, color: '#ecf0e8', opacity: 0.6 }} />
            </button>
          </Dropdown>
        </div>

        <div className="mobile-topbar__right">
          <span
            className="mobile-ml-dot"
            style={{ background: mlStatus.ok ? '#2ecc72' : '#ef4444' }}
            title={mlStatus.label}
          />
          <Select
            size="small"
            placeholder="Объект"
            loading={context.objectsLoading}
            value={context.selectedObjectId}
            onChange={context.setSelectedObjectId}
            disabled={stress?.active}
            options={context.objects.map((o) => ({ label: o.name, value: o.id }))}
            notFoundContent={context.objectsLoading ? <Spin size="small" /> : 'Нет данных'}
            className="mobile-object-select"
            popupMatchSelectWidth={false}
          />
        </div>
      </header>

      <main className="mobile-content">{children}</main>
    </div>
  );
};

/* ─── Desktop layout ────────────────────────────────────── */
const DesktopLayout = ({
  context,
  children,
}: {
  context: AppLayoutContextValue;
  children: React.ReactNode;
}) => {
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();
  const stress = useStressTestContextOptional();
  const mlStatus = formatMlStatus(context.mlHealth);
  const title = pageTitle[location.pathname] ?? 'ПУЛЬСТОК';

  return (
    <Layout className="shell-layout">
      <Sider
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        className="shell-sidebar"
        breakpoint="lg"
        style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}
      >
        <div className="shell-brand">
          <LogoMark size={38} />
          {!collapsed && (
            <div>
              <div className="shell-brand-name">ПУЛЬСТОК</div>
              <div className="shell-brand-sub">Monitoring</div>
            </div>
          )}
        </div>

        {!collapsed && <div className="sidebar-section-label">Меню</div>}
        <Menu selectedKeys={[location.pathname]} mode="inline" items={desktopMenuItems} className="shell-menu" />

        <div style={{ flex: 1 }} />
      </Sider>

      <Layout>
        <Header className="shell-header">
          <div>
            <Text className="eyebrow">Панель наблюдения</Text>
            <Title level={2} className="shell-title" style={{ marginBottom: 2 }}>
              {title}
            </Title>
          </div>
          <Space size={10} wrap>
            <Tag
              color={mlStatus.ok ? 'success' : 'error'}
              style={{ borderRadius: 20, padding: '3px 10px', margin: 0, fontWeight: 500 }}
            >
              {mlStatus.label}
            </Tag>
            <Tag color="processing" style={{ borderRadius: 20, padding: '3px 10px', margin: 0 }}>
              <DeploymentUnitOutlined /> {context.objects.length} объектов
            </Tag>
            <Select
              className="object-select"
              placeholder="Выберите объект"
              loading={context.objectsLoading}
              value={context.selectedObjectId}
              onChange={context.setSelectedObjectId}
              disabled={stress?.active}
              options={context.objects.map((o) => ({ label: o.name, value: o.id }))}
              notFoundContent={context.objectsLoading ? <Spin size="small" /> : 'Объекты не найдены'}
              style={{ minWidth: 220 }}
            />
          </Space>
        </Header>
        <Content className="shell-content">{children}</Content>
      </Layout>
    </Layout>
  );
};

/* ─── Root ──────────────────────────────────────────────── */
const MainLayout = () => {
  const [selectedObjectId, setSelectedObjectId] = useState<string>();
  const { data: objects = [], isLoading: objectsLoading } = useObjects();
  const { data: mlHealth } = useMlHealth();
  const screens = useBreakpoint();
  const isMobile = !screens.md;

  const selectedObject = useMemo(
    () => objects.find((o) => o.id === selectedObjectId) ?? objects[0],
    [objects, selectedObjectId],
  );

  const layoutContext = useMemo<AppLayoutContextValue>(
    () => ({
      objects,
      selectedObject,
      selectedObjectId: selectedObject?.id,
      setSelectedObjectId,
      mlHealth,
      objectsLoading,
    }),
    [mlHealth, objects, objectsLoading, selectedObject],
  );

  const outlet = <Outlet context={layoutContext} />;

  return (
    <ConfigProvider theme={antdTheme}>
      <StressTestProvider objectId={selectedObject?.id}>
        {isMobile
          ? <MobileLayout context={layoutContext}>{outlet}</MobileLayout>
          : <DesktopLayout context={layoutContext}>{outlet}</DesktopLayout>
        }
      </StressTestProvider>
    </ConfigProvider>
  );
};

export default MainLayout;
