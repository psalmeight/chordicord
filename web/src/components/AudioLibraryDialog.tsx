import { Badge, Box, Button, Flex, Spinner, Stack, Text } from '@chakra-ui/react';
import { Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api, { apiError } from '@/lib/api';
import type { AudioLibrary } from '@/types';

/**
 * The "what should I delete" view. Shown when an upload is refused for hitting
 * the library cap, and from the songs index as a usage readout.
 *
 * Nothing is ever evicted automatically — on a shared songbook that would mean
 * one person's upload silently destroying someone else's. Oldest-first ordering
 * is a suggestion, not a policy.
 */
export default function AudioLibraryDialog({ onChanged }: { onChanged?: () => void }) {
  const [library, setLibrary] = useState<AudioLibrary | null>(null);
  const [error, setError] = useState('');
  const [removingId, setRemovingId] = useState('');

  const load = useCallback(() => {
    api
      .get<AudioLibrary>('/api/audio')
      .then(({ data }) => setLibrary(data))
      .catch((err) => setError(apiError(err, 'Could not load the audio library')));
  }, []);

  useEffect(load, [load]);

  const remove = async (songId: string, title: string) => {
    if (!window.confirm(`Remove the track attached to "${title}"?`)) return;
    setRemovingId(songId);
    try {
      await api.delete(`/api/songs/${songId}/audio`);
      load();
      onChanged?.();
    } catch (err) {
      setError(apiError(err, 'Could not remove the track'));
    } finally {
      setRemovingId('');
    }
  };

  if (error) return <Text color="red.600" fontSize="sm">{error}</Text>;
  if (!library) return <Spinner size="sm" />;

  const full = library.used >= library.limit;

  return (
    <Box borderWidth="1px" borderRadius="lg" p={4} bg="white">
      <Flex justify="space-between" align="center" mb={3} gap={3} wrap="wrap">
        <Text fontWeight="medium">Uploaded tracks</Text>
        <Badge colorPalette={full ? 'red' : 'gray'}>
          {library.used} of {library.limit} used
        </Badge>
      </Flex>

      {full && (
        <Text fontSize="sm" color="gray.700" mb={3}>
          The library is full. Remove a track below to free a slot — oldest first.
        </Text>
      )}

      {library.items.length === 0 ? (
        <Text fontSize="sm" color="gray.500">
          Nothing uploaded yet.
        </Text>
      ) : (
        <Stack gap={2}>
          {library.items.map((item) => (
            <Flex
              key={item.id}
              align="center"
              justify="space-between"
              gap={3}
              py={2}
              borderBottomWidth="1px"
              borderColor="gray.100"
            >
              <Box minW={0}>
                <Link to={`/songs/${item.songId}`}>
                  <Text fontSize="sm" fontWeight="medium" truncate>
                    {item.title}
                  </Text>
                </Link>
                <Text fontSize="xs" color="gray.500">
                  {[item.artist, formatSize(item.sizeBytes), item.uploadedByName]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
              </Box>
              <Button
                size="xs"
                variant="ghost"
                colorPalette="red"
                loading={removingId === item.songId}
                onClick={() => remove(item.songId, item.title)}
                aria-label={`Remove track for ${item.title}`}
              >
                <Trash2 size={14} />
              </Button>
            </Flex>
          ))}
        </Stack>
      )}
    </Box>
  );
}

function formatSize(bytes: number): string {
  if (!bytes) return '';
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
