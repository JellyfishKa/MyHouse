import React, { Suspense } from 'react';
import { Spin } from 'antd';
import SummaryCards from '../components/SummaryCards';

const ConsumptionChart = React.lazy(() => import('../components/ConsumptionChart'));

const Dashboard = () => {
  return (
    <div>
      <h1>Дашборд</h1>
      <SummaryCards />
      <Suspense fallback={<div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '400px' }}><Spin size="large" /></div>}>
        <ConsumptionChart />
      </Suspense>
    </div>
  );
};

export default Dashboard;
