import { Badge, Box, Button, Flex, HStack, Spinner, Stack, Text } from '@chakra-ui/react';
import { ArrowLeft, Columns2, Eye, EyeOff, FileDown, Gauge, Pencil, Printer } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import api, { apiError } from '@/lib/api';
import { canEdit } from '@/lib/auth';
import { capoKey, keyOptions } from '@/lib/chords';
import { useChartFontSize } from '@/lib/useChartFontSize';
import { useEditorV2 } from '@/lib/useEditorV2';
import { toV2Draft } from '@/lib/v2draft';
import type { PdfSong } from '@/lib/pdf';
import { useApp } from '@/contexts/AppContext';
import { useMetronome } from '@/contexts/MetronomeContext';
import ArchivedBanner from '@/components/ArchivedBanner';
import AudioPlayer from '@/components/AudioPlayer';
import AudioUpload from '@/components/AudioUpload';
import AutoScrollWidget from '@/components/AutoScrollWidget';
import ChartV2 from '@/components/ChartV2';
import ChordChart from '@/components/ChordChart';
import { CAPO_OPTIONS, Select } from '@/components/FormControls';
import { NoteCardList } from '@/components/NoteCardView';
import { OptionButton, OptionDivider, OptionRow, OptionsMenu } from '@/components/OptionsMenu';
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
  // The one exception: the chart size, set once for every chart from the
  // header and remembered on the device.
  const [fontSize] = useChartFontSize();
  // The v2 chart, app-wide from the header. See ChartV2.
  const [v2] = useEditorV2();
  const [showChords, setShowChords] = useState(true);
  const [hasAudio, setHasAudio] = useState(false);
  // Bumped on upload so the player remounts and pulls a fresh signed URL.
  const [audioVersion, setAudioVersion] = useState(0);
  const [pdfBusy, setPdfBusy] = useState(false);

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

  // The file is a copy of what's on screen — chosen key, capo, size and chord
  // visibility all carry through.
  const pdfSong = (): PdfSong => ({
    title: song.title,
    artist: song.artist,
    fromKey: song.key ?? '',
    toKey: hasKey ? chartKey : '',
    soundingKey: displayKey,
    capo,
    timeSignature: song.timeSignature,
    tempo: song.tempo,
    feel: song.feel,
    ccli: song.ccli,
    content: song.content,
    noteCards: cards,
    fontSize: fontSize * 0.75,
    showChords,
    columns: song.chartColumns,
  });

  // Print and download build the same document — the printer gets the file,
  // not the page — so a chart reads the same however it left the app. The
  // renderer carries a typesetting library with it, so it is pulled in on the
  // first press rather than up front.
  const runPdf = async (action: 'save' | 'print') => {
    setPdfBusy(true);
    try {
      const pdf = await import('@/lib/pdf');
      if (action === 'save') pdf.downloadSongPdf(pdfSong());
      else pdf.printSongPdf(pdfSong());
    } catch (err) {
      setError(apiError(err, 'Could not build the PDF'));
    } finally {
      setPdfBusy(false);
    }
  };

  // The one control on this page that writes anything. Every other setting
  // here — key, capo, size, chords on or off — is how *you* are reading the
  // chart right now, and dies with the page. The column count is a property of
  // the chart itself: it belongs to the song, everyone gets it, and it saves on
  // the press, the same as the copy of this control on a setlist.
  const setColumns = async (columns: number) => {
    setSong((s) => (s ? { ...s, chartColumns: columns } : s));
    await api.patch(`/api/songs/${id}`, { chartColumns: columns });
  };

  // The v2 text, or — until the song has been saved in v2 — a draft laid out
  // from the classic chart, so a song never shows blank. Nothing is written
  // by the view; the editor does that.
  const v2Text = song?.contentV2 || toV2Draft(song?.content ?? '');

  // An archived song still opens (setlists link here), so offer the way back
  // in place rather than sending the editor off to the Archive page.
  const restore = async () => {
    try {
      const { data } = await api.post<Song>(`/api/songs/${id}/restore`);
      setSong(data);
    } catch (err) {
      setError(apiError(err, 'Could not restore song'));
    }
  };

  // The reference track carries its own pitch control and is not driven from
  // here: the key describes the chart, which the recording may not match.

  const transposed = hasKey && displayKey !== song.key;

  return (
    <Stack gap={4}>
      <Flex justify="space-between" align="center" wrap="wrap" gap={3} className="no-print">
        <Link to="/">
          <Button size="sm" variant="ghost">
            <ArrowLeft size={16} />
            <Text ml={1}>Songs</Text>
          </Button>
        </Link>
        <HStack gap={2}>
          <Button
            size="sm"
            variant="outline"
            loading={pdfBusy}
            onClick={() => runPdf('print')}
            title="Print this chart"
          >
            <Printer size={16} />
          </Button>
          {/* The same document the print button sends to the printer: the
              chosen key, capo, size and chord visibility all carry through. */}
          <Button
            size="sm"
            variant="outline"
            loading={pdfBusy}
            onClick={() => runPdf('save')}
            title="Download this chart as a PDF"
          >
            <FileDown size={16} />
            <Text ml={1}>PDF</Text>
          </Button>
        </HStack>
      </Flex>

      {song.archivedAt && (
        <ArchivedBanner
          what="song"
          archivedAt={song.archivedAt}
          onRestore={canEdit(user) ? restore : undefined}
        />
      )}

      {/* One card in the shape of a setlist item, so a song reads the same
          wherever it appears: title | key | time on one line, details under
          it, Edit and Options on the right, then the track and the chart. */}
      <Box bg="white" p={5} borderRadius="lg" borderWidth="1px">
        <Flex justify="space-between" align="start" gap={3} wrap="wrap">
          <Box>
            <HStack gap={2} wrap="wrap" fontSize="lg">
              <Text fontWeight="bold">{song.title}</Text>
              <Text color="gray.300" aria-hidden>|</Text>
              {hasKey ? (
                <Text fontWeight="semibold" color="brand.600">{displayKey}</Text>
              ) : (
                <Text color="gray.400">No key</Text>
              )}
              <Text color="gray.300" aria-hidden>|</Text>
              <Text color="gray.700">{song.timeSignature}</Text>
            </HStack>
            <HStack gap={3} fontSize="sm" color="gray.600" mt={1} wrap="wrap">
              {song.artist && <Text>{song.artist}</Text>}
              {hasKey && capo > 0 && (
                <Badge colorPalette="yellow" title="Capo — only on this screen">
                  Capo {capo}
                </Badge>
              )}
              {song.tempo && <Text>{song.tempo} bpm</Text>}
              {song.feel && <Text>{song.feel}</Text>}
              {song.ccli && <Text>CCLI {song.ccli}</Text>}
              {transposed && <Badge colorPalette="orange">from {song.key}</Badge>}
              {song.tags.map((tag) => (
                <Badge key={tag} variant="outline">
                  {tag}
                </Badge>
              ))}
            </HStack>
          </Box>

          <HStack gap={2} className="no-print">
            {canEdit(user) && (
              <Link to={`/songs/${song.id}/edit`}>
                <Button size="xs" variant="outline">
                  <Pencil size={14} />
                  <Text ml={1}>Edit</Text>
                </Button>
              </Link>
            )}
            {/* Saved to the song, so only for those who may change it, and
                only where there's a chart to lay out. */}
            {canEdit(user) && (v2 ? v2Text : song.content).trim() && (
              <Button
                size="xs"
                variant={song.chartColumns === 2 ? 'subtle' : 'outline'}
                colorPalette={song.chartColumns === 2 ? 'brand' : 'gray'}
                onClick={() => setColumns(song.chartColumns === 2 ? 1 : 2)}
                title={
                  song.chartColumns === 2
                    ? 'Two columns, saved to the song — click for one. Narrow screens show one either way.'
                    : 'One column, saved to the song — click to split the chart into two.'
                }
              >
                <Columns2 size={14} />
                <Text ml={1}>{song.chartColumns === 2 ? '2 columns' : '1 column'}</Text>
              </Button>
            )}
            <OptionsMenu>
              {hasKey ? (
                <>
                  <OptionRow label="Key" hint="Only on this screen">
                    <Select
                      value={displayKey}
                      onChange={setDisplayKey}
                      options={keyOptions(song.key!).map((opt) => ({ value: opt.key, label: opt.label }))}
                      size="sm"
                      triggerProps={{ fontWeight: 'semibold' }}
                    />
                  </OptionRow>
                  <OptionRow label="Capo" hint="Only on this screen">
                    <Select
                      value={String(capo)}
                      onChange={(v) => setCapo(Number(v))}
                      options={CAPO_OPTIONS.map((o) => ({
                        value: o.value,
                        label: o.value === '0' ? 'No capo' : `Capo ${o.value}`,
                      }))}
                      size="sm"
                    />
                  </OptionRow>
                  <OptionDivider />
                </>
              ) : null}

              {song.tempo && (
                <OptionButton
                  icon={<Gauge size={16} />}
                  onClick={() => playAt(song.tempo!, Number(song.timeSignature.split('/')[0]) || undefined)}
                >
                  Metronome at {song.tempo}
                </OptionButton>
              )}

              {/* The v2 chart is plain text: chords can't be hidden and it has
                  no column layout, so those two step aside for it. */}
              {!v2 && (
                <OptionButton
                  icon={showChords ? <EyeOff size={16} /> : <Eye size={16} />}
                  onClick={() => setShowChords((v) => !v)}
                >
                  {showChords ? 'Hide chords' : 'Show chords'}
                </OptionButton>
              )}
            </OptionsMenu>
          </HStack>
        </Flex>

        {hasKey && capo > 0 && (
          <Text fontSize="sm" color="gray.600" mt={2} className="no-print">
            Capo {capo} — play <strong>{chartKey}</strong> shapes, sounds in <strong>{displayKey}</strong>.
          </Text>
        )}

        {!hasKey && (
          <Text fontSize="sm" color="gray.600" mt={2} className="no-print">
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

        {/* Reference track. Pitch here is preview-only — the saved, shared
            tune belongs to each setlist item, not the songbank recording. */}
        {(hasAudio || canEdit(user)) && (
          <Box mt={3} pt={3} borderTopWidth="1px" className="no-print">
            <Stack gap={3}>
              {hasAudio && (
                <AudioPlayer
                  key={`${song.id}-${audioVersion}`}
                  songId={song.id}
                  canEdit={canEdit(user)}
                  onRemoved={() => setHasAudio(false)}
                />
              )}
              {canEdit(user) && (
                <AudioUpload
                  songId={song.id}
                  hasExisting={hasAudio}
                  onUploaded={() => {
                    setHasAudio(true);
                    setAudioVersion((v) => v + 1);
                  }}
                />
              )}
            </Stack>
          </Box>
        )}

        {(song.content.trim() || notes.general.length > 0 || v2) && (
          <Box mt={4} pt={4} borderTopWidth="1px">
            {v2 ? (
              <ChartV2
                value={v2Text}
                fromKey={song.key ?? ''}
                toKey={hasKey ? chartKey : ''}
                fontSize={fontSize}
                columns={song.chartColumns}
              />
            ) : (
              <>
                <NoteCardList cards={notes.general} />
                <Box mt={notes.general.length ? 3 : 0}>
                  {song.content.trim() ? (
                    <ChordChart
                      content={song.content}
                      fromKey={song.key ?? ''}
                      toKey={hasKey ? chartKey : ''}
                      fontSize={fontSize}
                      showChords={showChords}
                      sectionNotes={notes.bySection}
                      columns={song.chartColumns}
                    />
                  ) : (
                    <Text color="gray.500">No lyrics or chords yet.</Text>
                  )}
                </Box>
              </>
            )}
          </Box>
        )}
      </Box>

      {/* Hands-free scrolling, as on a setlist — a long chart is a long
          chart wherever it's read from. */}
      {(song.content.trim() || v2Text.trim()) && <AutoScrollWidget />}
    </Stack>
  );
}
