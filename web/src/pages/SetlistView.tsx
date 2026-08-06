import {
  Badge, Box, Button, Flex, HStack, Heading, Input, Spinner, Stack, Text, Textarea,
} from '@chakra-ui/react';
import {
  ArrowLeft, ChevronDown, ChevronUp, EyeOff, FileDown, Music2, Pencil, Plus, Printer, RefreshCw,
  StickyNote, Trash2, X,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import dayjs from 'dayjs';
import api, { apiError } from '@/lib/api';
import { canEdit } from '@/lib/auth';
import { capoKey, keyOptions, semitonesBetween } from '@/lib/chords';
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
  // Which items have their private-note editor open, and the draft being typed.
  // Drafts live apart from `items` so blur can tell "changed" from "just looked".
  const [openNotes, setOpenNotes] = useState<Record<string, boolean>>({});
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  // Players load and show by default; hiding one unmounts it (and stops it),
  // freeing the decoded track until it's shown again.
  const [hiddenPlayers, setHiddenPlayers] = useState<Record<string, boolean>>({});
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
    // Selecting the copy's own key clears the override rather than storing a
    // redundant one — NULL reads as "play it in the copy's key". Updated
    // locally (like saveTune) so open players stay mounted and rapid steps
    // from the pitch link don't wait on a reload.
    const clearKey = key === item.key;
    setItems((prev) =>
      prev.map((it) => (it.id === item.id ? { ...it, keyOverride: clearKey ? null : key } : it)),
    );
    await api.patch(`/api/setlists/${id}/items/${item.id}`, {
      keyOverride: clearKey ? null : key,
      clearKey,
    });
  };

  // Capo and the private note are personal: saved against this account only,
  // invisible to everyone else. Updated locally so open players stay mounted.
  const saveCapo = async (item: SetlistItem, capo: number) => {
    setItems((prev) => prev.map((it) => (it.id === item.id ? { ...it, myCapo: capo } : it)));
    await api.put(`/api/setlists/${id}/items/${item.id}/prefs`, { capo });
  };

  const saveMyNotes = async (item: SetlistItem) => {
    const draft = noteDrafts[item.id];
    if (draft === undefined || draft === item.myNotes) return;
    await api.put(`/api/setlists/${id}/items/${item.id}/prefs`, { notes: draft });
    setItems((prev) => prev.map((it) => (it.id === item.id ? { ...it, myNotes: draft } : it)));
  };

  const toggleMyNotes = (item: SetlistItem) => {
    setNoteDrafts((prev) => (item.id in prev ? prev : { ...prev, [item.id]: item.myNotes }));
    setOpenNotes((prev) => ({ ...prev, [item.id]: !prev[item.id] }));
  };

  // Steps the service key by a semitone delta — the handler behind the
  // player's link toggle, so pitching the track up can carry the chords with
  // it. Goes through setKey, so landing back on the song's own key clears the
  // override, and the key select stays free to revert the chords on its own.
  const shiftKey = (item: SetlistItem) => (delta: number) => {
    if (!item.key) return;
    const current = item.keyOverride ?? item.key;
    const at = semitonesBetween(item.key, current);
    const target = keyOptions(item.key).find(
      (o) => o.semitones === (((at + delta) % 12) + 12) % 12,
    );
    if (target && target.key !== current) setKey(item, target.key);
  };

  const resync = async (item: SetlistItem) => {
    if (
      !window.confirm(
        `Update "${item.title}" from the songbank? This replaces this setlist's edits to the ` +
          `chart, notes and key with the songbank version. Capo settings and the track tune are kept.`,
      )
    )
      return;
    try {
      await api.post(`/api/setlists/${id}/items/${item.id}/resync`);
      load();
    } catch (err) {
      setError(apiError(err, 'Could not update from the songbank'));
    }
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

  // A single song's PDF is a personal copy, so your own capo carries through —
  // the chart prints the shapes you'd play, like SongView's download. The
  // whole-setlist PDF above stays capo-free: it's the shared team artifact.
  const downloadItemPdf = async (item: SetlistItem) => {
    const { downloadSongPdf } = await import('@/lib/pdf');
    const base = toPdfSong(item);
    if (item.myCapo > 0 && base.toKey) {
      downloadSongPdf({
        ...base,
        toKey: capoKey(base.toKey, item.myCapo),
        soundingKey: base.toKey,
        capo: item.myCapo,
      });
    } else {
      downloadSongPdf(base);
    }
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
            // No key on the copy means no anchor to transpose from, so the
            // per-service key picker is unavailable and the chart renders as
            // written.
            const displayKey = item.keyOverride ?? item.key ?? '';
            // With a capo on, the chart shows the shapes being fingered — the
            // capo is yours alone, so everyone reads their own chart.
            const chartKey =
              item.myCapo && displayKey ? capoKey(displayKey, item.myCapo) : displayKey;
            const notes = groupNotes(item.noteCards);
            return (
              <Box key={item.id} bg="white" p={5} borderRadius="lg" borderWidth="1px">
                <Flex justify="space-between" align="start" gap={3} wrap="wrap">
                  <Box>
                    <HStack gap={2}>
                      <Text color="gray.400" fontWeight="bold">
                        {index + 1}
                      </Text>
                      {item.songId ? (
                        <Link to={`/songs/${item.songId}`}>
                          <Text fontWeight="semibold" fontSize="lg">
                            {item.title}
                          </Text>
                        </Link>
                      ) : (
                        <>
                          <Text fontWeight="semibold" fontSize="lg">
                            {item.title}
                          </Text>
                          <Badge colorPalette="gray" variant="outline" title="The songbank song was deleted; this setlist keeps its own copy">
                            removed from songbank
                          </Badge>
                        </>
                      )}
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

                  <HStack gap={2} className="no-print" wrap="wrap">
                    <Button
                      size="xs"
                      variant="outline"
                      onClick={() => downloadItemPdf(item)}
                      title={`Download "${item.title}" as a PDF, in this setlist's key`}
                    >
                      <FileDown size={14} />
                    </Button>
                    <Button
                      size="xs"
                      variant={openNotes[item.id] || item.myNotes.trim() ? 'subtle' : 'outline'}
                      onClick={() => toggleMyNotes(item)}
                      title="Your private note — only you see it"
                    >
                      <StickyNote size={14} />
                    </Button>
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
                    {/* Capo is per-account, so every role gets the control. */}
                    {item.key && (
                      <select
                        value={item.myCapo}
                        onChange={(e) => saveCapo(item, Number(e.target.value))}
                        title="Your capo — saved to your account, invisible to others"
                        style={{
                          padding: '6px 10px',
                          borderRadius: 6,
                          border: '1px solid var(--line-2)',
                        }}
                      >
                        <option value={0}>No capo</option>
                        {Array.from({ length: 11 }, (_, i) => i + 1).map((n) => (
                          <option key={n} value={n}>
                            Capo {n}
                          </option>
                        ))}
                      </select>
                    )}
                    {editable && (
                      <>
                        <Link to={`/setlists/${id}/items/${item.id}/edit`}>
                          <Button
                            size="xs"
                            variant="outline"
                            title="Edit this setlist's copy — the songbank song is untouched"
                          >
                            <Pencil size={14} />
                          </Button>
                        </Link>
                        {item.songId && (
                          <Button
                            size="xs"
                            variant="outline"
                            onClick={() => resync(item)}
                            title="Update this copy from the songbank"
                          >
                            <RefreshCw size={14} />
                          </Button>
                        )}
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

                {item.myCapo > 0 && displayKey && (
                  <Text fontSize="sm" color="gray.600" mt={2} className="no-print">
                    Capo {item.myCapo} — play <strong>{chartKey}</strong> shapes, sounds in{' '}
                    <strong>{displayKey}</strong>. Only you see this capo.
                  </Text>
                )}

                {openNotes[item.id] ? (
                  <Box mt={3} className="no-print">
                    <Textarea
                      value={noteDrafts[item.id] ?? item.myNotes}
                      onChange={(e) =>
                        setNoteDrafts((prev) => ({ ...prev, [item.id]: e.target.value }))
                      }
                      onBlur={() => saveMyNotes(item)}
                      placeholder="Your private note for this song…"
                      rows={2}
                    />
                    <Text fontSize="xs" color="gray.500" mt={1}>
                      Only you see this note.
                    </Text>
                  </Box>
                ) : (
                  item.myNotes.trim() && (
                    <Box
                      mt={3}
                      p={2}
                      bg="yellow.50"
                      borderRadius="md"
                      borderWidth="1px"
                      borderColor="yellow.200"
                      className="no-print"
                      cursor="pointer"
                      onClick={() => toggleMyNotes(item)}
                      title="Your private note — click to edit"
                    >
                      <Text fontSize="sm" whiteSpace="pre-wrap">
                        {item.myNotes}
                      </Text>
                    </Box>
                  )
                )}

                {item.hasAudio && item.songId && (
                  <Box mt={3} pt={3} borderTopWidth="1px" className="no-print">
                    {hiddenPlayers[item.id] ? (
                      <Button
                        size="xs"
                        variant="ghost"
                        color="gray.500"
                        onClick={() =>
                          setHiddenPlayers((prev) => ({ ...prev, [item.id]: false }))
                        }
                      >
                        <Music2 size={14} />
                        <Text ml={1}>Show player</Text>
                      </Button>
                    ) : (
                      <Flex gap={2} align="start">
                        <Box flex="1">
                          <AudioPlayer
                            key={item.id}
                            songId={item.songId}
                            canEdit={editable}
                            tuneOverride={item.tuneOffset ?? item.audioTuneOffset}
                            onSaveTune={editable ? saveTune(item) : undefined}
                            onPitchDelta={editable && item.key ? shiftKey(item) : undefined}
                          />
                        </Box>
                        <Button
                          size="xs"
                          variant="ghost"
                          color="gray.400"
                          onClick={() =>
                            setHiddenPlayers((prev) => ({ ...prev, [item.id]: true }))
                          }
                          title="Hide the player (stops playback)"
                          aria-label="Hide the player"
                        >
                          <EyeOff size={14} />
                        </Button>
                      </Flex>
                    )}
                  </Box>
                )}

                {(item.content.trim() || notes.general.length > 0) && (
                  <Box mt={4} pt={4} borderTopWidth="1px">
                    <NoteCardList cards={notes.general} />
                    <Box mt={notes.general.length ? 3 : 0}>
                      <ChordChart
                        content={item.content}
                        fromKey={item.key ?? ''}
                        toKey={chartKey}
                        sectionNotes={notes.bySection}
                        columns={item.chartColumns}
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
