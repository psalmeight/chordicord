import { Box, Button, Center, Heading, Input, Stack, Text } from '@chakra-ui/react';
import { useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api, { apiError } from '@/lib/api';
import type { User } from '@/lib/auth';
import { useApp } from '@/contexts/AppContext';

/** Where an invited teammate lands to choose their password. */
export default function Invite() {
  const { token = '' } = useParams();
  const { login } = useApp();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      setError('Passwords do not match');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const { data } = await api.post<{ token: string; user: User }>('/api/auth/accept-invite', {
        token,
        password,
      });
      login(data.token, data.user);
      navigate('/', { replace: true });
    } catch (err) {
      setError(apiError(err, 'Could not accept invite'));
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
          Welcome to FCF Chords
        </Heading>
        <Text color="gray.600" fontSize="sm" mb={6}>
          Choose a password to finish setting up your account.
        </Text>

        <form onSubmit={submit}>
          <Stack gap={3}>
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
              placeholder="Confirm password"
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
              Create account
            </Button>
          </Stack>
        </form>
      </Box>
    </Center>
  );
}
