
import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom';

import WifiManager from './route/wifiManager/main';

const router = createBrowserRouter([
  {
    path: '/',
    element: <Navigate to="/wifi" replace />,
  },
  {
    path: '/wifi',
    element: <WifiManager />,
  },
  {
    path: '*',
    element: <Navigate to="/wifi" replace />,
  },
]);

export default function App() {
  return <RouterProvider router={router} />;
}
