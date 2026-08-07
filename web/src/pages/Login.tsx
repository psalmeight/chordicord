import { Box, Button, Center, Heading, Input, Stack, Text } from '@chakra-ui/react';
import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import api, { apiError } from '@/lib/api';
import type { User } from '@/lib/auth';
import { useApp } from '@/contexts/AppContext';

export default function Login() {
  const { user, login } = useApp();
  const navigate = useNavigate();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to="/" replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const { data } = await api.post<{ token: string; user: User }>('/api/auth/login', {
        identifier,
        password,
      });
      login(data.token, data.user);
      navigate(data.user.verifiedAt ? '/' : '/set-password', { replace: true });
    } catch (err) {
      setError(apiError(err, 'Login failed'));
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
          FCF Chords
        </Heading>
        <Text color="gray.600" fontSize="sm" mb={6}>
          Sign in to your team's songbook.
        </Text>

        <form onSubmit={submit}>
          <Stack gap={3}>
            {/* Not type="email": the browser would reject a bare username as
                malformed before the request ever left. */}
            <Input
              type="text"
              placeholder="Email or username"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              autoComplete="username"
              required
            />
            <Input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
            {error && (
              <Text color="red.600" fontSize="sm">
                {error}
              </Text>
            )}
            <Button type="submit" colorPalette="brand" loading={busy}>
              Sign in
            </Button>
          </Stack>
        </form>
      </Box>
    </Center>
  );
}
