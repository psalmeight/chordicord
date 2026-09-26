import { Box, Button, Center, Heading, Stack, Text } from '@chakra-ui/react';
import { useState } from 'react';
import { useApp } from '@/contexts/AppContext';

/**
 * What a signed-in account sees until an admin approves it: first a nudge to
 * verify their email (approval can't happen before that), then a plain
 * "waiting" note. Check again asks the API afresh, so neither step needs a
 * sign-out and back in.
 */
export default function Pending() {
  const { user, refresh, logout, authError } = useApp();
  const [checking, setChecking] = useState(false);
  if (!user) return null;

  const verified = Boolean(user.verifiedAt);
  const check = async () => {
    setChecking(true);
    try {
      await refresh();
    } finally {
      setChecking(false);
    }
  };

  return (
    <Center minH="100vh" bg="gray.950" px={4}>
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
        <Text fontSize="xs" fontWeight="bold" textTransform="uppercase" letterSpacing="wider" color="gray.500" mb={1}>
          FCF Prayer
        </Text>
        <Heading size="lg" mb={2}>
          {verified ? 'Waiting for approval' : 'Verify your email'}
        </Heading>
        <Text color="gray.600" fontSize="sm" mb={6}>
          {verified
            ? `Thanks, ${user.name}. An admin needs to approve your account before you can use the prayer list. Check back once they have.`
            : `We sent a verification link to ${user.email}. Click it, then come back here and press Check again. An admin will approve your account after that.`}
        </Text>

        <Stack gap={3}>
          {authError && (
            <Text color="red.600" fontSize="sm">
              {authError}
            </Text>
          )}
          <Button colorPalette="brand" loading={checking} onClick={check}>
            Check again
          </Button>
          <Button variant="ghost" onClick={logout}>
            Sign out
          </Button>
        </Stack>
      </Box>
    </Center>
  );
}
