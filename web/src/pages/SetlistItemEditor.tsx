import {
  Box, Button, Flex, Grid, HStack, Heading, Input, Spinner, Stack, Text,
} from '@chakra-ui/react';
import { ArrowLeft } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import api, { apiError } from '@/lib/api';
import { KEYS, normalizeKey } from '@/lib/chords';
import { useKeyConvert } from '@/lib/useKeyConvert';
import ChartEditorPanels, { KeyConvertBanner } from '@/components/ChartEditorPanels';
import { ChartV2Editor } from '@/components/ChartV2';
import { useChartFontSize } from '@/lib/useChartFontSize';
import { useEditorV2 } from '@/lib/useEditorV2';
import { toV2Draft } from '@/lib/v2draft';
import { CHART_LAYOUTS, Field, Select } from '@/components/FormControls';
import NoteCardsEditor from '@/components/NoteCardsEditor';
import { toastSaveFailed, toastSaved } from '@/components/Toaster';
import { useAutosave } from '@/lib/useAutosave';
import type { NoteCard, Setlist, SetlistItem } from '@/types';

const TIME_SIGNATURES = ['4/4', '3/4', '6/8', '2/4', '12/8', '5/4', '7/8'];
const FEELS = ['Straight', 'Swing', 'Shuffle', 'Ballad', 'Driving', 'Half-time', 'Waltz', 'Anthemic'];

/** Edits a setlist's own copy of a song. Everything saved here lands on the
 *  setlist item only — the songbank song is never touched. */
