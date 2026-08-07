import {
  Badge, Box, Button, Flex, HStack, Heading, Input, Spinner, Stack, Text,
} from '@chakra-ui/react';
import { Copy, Pencil, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import api, { apiError } from '@/lib/api';
import type { Role, User } from '@/lib/auth';
import { useApp } from '@/contexts/AppContext';

const ROLES: Role[] = ['admin', 'leader', 'member'];

const ROLE_HELP: Record<Role, string> = {
  admin: 'Full access, plus managing the team',
  leader: 'Can create and edit songs and setlists',
  member: 'Can view and transpose everything',
};

export default function Users() {
  const { user: me } = useApp();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [inviteLink, setInviteLink] = useState('');
  const [form, setForm] = useState({ name: '', email: '', username: '', role: 'member' as Role });
  const [creating, setCreating] = useState(false);
  // At most one row's username is in edit mode, mirroring the single `creating`
  // toggle above rather than keeping a draft per user.
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

  const invite = async () => {
    if (!form.name.trim() || !form.email.trim()) return;
    setError('');
    try {
      const { data } = await api.post<{ inviteLink: string }>('/api/users', form);
      setInviteLink(data.inviteLink);
      setForm({ name: '', email: '', username: '', role: 'member' });
      setCreating(false);
      load();
    } catch (err) {
      setError(apiError(err, 'Could not create user'));
    }
  };

  const reinvite = async (id: string) => {
    try {
      const { data } = await api.post<{ inviteLink: string }>(`/api/users/${id}/reinvite`);
      setInviteLink(data.inviteLink);
    } catch (err) {
      setError(apiError(err, 'Could not create invite link'));
    }
  };

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
      <Flex align="center" justify="space-between" wrap="wrap" gap={3}>
        <Heading size="lg">Team</Heading>
        <Button size="sm" colorPalette="brand" onClick={() => setCreating((v) => !v)}>
          <Plus size={16} />
          <Text ml={1}>Invite member</Text>
        </Button>
      </Flex>

      {creating && (
        <Box bg="white" p={4} borderRadius="lg" borderWidth="1px">
          <HStack gap={2} wrap="wrap">
            <Input
              placeholder="Name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              maxW="200px"
            />
            <Input
              type="email"
              placeholder="Email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              maxW="240px"
            />
            <Input
              placeholder="Username (optional)"
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
              maxW="200px"
            />
            <select
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value as Role })}
              style={{ padding: '8px 10px', borderRadius: 6, border: '1px solid var(--line)' }}
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
            <Button colorPalette="brand" onClick={invite}>
              Create invite
            </Button>
          </HStack>
          <Text fontSize="xs" color="gray.600" mt={2}>
            {ROLE_HELP[form.role]}
          </Text>
        </Box>
      )}

      {/* No email is sent — the admin copies this link to the new member. */}
      {inviteLink && (
        <Box bg="brand.50" p={4} borderRadius="lg" borderWidth="1px" borderColor="brand.200">
          <Text fontSize="sm" fontWeight="medium" mb={2}>
            Send this invite link — it expires in 7 days.
          </Text>
          <HStack gap={2}>
            <Input value={inviteLink} readOnly bg="white" fontSize="sm" />
            <Button size="sm" onClick={() => navigator.clipboard.writeText(inviteLink)}>
              <Copy size={14} />
            </Button>
          </HStack>
        </Box>
      )}

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
                    {!u.verifiedAt && <Badge colorPalette="orange">Invite pending</Badge>}
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
                  {!u.verifiedAt && (
                    <Button size="xs" variant="outline" onClick={() => reinvite(u.id)}>
                      New link
                    </Button>
                  )}
                  <select
                    value={u.role}
                    onChange={(e) => changeRole(u.id, e.target.value as Role)}
                    style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid var(--line-2)' }}
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
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
