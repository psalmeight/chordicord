import { Box, Button, Flex, HStack, Heading, Spinner, Stack, Text } from '@chakra-ui/react';
import { ArchiveRestore, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import dayjs from 'dayjs';
import api, { apiError } from '@/lib/api';
import type { Setlist, Song } from '@/types';

type Tab = 'songs' | 'setlists';

/** Everything that's been archived, in one place. This is the only page that
 *  restores anything or deletes it for good — the editors themselves only ever
 *  archive, so nothing is lost without passing through here first. */
export default function Archive() {
  const [tab, setTab] = useState<Tab>('songs');
  const [songs, setSongs] = useState<Song[]>([]);
  const [setlists, setSetlists] = useState<Setlist[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  // The row an action is in flight on, so its buttons can't be double-pressed.
  const [busy, setBusy] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    return Promise.all([
      api.get<Song[]>('/api/songs', { params: { archived: 1 } }),
      api.get<Setlist[]>('/api/setlists', { params: { archived: 1 } }),
    ])
      .then(([s, l]) => {
        setSongs(s.data);
        setSetlists(l.data);
      })
      .catch((err) => setError(apiError(err, 'Could not load the archive')))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  // Restore and delete both just remove the row from this page; the row
  // disappears locally so the list doesn't blink through a full reload.
  const act = async (kind: Tab, id: string, verb: 'restore' | 'delete', fallback: string) => {
    setBusy(id);
    setError('');
    try {
      if (verb === 'restore') await api.post(`/api/${kind}/${id}/restore`);
      else await api.delete(`/api/${kind}/${id}`);
      if (kind === 'songs') setSongs((prev) => prev.filter((s) => s.id !== id));
      else setSetlists((prev) => prev.filter((s) => s.id !== id));
    } catch (err) {
      setError(apiError(err, fallback));
    } finally {
      setBusy(null);
    }
  };

  const restoreSong = (song: Song) => act('songs', song.id, 'restore', 'Could not restore song');
  const deleteSong = (song: Song) => {
    if (!window.confirm(`Delete "${song.title}" permanently? Its reference track goes with it. This cannot be undone.`)) return;
    return act('songs', song.id, 'delete', 'Could not delete song');
  };
  const restoreSetlist = (setlist: Setlist) =>
    act('setlists', setlist.id, 'restore', 'Could not restore setlist');
  const deleteSetlist = (setlist: Setlist) => {
    if (!window.confirm(`Delete "${setlist.name}" permanently? Every item and everyone's notes on it go too. This cannot be undone.`)) return;
    return act('setlists', setlist.id, 'delete', 'Could not delete setlist');
  };

  const tabButton = (value: Tab, label: string, count: number) => (
    <Button
      size="sm"
      variant={tab === value ? 'solid' : 'outline'}
      colorPalette={tab === value ? 'brand' : 'gray'}
      onClick={() => setTab(value)}
    >
      {label}
      <Text ml={1} opacity={0.7}>
        ({count})
      </Text>
    </Button>
  );

  const actions = (id: string, onRestore: () => unknown, onDelete: () => unknown) => (
    <HStack gap={2} flexShrink={0}>
      <Button size="xs" variant="outline" onClick={onRestore} loading={busy === id} disabled={busy !== null}>
        <ArchiveRestore size={14} />
        <Text ml={1}>Restore</Text>
      </Button>
      <Button
        size="xs"
        variant="outline"
        colorPalette="red"
        onClick={onDelete}
        loading={busy === id}
        disabled={busy !== null}
        title="Delete permanently"
      >
        <Trash2 size={14} />
        <Text ml={1}>Delete</Text>
      </Button>
    </HStack>
  );

  const archivedOn = (at: string | null) =>
    at ? `Archived ${dayjs(at).format('D MMM YYYY')}` : 'Archived';

  const empty = (label: string) => (
    <Box bg="white" p={8} borderRadius="lg" borderWidth="1px" textAlign="center">
      <Text color="gray.600">No archived {label}.</Text>
    </Box>
  );

  return (
    <Stack gap={5}>
      <Flex align="center" justify="space-between" wrap="wrap" gap={3}>
        <Box>
          <Heading size="lg">Archive</Heading>
          <Text fontSize="sm" color="gray.600">
            Archived songs and setlists are hidden from the lists but not gone. Restore them here, or
            delete them for good.
          </Text>
        </Box>
        <HStack gap={2}>
          {tabButton('songs', 'Songs', songs.length)}
          {tabButton('setlists', 'Setlists', setlists.length)}
        </HStack>
      </Flex>

      {error && <Text color="red.600">{error}</Text>}

      {loading ? (
        <Spinner />
      ) : tab === 'songs' ? (
        songs.length === 0 ? (
          empty('songs')
        ) : (
          <Stack gap={2}>
            {songs.map((song) => (
              <Box key={song.id} bg="white" p={4} borderRadius="lg" borderWidth="1px">
                <Flex justify="space-between" align="center" gap={4} wrap="wrap">
                  <Box minW={0}>
                    <Link to={`/songs/${song.id}`}>
                      <Text fontWeight="semibold" _hover={{ color: 'brand.600' }}>
                        {song.title}
                      </Text>
                    </Link>
                    <Text fontSize="sm" color="gray.600">
                      {[song.artist, archivedOn(song.archivedAt)].filter(Boolean).join(' · ')}
                    </Text>
                  </Box>
                  {actions(song.id, () => restoreSong(song), () => deleteSong(song))}
                </Flex>
              </Box>
            ))}
          </Stack>
        )
      ) : setlists.length === 0 ? (
        empty('setlists')
      ) : (
        <Stack gap={2}>
          {setlists.map((setlist) => (
            <Box key={setlist.id} bg="white" p={4} borderRadius="lg" borderWidth="1px">
              <Flex justify="space-between" align="center" gap={4} wrap="wrap">
                <Box minW={0}>
                  <Link to={`/setlists/${setlist.id}`}>
                    <Text fontWeight="semibold" _hover={{ color: 'brand.600' }}>
                      {setlist.name}
                    </Text>
                  </Link>
                  <Text fontSize="sm" color="gray.600">
                    {[
                      setlist.serviceDate ? dayjs(setlist.serviceDate).format('D MMM YYYY') : '',
                      archivedOn(setlist.archivedAt),
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                </Box>
                {actions(setlist.id, () => restoreSetlist(setlist), () => deleteSetlist(setlist))}
              </Flex>
            </Box>
          ))}
        </Stack>
      )}
    </Stack>
  );
}
