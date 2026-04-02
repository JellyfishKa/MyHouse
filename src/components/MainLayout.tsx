import { useState } from 'react';
import { Layout, Menu, ConfigProvider } from 'antd';
import { Link, Outlet, useLocation } from 'react-router-dom';
import {
  DashboardOutlined,
  WarningOutlined,
} from '@ant-design/icons';

const { Header, Content, Sider } = Layout;

const items = [
  {
    key: '/',
    icon: <DashboardOutlined />,
    label: <Link to="/">Дашборд</Link>,
  },
  {
    key: '/anomalies',
    icon: <WarningOutlined />,
    label: <Link to="/anomalies">Аномалии</Link>,
  },
];

const MainLayout = () => {
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();

  return (
    <ConfigProvider
      theme={{
        token: {
          colorPrimary: '#5D3C97',
          colorLink: '#5B72DA',
          colorInfo: '#5B72DA',
        },
      }}
    >
      <Layout style={{ minHeight: '100vh' }}>
        <Sider
          collapsible
          collapsed={collapsed}
          onCollapse={(value) => setCollapsed(value)}
          style={{ background: '#2B1655' }}
        >
          <div
            style={{
              height: 48,
              margin: 16,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              fontWeight: 700,
              fontSize: collapsed ? 14 : 18,
              letterSpacing: 1,
            }}
          >
            {collapsed ? 'МД' : 'МойДом'}
          </div>
          <Menu
            theme="dark"
            selectedKeys={[location.pathname]}
            mode="inline"
            items={items}
            style={{ background: '#2B1655' }}
          />
        </Sider>
        <Layout>
          <Header
            style={{
              padding: '0 24px',
              background: '#fff',
              borderBottom: '2px solid #5D3C97',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <h2 style={{ margin: 0, color: '#5D3C97' }}>
              Мониторинг энергопотребления
            </h2>
          </Header>
          <Content style={{ margin: '16px' }}>
            <div style={{ padding: 24, minHeight: 360, background: '#fff', borderRadius: 8 }}>
              <Outlet />
            </div>
          </Content>
        </Layout>
      </Layout>
    </ConfigProvider>
  );
};

export default MainLayout;
