import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import MainLayout from './components/MainLayout';
import Dashboard from './pages/Dashboard';
import Equipment from './pages/Equipment';

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
        path: 'equipment',
        element: <Equipment />,
      },
    ],
  },
]);

function App() {
  return <RouterProvider router={router} />;
}

export default App;