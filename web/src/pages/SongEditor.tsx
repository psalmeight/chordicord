import {
  Box, Button, Flex, Grid, HStack, Heading, Input, Spinner, Stack, Text, Textarea,
} from '@chakra-ui/react';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import api, { apiError } from '@/lib/api';
import { canEdit } from '@/lib/auth';
import { KEYS } from '@/lib/chords';
import { hasChords, hasInlineChords, sectionNames, toAligned, transposeContent } from '@/lib/chordpro';
import { NOTE_COLORS, groupNotes, noteColor } from '@/lib/noteColors';
import { useApp } from '@/contexts/AppContext';
import AudioPlayer from '@/components/AudioPlayer';
import AudioUpload from '@/components/AudioUpload';
import ChordChart from '@/components/ChordChart';
import { NoteCardList } from '@/components/NoteCardView';
import type { NoteCard, Song } from '@/types';

const TIME_SIGNATURES = ['4/4', '3/4', '6/8', '2/4', '12/8', '5/4', '7/8'];
const FEELS = ['Straight', 'Swing', 'Shuffle', 'Ballad', 'Driving', 'Half-time', 'Waltz', 'Anthemic'];

const PLACEHOLDER = `{Verse 1}
G                  C         G
Amazing grace how sweet the sound
     G                    D
That saved a wretch like me

{Chorus}
| G | C | G | D |    *2x*
G            C         G
I once was lost but now am found *build*`;

