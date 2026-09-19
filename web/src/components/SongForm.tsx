import { Box, Button, Flex, Heading, Input, Spinner, Stack, Text } from '@chakra-ui/react';
import { Archive } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import api, { apiError } from '@/lib/api';
import { canEdit } from '@/lib/auth';
import { KEYS, normalizeKey } from '@/lib/chords';
import { useKeyConvert } from '@/lib/useKeyConvert';
import { useApp } from '@/contexts/AppContext';
import { useMetronome } from '@/contexts/MetronomeContext';
import { useAutosave } from '@/lib/useAutosave';
import { toastSaveFailed, toastSaved } from '@/components/Toaster';
import AudioPlayer from '@/components/AudioPlayer';
import AudioUpload from '@/components/AudioUpload';
import ChartEditorPanels, { KeyConvertBanner } from '@/components/ChartEditorPanels';
import { ChartV2Editor } from '@/components/ChartV2';
import { EditorActionBar, MoreDetails } from '@/components/EditorChrome';
import { useChartFontSize } from '@/lib/useChartFontSize';
import { useEditorV2 } from '@/lib/useEditorV2';
import { toV2Draft } from '@/lib/v2draft';
import { CHART_LAYOUTS, Field, Select } from '@/components/FormControls';
import NoteCardsEditor from '@/components/NoteCardsEditor';
import type { NoteCard, Song } from '@/types';

const TIME_SIGNATURES = ['4/4', '3/4', '6/8', '2/4', '12/8', '5/4', '7/8'];
const FEELS = ['Straight', 'Swing', 'Shuffle', 'Ballad', 'Driving', 'Half-time', 'Waltz', 'Anthemic'];

interface Props {
  /** The songbank song to edit; omitted means a new song. */
  songId?: string;
  /** The left end of the action bar — the page puts its Back link here, the
   *  modal a Cancel. */
  leading?: ReactNode;
  /** The page shows "Edit song" here; a modal has it in its own title bar. */
  heading?: string;
  /** Called with the saved (or newly created) song. Where the user goes next
   *  is the host's decision — the page navigates, the modal closes. */
  onSaved: (song: Song) => void;
  /** Offers Archive (existing songs only) and is called once it's done. */
  onArchived?: () => void;
  /** Hosted in the setlist's modal, whose body already pads the bottom. On
   *  the full page the bar floats higher, clear of the viewport edge. */
  inModal?: boolean;
}

/**
 * The songbank song editor, host-agnostic: the same form drives the
 * /songs/:id/edit page and the "edit from songbank" modal on a setlist, so a
 * leader can fix a chart without leaving the service they're building.
 */
