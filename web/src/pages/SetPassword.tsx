import { Box, Button, Center, Heading, Input, Stack, Text } from '@chakra-ui/react';
import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import api, { apiError } from '@/lib/api';
import { useApp } from '@/contexts/AppContext';

/**
 * Doubles as the forced first-password screen and the ordinary change-password
 * screen — the API only asks for the current password once you have one.
 */
export default function SetPassword() {
  const { user, setUser } = useApp();
  const navigate = useNavigate();
  const [current, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (!user) return <Navigate to="/login" replace />;
  const isFirstTime = !user.verifiedAt;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      setError('Passwords do not match');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await api.post('/api/auth/change-password', {
        currentPassword: isFirstTime ? '' : current,
        newPassword: password,
      });
      setUser({ ...user, verifiedAt: new Date().toISOString() });
      navigate('/', { replace: true });
    } catch (err) {
      setError(apiError(err, 'Could not update password'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Center minH="100vh" bg="gray.950">
      <Box
        bg="white"
        p={8}
        borderRadius="lg"
        borderWidth="1px"
        borderTopWidth="4px"
        borderTopColor="brand.600"
        w="full"
        maxW="sm"
      >
        <Heading size="lg" mb={1}>
          {isFirstTime ? 'Set your password' : 'Change password'}
        </Heading>
        <Text color="gray.600" fontSize="sm" mb={6}>
          {isFirstTime
            ? 'Pick a password before you get started.'
            : 'Choose a new password for your account.'}
        </Text>

        <form onSubmit={submit}>
          <Stack gap={3}>
            {!isFirstTime && (
              <Input
                type="password"
                placeholder="Current password"
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
                autoComplete="current-password"
                required
              />
            )}
            <Input
              type="password"
              placeholder="New password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              minLength={8}
              required
            />
            <Input
              type="password"
              placeholder="Confirm new password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
              required
            />
            {error && (
              <Text color="red.600" fontSize="sm">
                {error}
              </Text>
            )}
            <Button type="submit" colorPalette="brand" loading={busy}>
              Save password
            </Button>
          </Stack>
        </form>
      </Box>
    </Center>
  );
}
