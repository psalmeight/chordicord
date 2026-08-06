import {
  Box, Button, Flex, Grid, HStack, Heading, Input, Spinner, Stack, Text,
} from '@chakra-ui/react';
import { ArrowLeft, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import api, { apiError } from '@/lib/api';
import { canEdit } from '@/lib/auth';
import { KEYS } from '@/lib/chords';
import { useKeyConvert } from '@/lib/useKeyConvert';
import { useApp } from '@/contexts/AppContext';
import AudioPlayer from '@/components/AudioPlayer';
import AudioUpload from '@/components/AudioUpload';
import ChartEditorPanels, { KeyConvertBanner } from '@/components/ChartEditorPanels';
import { Field, Select } from '@/components/FormControls';
import NoteCardsEditor from '@/components/NoteCardsEditor';
import type { NoteCard, Song } from '@/types';

const TIME_SIGNATURES = ['4/4', '3/4', '6/8', '2/4', '12/8', '5/4', '7/8'];
const FEELS = ['Straight', 'Swing', 'Shuffle', 'Ballad', 'Driving', 'Half-time', 'Waltz', 'Anthemic'];

export default function SongEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useApp();
  const isNew = !id;
  const editable = canEdit(user);

  // Reference-track state. Pitch in the player is preview-only here — the
  // saved, shared tune lives on each setlist item, not the songbank.
  const [hasAudio, setHasAudio] = useState(false);
  // Bumped on upload so the player remounts and pulls a fresh signed URL.
  const [audioVersion, setAudioVersion] = useState(0);

  const [form, setForm] = useState({
    title: '',
    artist: '',
    // Empty means "not known yet". Defaulting to C would make every new song
    // claim a key it hasn't got, and transposition is measured from this.
    key: '',
    timeSignature: '4/4',
    tempo: '',
    feel: '',
    ccli: '',
    tags: '',
    content: '',
    chartColumns: '1',
  });
  const [noteCards, setNoteCards] = useState<NoteCard[]>([]);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Only for an existing song is there a known key to convert from.
  const convert = useKeyConvert({
    enabled: !isNew,
    targetKey: form.key,
    content: form.content,
    setContent: (content) => setForm((prev) => ({ ...prev, content })),
  });
  const { setContentKey } = convert;

  useEffect(() => {
    if (isNew) return;
    api
      .get<Song>(`/api/songs/${id}`)
      .then(({ data }) => {
        setContentKey(data.key ?? '');
        setHasAudio(data.hasAudio);
        setNoteCards(
          data.noteCards?.length
            ? data.noteCards
            : data.notes
              ? [{ color: 'amber', text: data.notes, section: '' }]
              : [],
        );
        setForm({
          title: data.title,
          artist: data.artist,
          key: data.key ?? '',
          timeSignature: data.timeSignature,
          tempo: data.tempo?.toString() ?? '',
          feel: data.feel,
          ccli: data.ccli,
          tags: data.tags.join(', '),
          content: data.content,
          chartColumns: data.chartColumns === 2 ? '2' : '1',
        });
      })
      .catch((err) => setError(apiError(err, 'Could not load song')))
      .finally(() => setLoading(false));
  }, [id, isNew, setContentKey]);

  const set = (key: keyof typeof form) => (value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const save = async () => {
    if (!form.title.trim()) {
      setError('Title is required');
      return;
    }
    setSaving(true);
    setError('');

    const payload = {
      ...form,
      key: form.key || null,
      tempo: form.tempo ? Number(form.tempo) : null,
      tags: form.tags.split(',').map((t) => t.trim()).filter(Boolean),
      // The legacy single notes field is retired in favour of note cards.
      notes: '',
      noteCards: noteCards.filter((c) => c.text.trim()),
      chartColumns: form.chartColumns === '2' ? 2 : 1,
    };

    try {
      if (isNew) {
        const { data } = await api.post<Song>('/api/songs', payload);
        navigate(`/songs/${data.id}`, { replace: true });
      } else {
        // clearTempo/clearKey tell the API an empty field means "remove it",
        // not "leave it alone" — COALESCE alone can't tell those apart.
        await api.patch(`/api/songs/${id}`, payload, {
          params: {
            ...(form.tempo ? {} : { clearTempo: '1' }),
            ...(form.key ? {} : { clearKey: '1' }),
          },
        });
        navigate(`/songs/${id}`);
      }
    } catch (err) {
      setError(apiError(err, 'Could not save song'));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!confirm(`Delete "${form.title}"? This cannot be undone.`)) return;
    try {
      await api.delete(`/api/songs/${id}`);
      navigate('/', { replace: true });
    } catch (err) {
      setError(apiError(err, 'Could not delete song'));
    }
  };

  if (loading) return <Spinner />;

  return (
    <Stack gap={4}>
      <Flex justify="space-between" align="center" wrap="wrap" gap={3}>
        <Link to={isNew ? '/' : `/songs/${id}`}>
          <Button size="sm" variant="ghost">
            <ArrowLeft size={16} />
            <Text ml={1}>Back</Text>
          </Button>
        </Link>
        <HStack gap={2}>
          {!isNew && (
            <Button size="sm" variant="outline" colorPalette="red" onClick={remove}>
              <Trash2 size={16} />
            </Button>
          )}
          <Button size="sm" colorPalette="brand" onClick={save} loading={saving}>
            Save
          </Button>
        </HStack>
      </Flex>

      <Heading size="lg">{isNew ? 'New song' : 'Edit song'}</Heading>
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

          <Grid templateColumns={{ base: '1fr 1fr', md: 'repeat(6, 1fr)' }} gap={3}>
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
            <Field label="CCLI">
              <Input value={form.ccli} onChange={(e) => set('ccli')(e.target.value)} placeholder="1234567" />
            </Field>
            <Field label="Chart layout">
              <select
                value={form.chartColumns}
                onChange={(e) => set('chartColumns')(e.target.value)}
                title="Two columns split the chart side by side on wide screens; narrow screens always fall back to one"
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  borderRadius: 6,
                  border: '1px solid var(--line)',
                  background: 'white',
                }}
              >
                <option value="1">1 column</option>
                <option value="2">2 columns</option>
              </select>
            </Field>
          </Grid>

          <KeyConvertBanner convert={convert} targetKey={form.key} />

          <Field label="Tags (comma separated)">
            <Input
              value={form.tags}
              onChange={(e) => set('tags')(e.target.value)}
              placeholder="worship, christmas, fast"
            />
          </Field>

          <Field label="Notes">
            <NoteCardsEditor cards={noteCards} content={form.content} onChange={setNoteCards} />
          </Field>
        </Stack>
      </Box>

      {!isNew && (hasAudio || editable) && (
        <Box bg="white" p={5} borderRadius="lg" borderWidth="1px">
          <Text fontWeight="medium" mb={1}>
            Reference track
          </Text>
          <Text fontSize="xs" color="gray.600" mb={3}>
            Play along to check the recording. Pitch here is preview-only — save
            a tune for the team from a setlist, where it belongs to that service.
          </Text>
          {hasAudio ? (
            <Stack gap={3}>
              <AudioPlayer
                key={`${id}-${audioVersion}`}
                songId={id!}
                canEdit={editable}
                onRemoved={() => setHasAudio(false)}
              />
              {editable && (
                <AudioUpload songId={id!} hasExisting onUploaded={() => setAudioVersion((v) => v + 1)} />
              )}
            </Stack>
          ) : (
            <AudioUpload
              songId={id!}
              hasExisting={false}
              onUploaded={() => {
                setHasAudio(true);
                setAudioVersion((v) => v + 1);
              }}
            />
          )}
        </Box>
      )}

      <ChartEditorPanels
        content={form.content}
        songKey={form.key}
        noteCards={noteCards}
        onContentChange={set('content')}
        chartColumns={form.chartColumns === '2' ? 2 : 1}
      />
    </Stack>
  );
}
