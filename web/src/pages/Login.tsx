import { Box, Button, Center, Heading, Stack, Text } from '@chakra-ui/react';
import { Navigate } from 'react-router-dom';
import { useApp } from '@/contexts/AppContext';

export default function Login() {
  const { user, loading, login, logout, authError } = useApp();

  if (user) return <Navigate to="/" replace />;

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
          Sign in to your team's songbook. New here? Signing in creates your account.
        </Text>

        <Stack gap={3}>
          {authError && (
            <Text color="red.600" fontSize="sm">
              {authError}
            </Text>
          )}
          {/* A valid Auth0 session the API refused (unverified email, and so
              on) needs a sign-out to try again, not another sign-in. */}
          {authError ? (
            <Button variant="outline" onClick={logout}>
              Sign out and try again
            </Button>
          ) : (
            <Button colorPalette="brand" loading={loading} onClick={() => login('/')}>
              Sign in
            </Button>
          )}
        </Stack>
      </Box>
    </Center>
  );
}
