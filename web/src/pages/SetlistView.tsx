import {
  Badge, Box, Button, Dialog, Flex, HStack, Heading, Input, Popover, Portal, Spinner, Stack, Text,
  Textarea,
} from '@chakra-ui/react';
import {
  Archive, ArrowLeft, ChevronDown, ChevronUp, Columns2, EyeOff, FileDown, Library, Music2, Pencil,
  Plus, Printer, RefreshCw, SlidersHorizontal, StickyNote, X,
} from 'lucide-react';
import { forwardRef, useEffect, useState } from 'react';
import type { ComponentProps, ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import dayjs from 'dayjs';
import api, { apiError } from '@/lib/api';
import { canEdit } from '@/lib/auth';
import { capoKey, keyOptions, semitonesBetween } from '@/lib/chords';
import { groupNotes } from '@/lib/noteColors';
import type { Cover, PdfSong } from '@/lib/pdf';
import { useChartFontSize } from '@/lib/useChartFontSize';
import { useEditorV2 } from '@/lib/useEditorV2';
import { toV2Draft } from '@/lib/v2draft';
import { useApp } from '@/contexts/AppContext';
import ArchivedBanner from '@/components/ArchivedBanner';
import AudioPlayer from '@/components/AudioPlayer';
import AutoScrollWidget from '@/components/AutoScrollWidget';
import ChartV2 from '@/components/ChartV2';
import ChordChart from '@/components/ChordChart';
import { CAPO_OPTIONS, Select } from '@/components/FormControls';
import { NoteCardList } from '@/components/NoteCardView';
import SongForm from '@/components/SongForm';
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
  columns: item.chartColumns,
});

/** A labelled control row inside the per-song options popover. */
function OptionRow({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <Box>
      <Flex justify="space-between" align="baseline" mb={1}>
        <Text fontSize="xs" fontWeight="medium" color="gray.600">
          {label}
        </Text>
        {hint && (
          <Text fontSize="xs" color="gray.400">
            {hint}
          </Text>
        )}
      </Flex>
      {children}
    </Box>
  );
}

/** One action in the popover: an icon with its name written out, left-aligned
 *  so the list scans like a menu. forwardRef so Popover.CloseTrigger can wrap it. */
const OptionButton = forwardRef<
  HTMLButtonElement,
  { icon: ReactNode; danger?: boolean } & ComponentProps<typeof Button>
