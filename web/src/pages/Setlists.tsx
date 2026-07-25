import {
  Box, Button, Flex, HStack, Heading, Input, Spinner, Stack, Text,
} from '@chakra-ui/react';
import { Plus } from 'lucide-react';
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
          <Button size="sm" colorPalette="blue" onClick={() => setCreating((v) => !v)}>
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
            <Button colorPalette="blue" onClick={create}>
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
            <Link key={setlist.id} to={`/setlists/${setlist.id}`}>
              <Box bg="white" p={4} borderRadius="lg" borderWidth="1px" _hover={{ borderColor: 'blue.400' }}>
                <Flex justify="space-between" align="center">
                  <Text fontWeight="semibold">{setlist.name}</Text>
                  {setlist.serviceDate && (
                    <Text fontSize="sm" color="gray.600">
                      {dayjs(setlist.serviceDate).format('D MMM YYYY')}
                    </Text>
                  )}
                </Flex>
              </Box>
            </Link>
          ))}
        </Stack>
      )}
    </Stack>
  );
}