export default function SongForm({ songId, leading, heading, onSaved, onArchived, inModal }: Props) {
  const { user } = useApp();
  const isNew = !songId;
  const editable = canEdit(user);

  // Which chart this form edits: the classic ChordPro `content`, or the v2
  // plain text `contentV2`. App-wide, from the header. The other is carried
  // through untouched.
  const [v2] = useEditorV2();
  const [chartFontSize] = useChartFontSize();

  // Tell the floating chrome an editor is up (see MetronomeContext.editing).
  const { setEditing } = useMetronome();
  useEffect(() => {
    setEditing(true);
    return () => setEditing(false);
  }, [setEditing]);

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
    contentV2: '',
  });
  const [noteCards, setNoteCards] = useState<NoteCard[]>([]);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Only for an existing song is there a known key to convert from.
  const convert = useKeyConvert({
    enabled: !isNew,
    targetKey: form.key,
    content: v2 ? form.contentV2 : form.content,
    setContent: (text) => setForm((prev) => (v2 ? { ...prev, contentV2: text } : { ...prev, content: text })),
  });
  const { setContentKey } = convert;

  useEffect(() => {
    if (isNew) return;
    api
      .get<Song>(`/api/songs/${songId}`)
      .then(({ data }) => {
        // Respelled on the way in, both here and on the form, so a song saved
        // as "Ab" shows "G#" — the same key — without the two disagreeing and
        // offering to convert a chart that hasn't moved.
        setContentKey(normalizeKey(data.key ?? ''));
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
          key: normalizeKey(data.key ?? ''),
          timeSignature: data.timeSignature,
          tempo: data.tempo?.toString() ?? '',
          feel: data.feel,
          ccli: data.ccli,
          tags: data.tags.join(', '),
          content: data.content,
          chartColumns: data.chartColumns === 2 ? '2' : '1',
          // In v2, a song that has never been saved in v2 starts from a
          // draft laid out from its classic chart — the "copy the original"
          // moment, written on the first save. In classic the stored value
          // rides along untouched, draft or no draft.
          contentV2: data.contentV2 || (v2 ? toV2Draft(data.content) : ''),
        });
      })
      .catch((err) => setError(apiError(err, 'Could not load song')))
      .finally(() => setLoading(false));
    // v2 is read once, at load: flipping it mid-edit shouldn't reload the form.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [songId, isNew, setContentKey]);

  const set = (key: keyof typeof form) => (value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const payload = () => ({
    ...form,
    key: form.key || null,
    tempo: form.tempo ? Number(form.tempo) : null,
    tags: form.tags.split(',').map((t) => t.trim()).filter(Boolean),
    // The legacy single notes field is retired in favour of note cards.
    notes: '',
    noteCards: noteCards.filter((c) => c.text.trim()),
    chartColumns: form.chartColumns === '2' ? 2 : 1,
  });

  // Writes the form to the songbank. Shared by the Save button and the
  // autosave; the two differ only in what happens after (see each). Throws
  // on failure so each can report it its own way.
  const persist = async (): Promise<Song> => {
    if (isNew) {
      const { data } = await api.post<Song>('/api/songs', payload());
      return data;
    }
    // clearTempo/clearKey tell the API an empty field means "remove it",
    // not "leave it alone" — COALESCE alone can't tell those apart.
    const { data } = await api.patch<Song>(`/api/songs/${songId}`, payload(), {
      params: {
        ...(form.tempo ? {} : { clearTempo: '1' }),
        ...(form.key ? {} : { clearKey: '1' }),
      },
    });
    return data;
  };

  // Autosave: an existing song is saved on its own a beat after it stops
  // changing, with a small nod when it lands. A new song waits for the Save
  // button — until then there is nothing to save onto. A blank title is
  // declined quietly; the Save button says why.
  const { markSaved } = useAutosave({
    snapshot: JSON.stringify({ form, noteCards }),
    enabled: !isNew && !loading,
    save: async () => {
      if (!form.title.trim()) return false;
      try {
        await persist();
        toastSaved();
        return true;
      } catch (err) {
        toastSaveFailed(apiError(err, 'Could not save song'));
        return false;
      }
    },
  });

  // The Save button: save now, then hand off (the page navigates, the modal
  // closes). markSaved so the autosave doesn't repeat it on the way out.
  const save = async () => {
    if (!form.title.trim()) {
      setError('Title is required');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const song = await persist();
      markSaved();
      onSaved(song);
    } catch (err) {
      setError(apiError(err, 'Could not save song'));
    } finally {
      setSaving(false);
    }
  };

  // Archiving is the only "remove" the editor offers. It hides the song from
  // the songbank without destroying it; restoring or deleting for good both
  // happen on the Archive page.
  const archive = async () => {
    if (!confirm(`Archive "${form.title}"? It leaves the songbank but can be restored from the Archive page.`)) return;
    try {
      await api.post(`/api/songs/${songId}/archive`);
      onArchived?.();
    } catch (err) {
      setError(apiError(err, 'Could not archive song'));
    }
  };

  if (loading) return <Spinner />;

  return (
    <Stack gap={4}>
      {heading && <Heading size="lg">{heading}</Heading>}
      {error && <Text color="red.600">{error}</Text>}

      <Box bg="white" p={5} borderRadius="lg" borderWidth="1px">
        <Stack gap={3}>
          {/* The four things every chart is filed by, on one line where the
              width allows; each field wraps to its own line as space runs
              out, title first. */}
          <Flex gap={3} wrap="wrap" align="flex-end">
            <Box flex="2 1 220px">
              <Field label="Title">
                <Input value={form.title} onChange={(e) => set('title')(e.target.value)} placeholder="Song title" />
              </Field>
            </Box>
            <Box flex="1 1 160px">
              <Field label="Artist">
                <Input value={form.artist} onChange={(e) => set('artist')(e.target.value)} placeholder="Artist" />
              </Field>
            </Box>
            <Box flex="0 1 110px">
              <Field label="Key">
                <Select
                  value={form.key}
                  onChange={set('key')}
                  options={['', ...KEYS]}
                  emptyLabel="Not set"
                />
              </Field>
            </Box>
            <Box flex="0 1 120px">
              <Field label="Time signature">
                <Select value={form.timeSignature} onChange={set('timeSignature')} options={TIME_SIGNATURES} />
              </Field>
            </Box>
            <MoreDetails>
              <Stack gap={3}>
                <Flex gap={3} wrap="wrap">
                  <Box flex="1 1 100px">
                    <Field label="Tempo (bpm)">
                      <Input
                        type="number"
                        value={form.tempo}
                        onChange={(e) => set('tempo')(e.target.value)}
                        placeholder="72"
                      />
                    </Field>
                  </Box>
                  <Box flex="1 1 120px">
                    <Field label="Feel">
                      <Select value={form.feel} onChange={set('feel')} options={['', ...FEELS]} />
                    </Field>
                  </Box>
                  <Box flex="1 1 100px">
                    <Field label="CCLI">
                      <Input value={form.ccli} onChange={(e) => set('ccli')(e.target.value)} placeholder="1234567" />
                    </Field>
                  </Box>
                </Flex>
                <Field label="Chart layout">
                  <Select
                    value={form.chartColumns}
                    onChange={set('chartColumns')}
                    options={CHART_LAYOUTS}
                    title="Two columns split the chart side by side on wide screens; narrow screens always fall back to one"
                  />
                </Field>
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
            </MoreDetails>
          </Flex>

          <KeyConvertBanner convert={convert} targetKey={form.key} />
        </Stack>
      </Box>

      {/* Reference track: the player when there is one, and for editors a
          single line — attach/replace button, size limit, and the one thing
          worth knowing about pitch here — with no heading above it. */}
      {!isNew && (hasAudio || editable) && (
        <Box bg="white" p={4} borderRadius="lg" borderWidth="1px">
          <Stack gap={3}>
            {hasAudio && (
              <AudioPlayer
                key={`${songId}-${audioVersion}`}
                songId={songId!}
                canEdit={editable}
                onRemoved={() => setHasAudio(false)}
              />
            )}
            {editable && (
              <AudioUpload
                songId={songId!}
                hasExisting={hasAudio}
                hint="Pitch here is preview-only; save a tune for the team from a setlist."
                onUploaded={() => {
                  setHasAudio(true);
                  setAudioVersion((v) => v + 1);
                }}
              />
            )}
          </Stack>
        </Box>
      )}

      {v2 ? (
        /* The v2 chart: one plain-text panel that looks exactly like the
           chart on the page. */
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

      <EditorActionBar leading={leading} inModal={inModal}>
        {!isNew && onArchived && (
          <Button size="sm" variant="outline" bg="white" onClick={archive} title="Archive this song">
            <Archive size={16} />
            <Text ml={1}>Archive</Text>
          </Button>
        )}
        <Button size="sm" colorPalette="brand" onClick={save} loading={saving}>
          Save
        </Button>
      </EditorActionBar>
    </Stack>
  );
}
