import {
  Badge, Box, Button, Flex, HStack, Heading, Input, Spinner, Stack, Text, Textarea,
} from '@chakra-ui/react';
import {
  ArrowLeft, ChevronDown, ChevronUp, FileDown, Music2, Pencil, Plus, Printer, Trash2, X,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import dayjs from 'dayjs';
import api, { apiError } from '@/lib/api';
import { canEdit } from '@/lib/auth';
import { keyOptions } from '@/lib/chords';
import { groupNotes } from '@/lib/noteColors';
import type { PdfSong } from '@/lib/pdf';
import { useApp } from '@/contexts/AppContext';
import AudioPlayer from '@/components/AudioPlayer';
import AutoScrollWidget from '@/components/AutoScrollWidget';
import ChordChart from '@/components/ChordChart';
import { NoteCardList } from '@/components/NoteCardView';
import type { Setlist, SetlistItem, Song } from '@/types';

/** A setlist row as the PDF renderer wants it — printed in the service key,
 *  not the key the chart was written in. */
const toPdfSong = (item: SetlistItem): PdfSong => ({
  title: item.title,
  artist: item.artist,
  fromKey: item.key ?? '',
  toKey: item.keyOverride ?? item.key ?? '',
  timeSignature: item.timeSignature,
  tempo: item.tempo,
  feel: item.feel,
  content: item.content,
  noteCards: item.noteCards,
});

export default function SetlistView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useApp();
  const [setlist, setSetlist] = useState<Setlist | null>(null);
  const [items, setItems] = useState<SetlistItem[]>([]);
  const [songs, setSongs] = useState<Song[]>([]);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');
  // Which items have their play-along player mounted. Kept lazy: each track is
  // fully decoded into memory, so we never mount all of them at once.
  const [openPlayers, setOpenPlayers] = useState<Record<string, boolean>>({});
  // Setlist detail editing (rename / date / notes / delete).
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({ name: '', serviceDate: '', notes: '' });
  const [savingSetlist, setSavingSetlist] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);

  const load = () =>
    api
      .get<{ setlist: Setlist; items: SetlistItem[] }>(`/api/setlists/${id}`)
      .then(({ data }) => {
        setSetlist(data.setlist);
        setItems(data.items);
      })
      .catch((err) => setError(apiError(err, 'Could not load setlist')));

  useEffect(() => {
    load();
  }, [id]);

  useEffect(() => {
    if (adding && songs.length === 0) {
      api.get<Song[]>('/api/songs').then(({ data }) => setSongs(data)).catch(() => {});
    }
  }, [adding, songs.length]);

  const editable = canEdit(user);

  const addSong = async (songId: string) => {
    await api.post(`/api/setlists/${id}/items`, { songId });
    setAdding(false);
    load();
  };

  const setKey = async (item: SetlistItem, key: string) => {
    // Selecting the song's own key clears the override rather than storing a
    // redundant one, so later edits to the song's key still flow through.
    const clearKey = key === item.key;
    await api.patch(`/api/setlists/${id}/items/${item.id}`, {
      keyOverride: clearKey ? null : key,
      clearKey,
    });
    load();
  };

  const move = async (index: number, delta: number) => {
    const next = [...items];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setItems(next); // optimistic
    await api.post(`/api/setlists/${id}/reorder`, { itemIds: next.map((i) => i.id) });
  };

  const remove = async (itemId: string) => {
    await api.delete(`/api/setlists/${id}/items/${itemId}`);
    load();
  };

  const togglePlayer = (itemId: string) =>
    setOpenPlayers((prev) => ({ ...prev, [itemId]: !prev[itemId] }));

  // The PDF renderer carries a typesetting library with it, so it is pulled in
  // on the first download rather than on every page load.
  const downloadPdf = async () => {
    setPdfBusy(true);
    try {
      const { downloadSetlistPdf } = await import('@/lib/pdf');
      downloadSetlistPdf(
        {
          title: setlist!.name,
          subtitle: setlist!.serviceDate
            ? dayjs(setlist!.serviceDate).format('dddd, D MMMM YYYY')
            : undefined,
          notes: setlist!.notes,
        },
        items.map(toPdfSong),
      );
    } catch (err) {
      setError(apiError(err, 'Could not build the PDF'));
    } finally {
      setPdfBusy(false);
    }
  };

  const downloadItemPdf = async (item: SetlistItem) => {
    const { downloadSongPdf } = await import('@/lib/pdf');
    downloadSongPdf(toPdfSong(item));
  };

  // Saving the recording's own tune clears the per-setlist override, mirroring
  // how choosing the song's own key clears key_override. Updated locally so the
  // open player doesn't remount and re-decode the track.
  const saveTune = (item: SetlistItem) => async (semitones: number) => {
    const clearTune = semitones === item.audioTuneOffset;
    await api.patch(`/api/setlists/${id}/items/${item.id}`, {
      tuneOffset: clearTune ? null : semitones,
      clearTune,
    });
    setItems((prev) =>
      prev.map((it) => (it.id === item.id ? { ...it, tuneOffset: clearTune ? null : semitones } : it)),
    );
  };

  const startEdit = () => {
    setEditForm({
      name: setlist!.name,
      serviceDate: setlist!.serviceDate ? dayjs(setlist!.serviceDate).format('YYYY-MM-DD') : '',
      notes: setlist!.notes,
    });
    setEditing(true);
  };

  const saveSetlist = async () => {
    if (!editForm.name.trim()) return;
    setSavingSetlist(true);
    try {
      await api.patch(`/api/setlists/${id}`, {
        name: editForm.name.trim(),
        serviceDate: editForm.serviceDate || null,
        notes: editForm.notes,
      });
      setEditing(false);
      load();
    } catch (err) {
      setError(apiError(err, 'Could not save setlist'));
    } finally {
      setSavingSetlist(false);
    }
  };

  const deleteSetlist = async () => {
    if (!window.confirm(`Delete "${setlist!.name}"? This removes the setlist, not the songs.`)) return;
    try {
      await api.delete(`/api/setlists/${id}`);
      navigate('/setlists', { replace: true });
    } catch (err) {
      setError(apiError(err, 'Could not delete setlist'));
    }
  };

  if (error) return <Text color="red.600">{error}</Text>;
  if (!setlist) return <Spinner />;

  return (
    <Stack gap={4}>
      <Flex justify="space-between" align="center" wrap="wrap" gap={3} className="no-print">
        <Link to="/setlists">
          <Button size="sm" variant="ghost">
            <ArrowLeft size={16} />
            <Text ml={1}>Setlists</Text>
          </Button>
        </Link>
        <HStack gap={2}>
          <Button size="sm" variant="outline" onClick={() => window.print()}>
            <Printer size={16} />
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={items.length === 0}
            loading={pdfBusy}
            onClick={downloadPdf}
            title="Download the whole setlist as one PDF, a song per page"
          >
            <FileDown size={16} />
            <Text ml={1}>PDF</Text>
          </Button>
          {editable && (
            <>
              <Button size="sm" variant="outline" onClick={() => (editing ? setEditing(false) : startEdit())}>
                <Pencil size={16} />
                <Text ml={1}>Edit</Text>
              </Button>
              <Button size="sm" colorPalette="brand" onClick={() => setAdding((v) => !v)}>
                <Plus size={16} />
                <Text ml={1}>Add song</Text>
              </Button>
            </>
          )}
        </HStack>
      </Flex>

      <Box>
        <Heading size="xl">{setlist.name}</Heading>
        {setlist.serviceDate && (
          <Text color="gray.600">{dayjs(setlist.serviceDate).format('dddd, D MMMM YYYY')}</Text>
        )}
        {setlist.notes && (
          <Text color="gray.600" fontSize="sm" mt={1} whiteSpace="pre-wrap">
            {setlist.notes}
          </Text>
        )}
      </Box>

      {editing && editable && (
        <Box bg="white" p={4} borderRadius="lg" borderWidth="1px" className="no-print">
          <Stack gap={3}>
            <Flex gap={2} wrap="wrap">
              <Input
                placeholder="Setlist name"
                value={editForm.name}
                onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                maxW="sm"
              />
              <Input
                type="date"
                value={editForm.serviceDate}
                onChange={(e) => setEditForm((f) => ({ ...f, serviceDate: e.target.value }))}
                maxW="200px"
              />
            </Flex>
            <Textarea
              placeholder="Notes for the team…"
              value={editForm.notes}
              onChange={(e) => setEditForm((f) => ({ ...f, notes: e.target.value }))}
              rows={2}
            />
            <Flex justify="space-between" wrap="wrap" gap={2}>
              <Button size="sm" variant="outline" colorPalette="red" onClick={deleteSetlist}>
                <Trash2 size={16} />
                <Text ml={1}>Delete setlist</Text>
              </Button>
              <HStack gap={2}>
                <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                  Cancel
                </Button>
                <Button size="sm" colorPalette="brand" onClick={saveSetlist} loading={savingSetlist}>
                  Save
                </Button>
              </HStack>
            </Flex>
          </Stack>
        </Box>
      )}

      {adding && (
        <Box bg="white" p={4} borderRadius="lg" borderWidth="1px" maxH="300px" overflowY="auto" className="no-print">
          <Stack gap={1}>
            {songs.map((song) => (
              <Flex
                key={song.id}
                justify="space-between"
                align="center"
                p={2}
                borderRadius="md"
                cursor="pointer"
                _hover={{ bg: 'gray.50' }}
                onClick={() => addSong(song.id)}
              >
                <Text>{song.title}</Text>
                <Badge variant={song.key ? 'solid' : 'outline'}>{song.key ?? 'No key'}</Badge>
              </Flex>
            ))}
          </Stack>
        </Box>
      )}

      {items.length === 0 ? (
        <Box bg="white" p={8} borderRadius="lg" borderWidth="1px" textAlign="center">
          <Text color="gray.600">No songs in this setlist yet.</Text>
        </Box>
      ) : (
        <Stack gap={4}>
          {items.map((item, index) => {
            // No song key means no anchor to transpose from, so the per-service
            // key picker is unavailable and the chart renders as written.
            const displayKey = item.keyOverride ?? item.key ?? '';
            const notes = groupNotes(item.noteCards);
            return (
              <Box key={item.id} bg="white" p={5} borderRadius="lg" borderWidth="1px">
                <Flex justify="space-between" align="start" gap={3} wrap="wrap">
                  <Box>
                    <HStack gap={2}>
                      <Text color="gray.400" fontWeight="bold">
                        {index + 1}
                      </Text>
                      <Link to={`/songs/${item.songId}`}>
                        <Text fontWeight="semibold" fontSize="lg">
                          {item.title}
                        </Text>
                      </Link>
                    </HStack>
                    <HStack gap={3} fontSize="sm" color="gray.600" mt={1} ml={6}>
                      <Text>{item.timeSignature}</Text>
                      {item.tempo && <Text>{item.tempo} bpm</Text>}
                      {item.feel && <Text>{item.feel}</Text>}
                      {item.keyOverride && item.keyOverride !== item.key && (
                        <Badge colorPalette="orange">from {item.key}</Badge>
                      )}
                    </HStack>
                  </Box>

                  <HStack gap={2} className="no-print">
                    <Button
                      size="xs"
                      variant="outline"
                      onClick={() => downloadItemPdf(item)}
                      title={`Download "${item.title}" as a PDF, in this setlist's key`}
                    >
                      <FileDown size={14} />
                    </Button>
                    {item.hasAudio && (
                      <Button
                        size="xs"
                        variant={openPlayers[item.id] ? 'subtle' : 'outline'}
                        colorPalette="brand"
                        onClick={() => togglePlayer(item.id)}
                      >
                        <Music2 size={14} />
                        <Text ml={1}>Play-along</Text>
                      </Button>
                    )}
                    {item.key ? (
                      <select
                        value={displayKey}
                        onChange={(e) => setKey(item, e.target.value)}
                        disabled={!editable}
                        style={{
                          padding: '6px 10px',
                          borderRadius: 6,
                          border: '1px solid var(--line-2)',
                          fontWeight: 600,
                        }}
                      >
                        {keyOptions(item.key).map((opt) => (
                          <option key={opt.key} value={opt.key}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <Badge colorPalette="gray" variant="outline">No key</Badge>
                    )}
                    {editable && (
                      <>
                        <Button size="xs" variant="outline" onClick={() => move(index, -1)}>
                          <ChevronUp size={14} />
                        </Button>
                        <Button size="xs" variant="outline" onClick={() => move(index, 1)}>
                          <ChevronDown size={14} />
                        </Button>
                        <Button size="xs" variant="ghost" colorPalette="red" onClick={() => remove(item.id)}>
                          <X size={14} />
                        </Button>
                      </>
                    )}
                  </HStack>
                </Flex>

                {item.hasAudio && openPlayers[item.id] && (
                  <Box mt={3} pt={3} borderTopWidth="1px" className="no-print">
                    <AudioPlayer
                      key={item.id}
                      songId={item.songId}
                      canEdit={editable}
                      tuneOverride={item.tuneOffset ?? item.audioTuneOffset}
                      onSaveTune={editable ? saveTune(item) : undefined}
                    />
                  </Box>
                )}

                {(item.content.trim() || notes.general.length > 0) && (
                  <Box mt={4} pt={4} borderTopWidth="1px">
                    <NoteCardList cards={notes.general} />
                    <Box mt={notes.general.length ? 3 : 0}>
                      <ChordChart
                        content={item.content}
                        fromKey={item.key ?? ''}
                        toKey={displayKey}
                        sectionNotes={notes.bySection}
                      />
                    </Box>
                  </Box>
                )}
              </Box>
            );
          })}
        </Stack>
      )}

      {items.length > 0 && <AutoScrollWidget />}
    </Stack>
  );
}