export default function SongEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useApp();
  const isNew = !id;
  const editable = canEdit(user);

  // Reference-track state. The player lets you save its tune from edit mode too.
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
  });
  const [noteCards, setNoteCards] = useState<NoteCard[]>([]);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // The key form.content is actually written in — not the same as form.key,
  // which is just what the dropdown currently reads. They diverge the moment
  // someone picks a different key, and that gap is what the offer below is for.
  const [contentKey, setContentKey] = useState('');
  // Set when a conversion has been applied but not yet saved, so it can be
  // taken back — the chart is the source of truth and this rewrites it.
  const [undo, setUndo] = useState<{ content: string; key: string } | null>(null);
  // Which target key the offer was waved off for, so it stops nagging.
  const [dismissed, setDismissed] = useState('');
  // Content as it was before chords were lifted above the lyrics, so a
  // conversion that lands badly can be taken back before it's saved.
  const [preAlign, setPreAlign] = useState<string | null>(null);

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
        });
      })
      .catch((err) => setError(apiError(err, 'Could not load song')))
      .finally(() => setLoading(false));
  }, [id, isNew]);

  const set = (key: keyof typeof form) => (value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  /**
   * Changing the key means one of two opposite things, and the dropdown alone
   * can't tell them apart: either the chart was mislabelled and only the label
   * should move, or the song is being rewritten and the chords should follow.
   * Guessing wrong corrupts the chart, so it's asked rather than inferred —
   * and only for an existing song, where there's a known key to convert from.
   */
  const offerConvert =
    !isNew && contentKey !== '' && form.key !== '' && form.key !== contentKey &&
    dismissed !== form.key && hasChords(form.content);

  const convertChart = () => {
    setUndo({ content: form.content, key: contentKey });
    setForm((prev) => ({ ...prev, content: transposeContent(prev.content, contentKey, prev.key) }));
    setContentKey(form.key);
  };

  // "It was always in this key" — the label was wrong, the chords were not.
  const relabelOnly = () => {
    setDismissed(form.key);
    setContentKey(form.key);
  };

  const undoConvert = () => {
    if (!undo) return;
    setForm((prev) => ({ ...prev, content: undo.content }));
    setContentKey(undo.key);
    setUndo(null);
  };

  const alignChords = () => {
    setPreAlign(form.content);
    setForm((prev) => ({ ...prev, content: toAligned(prev.content) }));
  };

  const undoAlign = () => {
    if (preAlign === null) return;
    setForm((prev) => ({ ...prev, content: preAlign }));
    setPreAlign(null);
  };

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

  const addCard = () => setNoteCards((cs) => [...cs, { color: 'amber', text: '', section: '' }]);
  const patchCard = (i: number, patch: Partial<NoteCard>) =>
    setNoteCards((cs) => cs.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  const removeCard = (i: number) => setNoteCards((cs) => cs.filter((_, j) => j !== i));

  // Anchor targets: the chart's sections, plus any section a card still points
  // at even after it was renamed/removed, so that choice isn't silently lost.
  const secs = sectionNames(form.content);
  const known = new Set(secs.map((s) => s.toLowerCase()));
  const orphaned = [
    ...new Set(noteCards.map((c) => c.section).filter((s) => s && !known.has(s.toLowerCase()))),
  ];
  const sectionOptions = [...secs, ...orphaned];
  const previewNotes = groupNotes(noteCards);

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
          <Button size="sm" colorPalette="blue" onClick={save} loading={saving}>
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
            <Field label="CCLI">
              <Input value={form.ccli} onChange={(e) => set('ccli')(e.target.value)} placeholder="1234567" />
            </Field>
          </Grid>

          {offerConvert && (
            <Box p={3} bg="blue.50" borderRadius="md" borderLeftWidth="3px" borderColor="blue.400">
              <Text fontSize="sm" mb={2}>
                The chart is written in <strong>{contentKey}</strong> and you've selected{' '}
                <strong>{form.key}</strong>. Should the chords be rewritten?
              </Text>
              <HStack gap={2} wrap="wrap">
                <Button size="xs" colorPalette="blue" onClick={convertChart}>
                  Transpose the chart to {form.key}
                </Button>
                <Button size="xs" variant="outline" onClick={relabelOnly}>
                  It was already in {form.key} — just fix the label
                </Button>
              </HStack>
            </Box>
          )}

          {undo && (
            <Box p={3} bg="green.50" borderRadius="md" borderLeftWidth="3px" borderColor="green.400">
              <HStack gap={3} wrap="wrap">
                <Text fontSize="sm">
                  Chart transposed from <strong>{undo.key}</strong> to <strong>{contentKey}</strong>.
                  Nothing is written until you save.
                </Text>
                <Button size="xs" variant="outline" onClick={undoConvert}>
                  Undo
                </Button>
              </HStack>
            </Box>
          )}

          <Field label="Tags (comma separated)">
            <Input
              value={form.tags}
              onChange={(e) => set('tags')(e.target.value)}
              placeholder="worship, christmas, fast"
            />
          </Field>

          <Field label="Notes">
            <Stack gap={2}>
              {noteCards.map((card, i) => {
                const c = noteColor(card.color);
                return (
                  <Box
                    key={i}
                    borderWidth="1px"
                    borderRadius="md"
                    borderLeftWidth="4px"
                    borderColor={c.border}
                    bg={c.bg}
                    p={3}
                  >
                    <Flex gap={2} align="center" mb={2} wrap="wrap">
                      <HStack gap={1}>
                        {NOTE_COLORS.map((nc) => (
                          <Box
                            as="button"
                            key={nc.key}
                            onClick={() => patchCard(i, { color: nc.key })}
                            w="20px"
                            h="20px"
                            borderRadius="full"
                            bg={nc.swatch}
                            cursor="pointer"
                            borderWidth={card.color === nc.key ? '2px' : '1px'}
                            borderColor={card.color === nc.key ? 'gray.800' : 'blackAlpha.300'}
                            title={nc.label}
                            aria-label={nc.label}
                          />
                        ))}
                      </HStack>
                      <Box flex="1" />
                      <select
                        value={card.section}
                        onChange={(e) => patchCard(i, { section: e.target.value })}
                        title="Where this note appears"
                        style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid #CBD5E0', maxWidth: 170 }}
                      >
                        <option value="">General (top)</option>
                        {sectionOptions.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                      <Button
                        size="xs"
                        variant="ghost"
                        colorPalette="red"
                        onClick={() => removeCard(i)}
                        aria-label="Remove note"
                      >
                        <Trash2 size={14} />
                      </Button>
                    </Flex>
                    <Textarea
                      value={card.text}
                      onChange={(e) => patchCard(i, { text: e.target.value })}
                      placeholder="Arrangement note, cue, caution…"
                      rows={2}
                      bg="white"
                    />
                  </Box>
                );
              })}
              <Button size="sm" variant="outline" alignSelf="start" onClick={addCard}>
                <Plus size={14} />
                <Text ml={1}>Add note</Text>
              </Button>
            </Stack>
          </Field>
        </Stack>
      </Box>

      {!isNew && (hasAudio || editable) && (
        <Box bg="white" p={5} borderRadius="lg" borderWidth="1px">
          <Text fontWeight="medium" mb={1}>
            Reference track
          </Text>
          <Text fontSize="xs" color="gray.600" mb={3}>
            Play along and set the recording's saved tune — its pitch offset is
            independent of the chart key and is shared with the whole team.
          </Text>
          {hasAudio ? (
            <Stack gap={3}>
              <AudioPlayer
                key={`${id}-${audioVersion}`}
                songId={id!}
                canEdit={editable}
                onRemoved={() => setHasAudio(false)}
                onSaveTune={async (semitones) => {
                  await api.patch(`/api/songs/${id}/audio`, { tuneOffset: semitones });
                }}
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

      <Grid templateColumns={{ base: '1fr', lg: '1fr 1fr' }} gap={4}>
        <Box bg="white" p={5} borderRadius="lg" borderWidth="1px">
          <Flex justify="space-between" align="center" gap={2} mb={1} wrap="wrap">
            <Text fontWeight="medium">Lyrics &amp; chords</Text>
            <HStack gap={2}>
              {preAlign !== null && (
                <Button size="xs" variant="ghost" onClick={undoAlign}>
                  Undo
                </Button>
              )}
              {hasInlineChords(form.content) && (
                <Button size="xs" variant="outline" onClick={alignChords}>
                  Move chords above the lyrics
                </Button>
              )}
            </HStack>
          </Flex>
          <Text fontSize="xs" color="gray.600" mb={3}>
            Write chords on their own line above the lyric — each one lands on whatever it sits
            over. Inline <code>[G]Amazing</code> still works, and the two can be mixed. Mark
            sections with <code>{'{Verse 1}'}</code>, and wrap a cue in asterisks —{' '}
            <code>*hold*</code> — to show it in red anywhere on a chord row, in a lyric, or on a
            line of its own.{' '}
            {form.key ? (
              <>
                Write in the key of <strong>{form.key}</strong> — everyone can transpose from there.
              </>
            ) : (
              <>
                Set the key above once you know it — until then the chart shows as written and
                nobody can transpose it.
              </>
            )}
          </Text>
          <Textarea
            className="chart-source"
            value={form.content}
            spellCheck={false}
            onChange={(e) => set('content')(e.target.value)}
            placeholder={PLACEHOLDER}
            rows={22}
            fontSize="14px"
          />
        </Box>

        <Box bg="white" p={5} borderRadius="lg" borderWidth="1px">
          <Text fontWeight="medium" mb={3}>
            Preview
          </Text>
          {form.content.trim() || noteCards.length ? (
            <>
              <NoteCardList cards={previewNotes.general} />
              <Box mt={previewNotes.general.length ? 3 : 0}>
                <ChordChart
                  content={form.content}
                  fromKey={form.key}
                  toKey={form.key}
                  sectionNotes={previewNotes.bySection}
                />
              </Box>
            </>
          ) : (
            <Text color="gray.500" fontSize="sm">
              Your chart appears here as you type.
            </Text>
          )}
        </Box>
      </Grid>
    </Stack>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Box>
      <Text fontSize="sm" fontWeight="medium" color="gray.700" mb={1}>
        {label}
      </Text>
      {children}
    </Box>
  );
}

function Select({
  value,
  onChange,
  options,
  emptyLabel = '—',
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  /** Label for the '' option, when blank needs to read as more than a dash. */
  emptyLabel?: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{
        width: '100%',
        padding: '8px 10px',
        borderRadius: 6,
        border: '1px solid #E2E8F0',
        background: 'white',
      }}
    >
      {options.map((opt) => (
        <option key={opt} value={opt}>
          {opt || emptyLabel}
        </option>
      ))}
    </select>
  );
}
