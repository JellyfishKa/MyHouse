import React, { Suspense } from 'react';
import { Skeleton } from 'antd';
import SummaryCards from '../components/SummaryCards';

const ConsumptionChart = React.lazy(() => import('../components/ConsumptionChart'));

const Dashboard = () => {
  return (
    <div>
      <h1>Дашборд</h1>
      <SummaryCards />
      <Suspense fallback={<div style={{ width: '100%', height: 400, paddingTop: 40 }}><Skeleton active /></div>}>
        <ConsumptionChart />
      </Suspense>
    </div>
  );
};

export default Dashboard;
