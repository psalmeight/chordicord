import {
  Badge, Box, Button, Flex, HStack, Heading, Input, Spinner, Stack, Text,
} from '@chakra-ui/react';
import { Pencil, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import api, { apiError } from '@/lib/api';
import type { Role, User } from '@/lib/auth';
import { useApp } from '@/contexts/AppContext';
import { Select } from '@/components/FormControls';

const ROLES: Role[] = ['admin', 'leader', 'member'];

export default function Users() {
  const { user: me } = useApp();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  // At most one row's username is in edit mode rather than a draft per user.
  const [editingUsername, setEditingUsername] = useState<{ id: string; value: string } | null>(null);

  const load = () =>
    api
      .get<User[]>('/api/users')
      .then(({ data }) => setUsers(data))
      .catch((err) => setError(apiError(err, 'Could not load team')))
      .finally(() => setLoading(false));

  useEffect(() => {
    load();
  }, []);

  const changeRole = async (id: string, role: Role) => {
    try {
      await api.patch(`/api/users/${id}`, { role });
      load();
    } catch (err) {
      setError(apiError(err, 'Could not update role'));
    }
  };

  const saveUsername = async (id: string, raw: string) => {
    const username = raw.trim();
    setError('');
    try {
      // An omitted field leaves the column untouched, so emptying the box has
      // to say clearUsername explicitly to take the handle back off.
      await api.patch(`/api/users/${id}`, username ? { username } : { clearUsername: true });
      setEditingUsername(null);
      load();
    } catch (err) {
      setError(apiError(err, 'Could not update username'));
    }
  };

  const remove = async (u: User) => {
    if (!confirm(`Remove ${u.name} from the team?`)) return;
    try {
      await api.delete(`/api/users/${u.id}`);
      load();
    } catch (err) {
      setError(apiError(err, 'Could not remove user'));
    }
  };

  return (
    <Stack gap={5}>
      <Box>
        <Heading size="lg">Team</Heading>
        {/* No invite step: signing in through Auth0 is what adds someone. */}
        <Text fontSize="sm" color="gray.600" mt={1}>
          Anyone who signs in is added as a member. Change their role here.
        </Text>
      </Box>

      {error && <Text color="red.600">{error}</Text>}

      {loading ? (
        <Spinner />
      ) : (
        <Stack gap={2}>
          {users.map((u) => (
            <Box key={u.id} bg="white" p={4} borderRadius="lg" borderWidth="1px">
              <Flex justify="space-between" align="center" gap={3} wrap="wrap">
                <Box>
                  <HStack gap={2}>
                    <Text fontWeight="semibold">{u.name}</Text>
                    {!u.linked && <Badge colorPalette="orange">Not signed in yet</Badge>}
                    {u.id === me?.id && <Badge variant="outline">You</Badge>}
                  </HStack>
                  <Text fontSize="sm" color="gray.600">
                    {u.email}
                  </Text>
                  {editingUsername?.id === u.id ? (
                    <HStack gap={2} mt={1}>
                      <Input
                        size="xs"
                        placeholder="Username"
                        value={editingUsername.value}
                        onChange={(e) => setEditingUsername({ id: u.id, value: e.target.value })}
                        maxW="180px"
                      />
                      <Button
                        size="xs"
                        colorPalette="brand"
                        onClick={() => saveUsername(u.id, editingUsername.value)}
                      >
                        Save
                      </Button>
                      <Button size="xs" variant="ghost" onClick={() => setEditingUsername(null)}>
                        Cancel
                      </Button>
                    </HStack>
                  ) : (
                    <HStack gap={1} mt={1}>
                      <Text fontSize="sm" color={u.username ? 'gray.600' : 'gray.400'}>
                        {u.username ?? 'No username'}
                      </Text>
                      <Button
                        size="xs"
                        variant="ghost"
                        onClick={() => setEditingUsername({ id: u.id, value: u.username ?? '' })}
                      >
                        <Pencil size={12} />
                      </Button>
                    </HStack>
                  )}
                </Box>

                <HStack gap={2}>
                  <Select
                    value={u.role}
                    onChange={(v) => changeRole(u.id, v as Role)}
                    options={ROLES}
                    size="sm"
                    width="auto"
                    minW="110px"
                  />
                  {u.id !== me?.id && (
                    <Button size="xs" variant="ghost" colorPalette="red" onClick={() => remove(u)}>
                      <Trash2 size={14} />
                    </Button>
                  )}
                </HStack>
              </Flex>
            </Box>
          ))}
        </Stack>
      )}
    </Stack>
  );
}
