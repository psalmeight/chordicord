import { Navigate, Route, Routes } from 'react-router-dom';
import { Center, Spinner } from '@chakra-ui/react';
import type { ReactNode } from 'react';
import { useApp } from './contexts/AppContext';
import type { Role } from './lib/auth';
import Layout from './components/Layout';
import Login from './pages/Login';
import Pending from './pages/Pending';
import Songs from './pages/Songs';
import SongView from './pages/SongView';
import SongEditor from './pages/SongEditor';
import Setlists from './pages/Setlists';
import SetlistView from './pages/SetlistView';
import SetlistItemEditor from './pages/SetlistItemEditor';
import Users from './pages/Users';
import Archive from './pages/Archive';

function Protected({ children, roles }: { children: ReactNode; roles?: Role[] }) {
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
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;

  return <Layout>{children}</Layout>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route path="/" element={<Protected><Songs /></Protected>} />
      <Route path="/songs/new" element={<Protected roles={['admin', 'leader']}><SongEditor /></Protected>} />
      <Route path="/songs/:id" element={<Protected><SongView /></Protected>} />
      <Route path="/songs/:id/edit" element={<Protected roles={['admin', 'leader']}><SongEditor /></Protected>} />

      <Route path="/setlists" element={<Protected><Setlists /></Protected>} />
      <Route path="/setlists/:id" element={<Protected><SetlistView /></Protected>} />
      <Route path="/setlists/:id/items/:itemId/edit" element={<Protected roles={['admin', 'leader']}><SetlistItemEditor /></Protected>} />

      {/* Restore and permanent delete live here, so it's editors-only like they are. */}
      <Route path="/archive" element={<Protected roles={['admin', 'leader']}><Archive /></Protected>} />

      <Route path="/users" element={<Protected roles={['admin']}><Users /></Protected>} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
