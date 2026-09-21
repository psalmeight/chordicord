import {
  Box, Button, Flex, HStack, Heading, Input, Spinner, Stack, Text,
} from '@chakra-ui/react';
import { Archive, Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import dayjs from 'dayjs';
import api, { apiError } from '@/lib/api';
import { canEdit } from '@/lib/auth';
import { useApp } from '@/contexts/AppContext';
import type { Setlist } from '@/types';

export default function Setlists() {
  const { user } = useApp();
  const [setlists, setSetlists] = useState<Setlist[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [date, setDate] = useState('');

  const load = () =>
    api
      .get<Setlist[]>('/api/setlists')
      .then(({ data }) => setSetlists(data))
      .catch((err) => setError(apiError(err, 'Could not load setlists')))
      .finally(() => setLoading(false));

  useEffect(() => {
    load();
  }, []);

  // Soft delete, same as the setlist page's own Archive: restore or delete
  // for good from the Archive page.
  const archive = async (setlist: Setlist) => {
    if (!window.confirm(`Archive "${setlist.name}"? It leaves the list but can be restored from the Archive page.`)) return;
    try {
      await api.post(`/api/setlists/${setlist.id}/archive`);
      setSetlists((prev) => prev.filter((s) => s.id !== setlist.id));
    } catch (err) {
      setError(apiError(err, 'Could not archive setlist'));
    }
  };

  const create = async () => {
    if (!name.trim()) return;
    try {
      await api.post('/api/setlists', { name, serviceDate: date || null });
      setName('');
      setDate('');
      setCreating(false);
      load();
    } catch (err) {
      setError(apiError(err, 'Could not create setlist'));
    }
  };

  return (
    <Stack gap={5}>
      <Flex align="center" justify="space-between" wrap="wrap" gap={3}>
        <Heading size="lg">Setlists</Heading>
        {canEdit(user) && (
          <Button size="sm" colorPalette="brand" onClick={() => setCreating((v) => !v)}>
            <Plus size={16} />
            <Text ml={1}>New setlist</Text>
          </Button>
        )}
      </Flex>

      {creating && (
        <Box bg="white" p={4} borderRadius="lg" borderWidth="1px">
          <HStack gap={2} wrap="wrap">
            <Input
              placeholder="Sunday morning"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxW="sm"
            />
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} maxW="200px" />
            <Button colorPalette="brand" onClick={create}>
              Create
            </Button>
          </HStack>
        </Box>
      )}

      {error && <Text color="red.600">{error}</Text>}

      {loading ? (
        <Spinner />
      ) : setlists.length === 0 ? (
        <Box bg="white" p={8} borderRadius="lg" borderWidth="1px" textAlign="center">
          <Text color="gray.600">No setlists yet.</Text>
        </Box>
      ) : (
        <Stack gap={2}>
          {setlists.map((setlist) => (
            <Flex
              key={setlist.id}
              bg="white"
              borderRadius="lg"
              borderWidth="1px"
              _hover={{ borderColor: 'brand.400' }}
              align="center"
              gap={3}
            >
              {/* The link fills the row; Archive sits beside it rather than
                  inside it, so pressing Archive never also opens the setlist. */}
              <Link to={`/setlists/${setlist.id}`} style={{ flex: 1, minWidth: 0 }}>
                <Flex justify="space-between" align="center" gap={3} p={4}>
                  <Text fontWeight="semibold">{setlist.name}</Text>
                  {/* A setlist without a service date is dated by its last
                      edit — a list with blank rows is harder to scan than one
                      with a slightly weaker date. */}
                  <Text fontSize="sm" color={setlist.serviceDate ? 'gray.600' : 'gray.400'} flexShrink={0}>
                    {setlist.serviceDate
                      ? dayjs(setlist.serviceDate).format('D MMM YYYY')
                      : `Updated ${dayjs(setlist.updatedAt).format('D MMM YYYY')}`}
                  </Text>
                </Flex>
              </Link>
              {canEdit(user) && (
                <Button
                  size="xs"
                  variant="ghost"
                  color="gray.500"
                  mr={3}
                  onClick={() => archive(setlist)}
                  title="Archive this setlist"
                  aria-label="Archive this setlist"
                >
                  <Archive size={14} />
                </Button>
              )}
            </Flex>
          ))}
        </Stack>
      )}
    </Stack>
  );
}
