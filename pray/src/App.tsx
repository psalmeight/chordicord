import { Navigate, Route, Routes } from 'react-router-dom';
import { Center, Spinner } from '@chakra-ui/react';
import type { ReactNode } from 'react';
import { useApp } from './contexts/AppContext';
import { canManage } from './lib/auth';
import Layout from './components/Layout';
import Login from './pages/Login';
import Pending from './pages/Pending';
import Prayers from './pages/Prayers';
import Categories from './pages/Categories';

function Protected({ children, adminOnly }: { children: ReactNode; adminOnly?: boolean }) {
  const { user, loading } = useApp();

  if (loading) {
    return (
      <Center h="100vh">
        <Spinner />
      </Center>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  if (!user.approvedAt) return <Pending />;
  if (adminOnly && !canManage(user)) return <Navigate to="/" replace />;

  return <Layout>{children}</Layout>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<Protected><Prayers /></Protected>} />
      <Route path="/categories" element={<Protected adminOnly><Categories /></Protected>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
