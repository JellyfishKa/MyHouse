import { useState } from 'react';
import { Layout, Menu } from 'antd';
import { Link, Outlet } from 'react-router-dom';
import {
  DashboardOutlined,
  WarningOutlined,
} from '@ant-design/icons';

const { Header, Content, Sider } = Layout;

const items = [
  {
    key: '1',
    icon: <DashboardOutlined />,
    label: <Link to="/">Дашборд</Link>,
  },
  {
    key: '2',
    icon: <WarningOutlined />,
    label: <Link to="/anomalies">Аномалии</Link>,
  },
];

const MainLayout = () => {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider collapsible collapsed={collapsed} onCollapse={(value) => setCollapsed(value)}>
        <div className="demo-logo-vertical" />
        <Menu theme="dark" defaultSelectedKeys={['1']} mode="inline" items={items} />
      </Sider>
      <Layout>
        <Header style={{ padding: 0, background: '#fff', textAlign: 'center' }}>
          <h2 style={{ margin: 0, color: '#001529' }}>МойДом</h2>
        </Header>
        <Content style={{ margin: '0 16px' }}>
          <div style={{ padding: 24, minHeight: 360, background: '#fff' }}>
            <Outlet />
          </div>
        </Content>
      </Layout>
    </Layout>
  );
};

export default MainLayout;