>(function OptionButton({ icon, danger, children, ...rest }, ref) {
  return (
    <Button
      ref={ref}
      size="sm"
      variant="ghost"
      w="100%"
      justifyContent="flex-start"
      colorPalette={danger ? 'red' : 'gray'}
      color={danger ? 'red.600' : undefined}
      {...rest}
    >
      {icon}
      <Text ml={2}>{children}</Text>
    </Button>
  );
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
  // Set once for every chart, from the header — see useChartFontSize.
  const [fontSize] = useChartFontSize();
  // The v2 chart, app-wide from the header — see ChartV2.
  const [v2] = useEditorV2();
  // The setlist item whose songbank song is open in the edit modal — a
  // leader fixes the chart at its source without leaving the service.
  const [songbankEdit, setSongbankEdit] = useState<SetlistItem | null>(null);

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

  // The column count belongs to the shared chart, not to the reader, so it
  // saves onto the item the way the key does — the editor page still offers it,
  // this just spares a round trip through it to flip one setting. Updated
  // locally so open players stay mounted.
  const setColumns = async (item: SetlistItem, columns: number) => {
    setItems((prev) =>
      prev.map((it) => (it.id === item.id ? { ...it, chartColumns: columns } : it)),
    );
    await api.patch(`/api/setlists/${id}/items/${item.id}`, { chartColumns: columns });
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

  const resyncNow = async (item: SetlistItem) => {
    try {
      await api.post(`/api/setlists/${id}/items/${item.id}/resync`);
      load();
    } catch (err) {
      setError(apiError(err, 'Could not update from the songbank'));
    }
  };

  const resync = async (item: SetlistItem) => {
    if (
      !window.confirm(
        `Update "${item.title}" from the songbank? This replaces this setlist's edits to the ` +
          `chart, notes and key with the songbank version. Capo settings and the track tune are kept.`,
      )
    )
      return;
    await resyncNow(item);
  };

  // After a songbank edit made from this page, the obvious next step is to
  // pull it into the setlist — but it's offered, not assumed, because the
  // copy may carry deliberate per-service edits the resync would erase.
  const songbankSaved = async () => {
    const item = songbankEdit;
    setSongbankEdit(null);
    if (!item) return;
    if (
      window.confirm(
        `Saved to the songbank. Update this setlist's copy of "${item.title}" from it now? ` +
          `That replaces this setlist's edits to the chart, notes and key. Capo settings and the track tune are kept.`,
      )
    ) {
      await resyncNow(item);
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

  /** The running-order page at the front of the printed setlist. */
  const cover = (): Cover => ({
    title: setlist!.name,
    subtitle: setlist!.serviceDate
      ? dayjs(setlist!.serviceDate).format('dddd, D MMMM YYYY')
      : undefined,
    notes: setlist!.notes,
  });

  // Print and download build the same document — the printer gets the file,
  // not the page, so what comes off it is the setlist as a chart book rather
  // than a screenshot of this screen. The PDF renderer carries a typesetting
  // library with it, so it is pulled in on the first press rather than on every
  // page load.
  const runPdf = async (action: 'save' | 'print') => {
    setPdfBusy(true);
    try {
      const pdf = await import('@/lib/pdf');
      const songs = items.map(toPdfSong);
      if (action === 'save') pdf.downloadSetlistPdf(cover(), songs);
      else pdf.printSetlistPdf(cover(), songs);
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

  // Archiving is the only "remove" this page offers: the setlist leaves the
  // list but keeps every item and everyone's prefs. Restore and permanent
  // delete both live on the Archive page.
  const archiveSetlist = async () => {
    if (!window.confirm(`Archive "${setlist!.name}"? It leaves the list but can be restored from the Archive page.`)) return;
    try {
      await api.post(`/api/setlists/${id}/archive`);
      navigate('/setlists', { replace: true });
    } catch (err) {
      setError(apiError(err, 'Could not archive setlist'));
    }
  };

  const restoreSetlist = async () => {
    try {
      const { data } = await api.post<Setlist>(`/api/setlists/${id}/restore`);
      setSetlist(data);
    } catch (err) {
      setError(apiError(err, 'Could not restore setlist'));
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
        <HStack gap={2} wrap="wrap">
          <Button
            size="sm"
            variant="outline"
            disabled={items.length === 0}
            loading={pdfBusy}
            onClick={() => runPdf('print')}
            title="Print the whole setlist, a song per page"
          >
            <Printer size={16} />
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={items.length === 0}
            loading={pdfBusy}
            onClick={() => runPdf('save')}
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

      {setlist.archivedAt && (
        <ArchivedBanner
          what="setlist"
          archivedAt={setlist.archivedAt}
          onRestore={editable ? restoreSetlist : undefined}
        />
      )}

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
              <Button size="sm" variant="outline" onClick={archiveSetlist} title="Archive this setlist">
                <Archive size={16} />
                <Text ml={1}>Archive setlist</Text>
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
                    {/* Title | key | time signature on one line: the three
                        things a player checks before the count-in. The key
                        select itself is in the options popover. */}
                    <HStack gap={2} wrap="wrap" fontSize="lg">
                      <Text color="gray.400" fontWeight="bold">
                        {index + 1}
                      </Text>
                      {item.songId ? (
                        <Link to={`/songs/${item.songId}`}>
                          <Text fontWeight="bold">{item.title}</Text>
                        </Link>
                      ) : (
                        <Text fontWeight="bold">{item.title}</Text>
                      )}
                      <Text color="gray.300" aria-hidden>|</Text>
                      {displayKey ? (
                        <Text fontWeight="semibold" color="brand.600">{displayKey}</Text>
                      ) : (
                        <Text color="gray.400">No key</Text>
                      )}
                      <Text color="gray.300" aria-hidden>|</Text>
                      <Text color="gray.700">{item.timeSignature}</Text>
                      {!item.songId && (
                        <Badge colorPalette="gray" variant="outline" title="The songbank song was deleted; this setlist keeps its own copy">
                          removed from songbank
                        </Badge>
                      )}
                    </HStack>
                    {(item.myCapo > 0 && displayKey) || item.tempo || item.feel ||
                    (item.keyOverride && item.keyOverride !== item.key) ? (
                      <HStack gap={3} fontSize="sm" color="gray.600" mt={1} ml={6} wrap="wrap">
                        {item.myCapo > 0 && displayKey && (
                          <Badge colorPalette="yellow" title="Your capo — only you see it">
                            Capo {item.myCapo}
                          </Badge>
                        )}
                        {item.tempo && <Text>{item.tempo} bpm</Text>}
                        {item.feel && <Text>{item.feel}</Text>}
                        {item.keyOverride && item.keyOverride !== item.key && (
                          <Badge colorPalette="orange">from {item.key}</Badge>
                        )}
                      </HStack>
                    ) : null}
                  </Box>

                  <HStack gap={2} className="no-print">
                    {/* Sync stays out on the row: it's the one action a leader
                        reaches for after fixing a chart in the songbank, and it
                        shouldn't hide behind a menu. */}
                    {editable && item.songId && (
                      <Button
                        size="xs"
                        variant="outline"
                        onClick={() => resync(item)}
                        title="Update this copy from the songbank"
                      >
                        <RefreshCw size={14} />
                        <Text ml={1}>Sync</Text>
                      </Button>
                    )}
                    {/* Two things "edit" can mean here, so the button asks:
                        this setlist's own copy (its page), or the songbank
                        song itself (a modal, so the service stays open). */}
                    {editable && (
                      <Popover.Root lazyMount unmountOnExit positioning={{ placement: 'bottom-end' }}>
                        <Popover.Trigger asChild>
                          <Button size="xs" variant="outline">
                            <Pencil size={14} />
                            <Text ml={1}>Edit</Text>
                          </Button>
                        </Popover.Trigger>
                        <Portal>
                          <Popover.Positioner>
                            <Popover.Content w="240px">
                              <Popover.Arrow />
                              <Popover.Body p={2}>
                                <Stack gap={1}>
                                  <Link to={`/setlists/${id}/items/${item.id}/edit`}>
                                    <OptionButton icon={<Pencil size={16} />}>Edit this copy</OptionButton>
                                  </Link>
                                  {item.songId && (
                                    <Popover.CloseTrigger asChild>
                                      <OptionButton
                                        icon={<Library size={16} />}
                                        onClick={() => setSongbankEdit(item)}
                                      >
                                        Edit from songbank
                                      </OptionButton>
                                    </Popover.CloseTrigger>
                                  )}
                                </Stack>
                              </Popover.Body>
                            </Popover.Content>
                          </Popover.Positioner>
                        </Portal>
                      </Popover.Root>
                    )}
                    {/* Everything else that used to be a row of icon buttons,
                        behind one labelled button — a song shows its chart, not
                        a toolbar. Selects and Move keep the popover open; the
                        one-shot actions close it. */}
                    <Popover.Root lazyMount unmountOnExit positioning={{ placement: 'bottom-end' }}>
                      <Popover.Trigger asChild>
                        <Button size="xs" variant="outline">
                          <SlidersHorizontal size={14} />
                          <Text ml={1}>Options</Text>
                        </Button>
                      </Popover.Trigger>
                      <Portal>
                        <Popover.Positioner>
                          <Popover.Content w="270px">
                            <Popover.Arrow />
                            <Popover.Body p={3}>
                              <Stack gap={1}>
                                {item.key ? (
                                  <>
                                    <OptionRow label="Key">
                                      <Select
                                        value={displayKey}
                                        onChange={(v) => setKey(item, v)}
                                        options={keyOptions(item.key).map((opt) => ({ value: opt.key, label: opt.label }))}
                                        disabled={!editable}
                                        size="sm"
                                        triggerProps={{ fontWeight: 'semibold' }}
                                      />
                                    </OptionRow>
                                    {/* Capo is per-account, so every role gets the control. */}
                                    <OptionRow label="Capo" hint="Only you see this">
                                      <Select
                                        value={String(item.myCapo)}
                                        onChange={(v) => saveCapo(item, Number(v))}
                                        options={CAPO_OPTIONS.map((o) => ({
                                          value: o.value,
                                          label: o.value === '0' ? 'No capo' : `Capo ${o.value}`,
                                        }))}
                                        size="sm"
                                      />
                                    </OptionRow>
                                    <Box borderTopWidth="1px" my={1} />
                                  </>
                                ) : null}

                                <Popover.CloseTrigger asChild>
                                  <OptionButton icon={<FileDown size={16} />} onClick={() => downloadItemPdf(item)}>
                                    Download PDF
                                  </OptionButton>
                                </Popover.CloseTrigger>
                                <Popover.CloseTrigger asChild>
                                  <OptionButton icon={<StickyNote size={16} />} onClick={() => toggleMyNotes(item)}>
                                    {openNotes[item.id] ? 'Hide private note' : 'Private note'}
                                  </OptionButton>
                                </Popover.CloseTrigger>

                                {editable && (
                                  <>
                                    <Box borderTopWidth="1px" my={1} />
                                    {/* Only worth offering where there's a chart to lay out —
                                        and the v2 chart has no columns to lay out. */}
                                    {!v2 && item.content.trim() && (
                                      <OptionButton
                                        icon={<Columns2 size={16} />}
                                        onClick={() => setColumns(item, item.chartColumns === 2 ? 1 : 2)}
                                      >
                                        {item.chartColumns === 2 ? 'Back to one column' : 'Split into two columns'}
                                      </OptionButton>
                                    )}
                                    <OptionButton
                                      icon={<ChevronUp size={16} />}
                                      onClick={() => move(index, -1)}
                                      disabled={index === 0}
                                    >
                                      Move up
                                    </OptionButton>
                                    <OptionButton
                                      icon={<ChevronDown size={16} />}
                                      onClick={() => move(index, 1)}
                                      disabled={index === items.length - 1}
                                    >
                                      Move down
                                    </OptionButton>
                                    <Box borderTopWidth="1px" my={1} />
                                    <OptionButton icon={<X size={16} />} onClick={() => remove(item.id)} danger>
                                      Remove from setlist
                                    </OptionButton>
                                  </>
                                )}
                              </Stack>
                            </Popover.Body>
                          </Popover.Content>
                        </Popover.Positioner>
                      </Portal>
                    </Popover.Root>
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

                {v2 ? (
                  /* The v2 chart, from the item's own snapshot — or, until it
                     has one, a draft laid out from the classic copy. Edited
                     through the item's Edit button like everything else. */
                  <Box mt={4} pt={4} borderTopWidth="1px">
                    <ChartV2
                      value={item.contentV2 || toV2Draft(item.content)}
                      fromKey={item.key ?? ''}
                      toKey={chartKey}
                      fontSize={fontSize}
                    />
                  </Box>
                ) : (
                  (item.content.trim() || notes.general.length > 0) && (
                    <Box mt={4} pt={4} borderTopWidth="1px">
                      <NoteCardList cards={notes.general} />
                      <Box mt={notes.general.length ? 3 : 0}>
                        <ChordChart
                          content={item.content}
                          fromKey={item.key ?? ''}
                          toKey={chartKey}
                          fontSize={fontSize}
                          sectionNotes={notes.bySection}
                          columns={item.chartColumns}
                        />
                      </Box>
                    </Box>
                  )
                )}
              </Box>
            );
          })}
        </Stack>
      )}

      {/* Edit-from-songbank. Full-cover with its own scroll: the editor is a
          page's worth of form and chart panels. Closing without saving just
          drops the draft; saving offers a resync (songbankSaved). */}
      <Dialog.Root
        open={songbankEdit !== null}
        onOpenChange={(e) => !e.open && setSongbankEdit(null)}
        size="cover"
        scrollBehavior="inside"
        lazyMount
        unmountOnExit
      >
        <Portal>
          <Dialog.Backdrop />
          <Dialog.Positioner>
            <Dialog.Content bg="gray.50">
              <Dialog.Header>
                {/* Stacked: the header slot lays its children out in a row,
                    which would put the description beside the title. */}
                <Stack gap={0.5}>
                  <Dialog.Title>Edit in songbank</Dialog.Title>
                  <Dialog.Description fontSize="sm" color="gray.600">
                    This is the songbank song. This setlist keeps its own copy until you update it.
                  </Dialog.Description>
                </Stack>
                <Dialog.CloseTrigger asChild>
                  <Button size="xs" variant="ghost" aria-label="Close">
                    <X size={16} />
                  </Button>
                </Dialog.CloseTrigger>
              </Dialog.Header>
              <Dialog.Body>
                {songbankEdit?.songId && (
                  <SongForm
                    songId={songbankEdit.songId}
                    leading={
                      <Button size="sm" variant="ghost" onClick={() => setSongbankEdit(null)}>
                        <ArrowLeft size={16} />
                        <Text ml={1}>Back</Text>
                      </Button>
                    }
                    onSaved={songbankSaved}
                    inModal
                    onArchived={() => {
                      setSongbankEdit(null);
                      load();
                    }}
                  />
                )}
              </Dialog.Body>
            </Dialog.Content>
          </Dialog.Positioner>
        </Portal>
      </Dialog.Root>

      {items.length > 0 && <AutoScrollWidget />}
    </Stack>
  );
}