export default function SetlistItemEditor() {
  const { id, itemId } = useParams();
  const navigate = useNavigate();
  // Which chart this form edits — see SongForm.
  const [v2] = useEditorV2();
  const [chartFontSize] = useChartFontSize();

  const [setlistName, setSetlistName] = useState('');
  const [form, setForm] = useState({
    title: '',
    artist: '',
    key: '',
    timeSignature: '4/4',
    tempo: '',
    feel: '',
    content: '',
    chartColumns: '1',
    contentV2: '',
  });
  const [noteCards, setNoteCards] = useState<NoteCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const convert = useKeyConvert({
    enabled: true,
    targetKey: form.key,
    content: v2 ? form.contentV2 : form.content,
    setContent: (text) => setForm((prev) => (v2 ? { ...prev, contentV2: text } : { ...prev, content: text })),
  });
  const { setContentKey } = convert;

  useEffect(() => {
    api
      .get<{ setlist: Setlist; items: SetlistItem[] }>(`/api/setlists/${id}`)
      .then(({ data }) => {
        const item = data.items.find((i) => i.id === itemId);
        if (!item) {
          setError('This song is no longer in the setlist');
          return;
        }
        setSetlistName(data.setlist.name);
        // Respelled the app's way on the way in, the same as SongEditor does.
        setContentKey(normalizeKey(item.key ?? ''));
        setNoteCards(item.noteCards ?? []);
        setForm({
          title: item.title,
          artist: item.artist,
          key: normalizeKey(item.key ?? ''),
          timeSignature: item.timeSignature,
          tempo: item.tempo?.toString() ?? '',
          feel: item.feel,
          content: item.content,
          chartColumns: item.chartColumns === 2 ? '2' : '1',
          // See SongForm: a v2 draft from the classic copy, in v2 only.
          contentV2: item.contentV2 || (v2 ? toV2Draft(item.content) : ''),
        });
      })
      .catch((err) => setError(apiError(err, 'Could not load the setlist')))
      .finally(() => setLoading(false));
    // v2 is read once, at load: flipping it mid-edit shouldn't reload the form.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, itemId, setContentKey]);

  const set = (key: keyof typeof form) => (value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  // Writes the form to the setlist item. Shared by the Save button and the
  // autosave. Throws on failure so each can report it its own way.
  const persist = () =>
    api.patch(`/api/setlists/${id}/items/${itemId}`, {
      title: form.title.trim(),
      artist: form.artist,
      songKey: form.key || null,
      clearSongKey: !form.key,
      timeSignature: form.timeSignature,
      tempo: form.tempo ? Number(form.tempo) : null,
      clearTempo: !form.tempo,
      feel: form.feel,
      content: form.content,
      noteCards: noteCards.filter((c) => c.text.trim()),
      chartColumns: form.chartColumns === '2' ? 2 : 1,
      contentV2: form.contentV2,
    });

  // Autosave, a beat after the form stops changing, with a small nod when it
  // lands. A blank title is declined quietly; the Save button says why.
  const { markSaved } = useAutosave({
    snapshot: JSON.stringify({ form, noteCards }),
    enabled: !loading && Boolean(form.title),
    save: async () => {
      if (!form.title.trim()) return false;
      try {
        await persist();
        toastSaved();
        return true;
      } catch (err) {
        toastSaveFailed(apiError(err, 'Could not save the changes'));
        return false;
      }
    },
  });

  // The Save button: save now and go back to the setlist.
  const save = async () => {
    if (!form.title.trim()) {
      setError('Title is required');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await persist();
      markSaved();
      navigate(`/setlists/${id}`);
    } catch (err) {
      setError(apiError(err, 'Could not save the changes'));
      setSaving(false);
    }
  };

  if (loading) return <Spinner />;
  if (error && !form.title) return <Text color="red.600">{error}</Text>;

  return (
    <Stack gap={4}>
      <Flex justify="space-between" align="center" wrap="wrap" gap={3}>
        <Link to={`/setlists/${id}`}>
          <Button size="sm" variant="ghost">
            <ArrowLeft size={16} />
            <Text ml={1}>{setlistName || 'Setlist'}</Text>
          </Button>
        </Link>
        <HStack gap={2}>
          <Button size="sm" colorPalette="brand" onClick={save} loading={saving}>
            Save
          </Button>
        </HStack>
      </Flex>

      <Heading size="lg">Edit for this setlist</Heading>
      <Box
        p={3}
        bg="brand.50"
        borderRadius="md"
        borderLeftWidth="3px"
        borderColor="brand.400"
      >
        <Text fontSize="sm">
          You're editing this setlist's copy of the song — the songbank version is untouched,
          and everyone viewing this setlist sees your changes.
        </Text>
      </Box>
      {error && <Text color="red.600">{error}</Text>}

      <Box bg="white" p={5} borderRadius="lg" borderWidth="1px">
        <Stack gap={4}>
          <Grid templateColumns={{ base: '1fr', md: '2fr 1fr' }} gap={3}>
            <Field label="Title">
              <Input value={form.title} onChange={(e) => set('title')(e.target.value)} placeholder="Song title" />
            </Field>
            <Field label="Artist">
              <Input value={form.artist} onChange={(e) => set('artist')(e.target.value)} placeholder="Artist" />
            </Field>
          </Grid>

          <Grid templateColumns={{ base: '1fr 1fr', md: 'repeat(5, 1fr)' }} gap={3}>
            <Field label="Key">
              <Select
                value={form.key}
                onChange={set('key')}
                options={['', ...KEYS]}
                emptyLabel="Not set"
              />
            </Field>
            <Field label="Time signature">
              <Select value={form.timeSignature} onChange={set('timeSignature')} options={TIME_SIGNATURES} />
            </Field>
            <Field label="Tempo (bpm)">
              <Input
                type="number"
                value={form.tempo}
                onChange={(e) => set('tempo')(e.target.value)}
                placeholder="72"
              />
            </Field>
            <Field label="Feel">
              <Select value={form.feel} onChange={set('feel')} options={['', ...FEELS]} />
            </Field>
            <Field label="Chart layout">
              <Select
                value={form.chartColumns}
                onChange={set('chartColumns')}
                options={CHART_LAYOUTS}
                title="Two columns split the chart side by side on wide screens; narrow screens always fall back to one"
              />
            </Field>
          </Grid>

          <KeyConvertBanner convert={convert} targetKey={form.key} />

          <Field label="Notes (shared — everyone viewing this setlist sees them)">
            <NoteCardsEditor cards={noteCards} content={form.content} onChange={setNoteCards} />
          </Field>
        </Stack>
      </Box>

      {v2 ? (
        <Box bg="white" p={5} borderRadius="lg" borderWidth="1px">
          <ChartV2Editor value={form.contentV2} onChange={set('contentV2')} fontSize={chartFontSize} />
        </Box>
      ) : (
        <ChartEditorPanels
          content={form.content}
          songKey={form.key}
          noteCards={noteCards}
          onContentChange={set('content')}
          chartColumns={form.chartColumns === '2' ? 2 : 1}
        />
      )}
    </Stack>
  );
}
