import { Badge, Box, Button, Flex, HStack, Heading, Input, Spinner, Stack, Text } from '@chakra-ui/react';
import { Music2, Plus, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api, { apiError } from '@/lib/api';
import { canEdit } from '@/lib/auth';
import { useApp } from '@/contexts/AppContext';
import AudioLibraryDialog from '@/components/AudioLibraryDialog';
import type { Song } from '@/types';

export default function Songs() {
  const { user } = useApp();
  const [songs, setSongs] = useState<Song[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [activeTag, setActiveTag] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showAudio, setShowAudio] = useState(false);

  // Debounced so typing doesn't fire a request per keystroke.
  useEffect(() => {
    const timer = setTimeout(() => {
      setLoading(true);
      api
        .get<Song[]>('/api/songs', { params: { q: query, tag: activeTag } })
        .then(({ data }) => setSongs(data))
        .catch((err) => setError(apiError(err, 'Could not load songs')))
        .finally(() => setLoading(false));
    }, 200);
    return () => clearTimeout(timer);
  }, [query, activeTag]);

  useEffect(() => {
    api.get<string[]>('/api/songs/tags').then(({ data }) => setTags(data)).catch(() => {});
  }, []);

  return (
    <Stack gap={5}>
      <Flex align="center" justify="space-between" wrap="wrap" gap={3}>
        <Heading size="lg">Songs</Heading>
        {canEdit(user) && (
          <HStack gap={2}>
            <Button size="sm" variant="ghost" onClick={() => setShowAudio((v) => !v)}>
              <Music2 size={16} />
              <Text ml={1}>Tracks</Text>
            </Button>
            <Link to="/songs/new">
              <Button colorPalette="blue" size="sm">
                <Plus size={16} />
                <Text ml={1}>New song</Text>
              </Button>
            </Link>
          </HStack>
        )}
      </Flex>

      {showAudio && canEdit(user) && <AudioLibraryDialog />}

      <HStack gap={2}>
        <Box position="relative" flex="1" maxW="md">
          <Box position="absolute" left={3} top="50%" transform="translateY(-50%)" color="gray.400">
            <Search size={16} />
          </Box>
          <Input
            pl={9}
            bg="white"
            placeholder="Search by title or artist"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </Box>
      </HStack>

      {tags.length > 0 && (
        <HStack gap={2} wrap="wrap">
          <Badge
            cursor="pointer"
            variant={activeTag === '' ? 'solid' : 'outline'}
            onClick={() => setActiveTag('')}
          >
            All
          </Badge>
          {tags.map((tag) => (
            <Badge
              key={tag}
              cursor="pointer"
              variant={activeTag === tag ? 'solid' : 'outline'}
              onClick={() => setActiveTag(activeTag === tag ? '' : tag)}
            >
              {tag}
            </Badge>
          ))}
        </HStack>
      )}

      {error && <Text color="red.600">{error}</Text>}

      {loading ? (
        <Spinner />
      ) : songs.length === 0 ? (
        <Box bg="white" p={8} borderRadius="lg" borderWidth="1px" textAlign="center">
          <Text color="gray.600">
            {query || activeTag ? 'No songs match that search.' : 'No songs yet.'}
          </Text>
        </Box>
      ) : (
        <Stack gap={2}>
          {songs.map((song) => (
            <Link key={song.id} to={`/songs/${song.id}`}>
              <Box
                bg="white"
                p={4}
                borderRadius="lg"
                borderWidth="1px"
                _hover={{ borderColor: 'blue.400' }}
              >
                <Flex justify="space-between" align="center" gap={4} wrap="wrap">
                  <Box>
                    <Text fontWeight="semibold">{song.title}</Text>
                    {song.artist && (
                      <Text fontSize="sm" color="gray.600">
                        {song.artist}
                      </Text>
                    )}
                  </Box>
                  <HStack gap={2} fontSize="sm" color="gray.600">
                    {song.hasAudio && (
                      <Box color="blue.500" title="Has a reference track">
                        <Music2 size={14} />
                      </Box>
                    )}
                    {song.key ? (
                      <Badge colorPalette="blue">{song.key}</Badge>
                    ) : (
                      <Badge colorPalette="gray" variant="outline">No key</Badge>
                    )}
                    <Text>{song.timeSignature}</Text>
                    {song.tempo && <Text>{song.tempo} bpm</Text>}
                    {song.feel && <Text>{song.feel}</Text>}
                  </HStack>
                </Flex>
              </Box>
            </Link>
          ))}
        </Stack>
      )}
    </Stack>
  );
}
