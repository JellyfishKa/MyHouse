import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import MainLayout from './components/MainLayout';
import Dashboard from './pages/Dashboard';
import Anomalies from './pages/Anomalies';

const router = createBrowserRouter([
  {
    path: '/',
    element: <MainLayout />,
    children: [
      {
        index: true,
        element: <Dashboard />,
      },
      {
        path: 'anomalies',
        element: <Anomalies />,
      },
    ],
  },
]);

function App() {
  return <RouterProvider router={router} />;
}

export default App;