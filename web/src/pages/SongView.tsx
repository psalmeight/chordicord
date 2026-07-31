import {
  Badge, Box, Button, Flex, HStack, Heading, Spinner, Stack, Text,
} from '@chakra-ui/react';
import { ArrowLeft, Gauge, Minus, Pencil, Plus, Printer } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import api, { apiError } from '@/lib/api';
import { canEdit } from '@/lib/auth';
import { capoKey } from '@/lib/chords';
import { useApp } from '@/contexts/AppContext';
import { useMetronome } from '@/contexts/MetronomeContext';
import AudioPlayer from '@/components/AudioPlayer';
import AudioUpload from '@/components/AudioUpload';
import ChordChart from '@/components/ChordChart';
import KeySelector from '@/components/KeySelector';
import { NoteCardList } from '@/components/NoteCardView';
import { groupNotes } from '@/lib/noteColors';
import type { NoteCard, Song } from '@/types';

export default function SongView() {
  const { id } = useParams();
  const { user } = useApp();
  const { playAt } = useMetronome();
  const [song, setSong] = useState<Song | null>(null);
  const [error, setError] = useState('');

  // View state, all local and non-destructive — nothing here is ever saved.
  const [displayKey, setDisplayKey] = useState('');
  const [capo, setCapo] = useState(0);
  const [fontSize, setFontSize] = useState(15);
  const [showChords, setShowChords] = useState(true);
  const [hasAudio, setHasAudio] = useState(false);
  // Bumped on upload so the player remounts and pulls a fresh signed URL.
  const [audioVersion, setAudioVersion] = useState(0);

  useEffect(() => {
    api
      .get<Song>(`/api/songs/${id}`)
      .then(({ data }) => {
        setSong(data);
        setDisplayKey(data.key ?? '');
        setHasAudio(data.hasAudio);
      })
      .catch((err) => setError(apiError(err, 'Could not load song')));
  }, [id]);

  if (error) return <Text color="red.600">{error}</Text>;
  if (!song) return <Spinner />;

  // Everything below is a delta from the song's own key. Without one there is
  // no anchor to measure from, so transposition stays off entirely rather than
  // guessing at C and shifting the chart and the recording by a real interval.
  const hasKey = Boolean(song.key);

  // With a capo on, the chart shows the shapes being fingered, not the
  // sounding key — that's what a guitarist needs to read.
  const chartKey = capo ? capoKey(displayKey, capo) : displayKey;

  // Note cards: a general list at the top and the rest anchored to sections.
  // Falls back to the legacy single notes field for any song not yet migrated.
  const cards: NoteCard[] =
    song.noteCards?.length
      ? song.noteCards
      : song.notes
        ? [{ color: 'amber', text: song.notes, section: '' }]
        : [];
  const notes = groupNotes(cards);

  // The reference track carries its own pitch control and is not driven from
  // here: the key describes the chart, which the recording may not match.

  return (
    <Stack gap={4}>
      <Flex justify="space-between" align="start" gap={3} wrap="wrap" className="no-print">
        <Link to="/">
          <Button size="sm" variant="ghost">
            <ArrowLeft size={16} />
            <Text ml={1}>Songs</Text>
          </Button>
        </Link>
        <HStack gap={2}>
          <Button size="sm" variant="outline" onClick={() => window.print()}>
            <Printer size={16} />
          </Button>
          {canEdit(user) && (
            <Link to={`/songs/${song.id}/edit`}>
              <Button size="sm" colorPalette="brand">
                <Pencil size={16} />
                <Text ml={1}>Edit</Text>
              </Button>
            </Link>
          )}
        </HStack>
      </Flex>

      <Box bg="white" p={6} borderRadius="lg" borderWidth="1px">
        <Heading size="xl">{song.title}</Heading>
        {song.artist && <Text color="gray.600">{song.artist}</Text>}

        <HStack gap={4} mt={3} fontSize="sm" color="gray.700" wrap="wrap">
          {hasKey ? (
            <Badge colorPalette="brand">Key of {song.key}</Badge>
          ) : (
            <Badge colorPalette="gray" variant="outline">Key not set</Badge>
          )}
          <Text>{song.timeSignature}</Text>
          {song.tempo && <Text>{song.tempo} bpm</Text>}
          {song.feel && <Text>Feel: {song.feel}</Text>}
          {song.ccli && <Text>CCLI {song.ccli}</Text>}
        </HStack>

        {song.tags.length > 0 && (
          <HStack gap={2} mt={3} wrap="wrap">
            {song.tags.map((tag) => (
              <Badge key={tag} variant="outline">
                {tag}
              </Badge>
            ))}
          </HStack>
        )}

        <NoteCardList cards={notes.general} mt={4} />
      </Box>

      {/* Transpose controls */}
      <Box bg="white" p={4} borderRadius="lg" borderWidth="1px" className="no-print">
        <Flex gap={5} wrap="wrap" align="center">
          {hasKey && (
            <>
              <HStack gap={3}>
                <Text fontSize="sm" fontWeight="medium" color="gray.600">
                  Key
                </Text>
                <KeySelector originalKey={song.key!} value={displayKey} onChange={setDisplayKey} />
              </HStack>

              <HStack gap={2}>
                <Text fontSize="sm" fontWeight="medium" color="gray.600">
                  Capo
                </Text>
                <select
                  value={capo}
                  onChange={(e) => setCapo(Number(e.target.value))}
                  style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid var(--line-2)' }}
                >
                  <option value={0}>None</option>
                  {Array.from({ length: 11 }, (_, i) => i + 1).map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </HStack>
            </>
          )}

          <HStack gap={1}>
            <Text fontSize="sm" fontWeight="medium" color="gray.600" mr={1}>
              Size
            </Text>
            <Button size="xs" variant="outline" onClick={() => setFontSize((s) => Math.max(11, s - 1))}>
              <Minus size={12} />
            </Button>
            <Button size="xs" variant="outline" onClick={() => setFontSize((s) => Math.min(28, s + 1))}>
              <Plus size={12} />
            </Button>
          </HStack>

          <Button size="sm" variant={showChords ? 'subtle' : 'outline'} onClick={() => setShowChords((v) => !v)}>
            {showChords ? 'Hide chords' : 'Show chords'}
          </Button>

          {song.tempo && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => playAt(song.tempo!, Number(song.timeSignature.split('/')[0]) || undefined)}
              title="Start the metronome at this song's tempo"
            >
              <Gauge size={14} />
              <Text ml={1}>Metronome {song.tempo}</Text>
            </Button>
          )}
        </Flex>

        {hasKey && capo > 0 && (
          <Text fontSize="sm" color="gray.600" mt={3}>
            Capo {capo} — play <strong>{chartKey}</strong> shapes, sounds in <strong>{displayKey}</strong>.
          </Text>
        )}

        {!hasKey && (
          <Text fontSize="sm" color="gray.600" mt={3}>
            This song has no key set, so the chart shows exactly as written and the reference track
            plays at its original pitch.{' '}
            {canEdit(user) ? (
              <Link to={`/songs/${song.id}/edit`}>
                <Text as="span" color="brand.600" textDecoration="underline">
                  Set the key
                </Text>
              </Link>
            ) : (
              'Ask a leader to set it'
            )}{' '}
            to turn on transposing and capo.
          </Text>
        )}
      </Box>

      {/* Reference track. Its pitch offset is a saved, chart-independent tune. */}
      {(hasAudio || canEdit(user)) && (
        <Box bg="white" p={4} borderRadius="lg" borderWidth="1px" className="no-print">
          {hasAudio ? (
            <Stack gap={3}>
              <AudioPlayer
                key={`${song.id}-${audioVersion}`}
                songId={song.id}
                canEdit={canEdit(user)}
                onRemoved={() => setHasAudio(false)}
                onSaveTune={async (semitones) => {
                  await api.patch(`/api/songs/${song.id}/audio`, { tuneOffset: semitones });
                }}
              />
              {canEdit(user) && (
                <AudioUpload
                  songId={song.id}
                  hasExisting
                  onUploaded={() => setAudioVersion((v) => v + 1)}
                />
              )}
            </Stack>
          ) : (
            <AudioUpload
              songId={song.id}
              hasExisting={false}
              onUploaded={() => {
                setHasAudio(true);
                setAudioVersion((v) => v + 1);
              }}
            />
          )}
        </Box>
      )}

      <Box bg="white" p={6} borderRadius="lg" borderWidth="1px">
        {song.content.trim() ? (
          <ChordChart
            content={song.content}
            fromKey={song.key ?? ''}
            toKey={hasKey ? chartKey : ''}
            fontSize={fontSize}
            showChords={showChords}
            sectionNotes={notes.bySection}
          />
        ) : (
          <Text color="gray.500">No lyrics or chords yet.</Text>
        )}
      </Box>
    </Stack>
  );
}
