import { Box, Text } from '@chakra-ui/react';
import { useMemo } from 'react';
import { parseSong, transposeSong, type Line } from '@/lib/chordpro';
import { sectionKey } from '@/lib/noteColors';
import { NoteCardList } from '@/components/NoteCardView';
import type { NoteCard } from '@/types';

interface Props {
  content: string;
  /** The key the stored content is written in. */
  fromKey: string;
  /** The key to display in. Equal to fromKey means no transposition. */
  toKey: string;
  fontSize?: number;
  showChords?: boolean;
  /** Note cards keyed by section (via sectionKey). Rendered under the first
   *  occurrence of the matching section header. */
  sectionNotes?: Record<string, NoteCard[]>;
}

/**
 * Renders a chart with chords sitting above their syllables.
 *
 * Each chord+lyric pair is an inline-block column: the chord occupies its own
 * line above the lyric, so nothing reflows when a chord name gets wider (G ->
 * F#m7). Column-per-syllable is what keeps alignment correct across wrapping,
 * which a whitespace-padded monospace approach can't do.
 */
export default function ChordChart({
  content, fromKey, toKey, fontSize = 15, showChords = true, sectionNotes,
}: Props) {
  const song = useMemo(
    () => transposeSong(parseSong(content), fromKey, toKey),
    [content, fromKey, toKey],
  );

  // A section's notes render under its first appearance only, so a chart that
  // repeats "{Chorus}" doesn't stamp the same note three times.
  const shown = new Set<string>();

  return (
    <Box className="chart" fontSize={`${fontSize}px`} lineHeight="1.35">
      {song.lines.map((line, i) => {
        const out = [<ChartLine key={i} line={line} showChords={showChords} />];
        if (line.type === 'section' && sectionNotes) {
          const k = sectionKey(line.name);
          if (!shown.has(k) && sectionNotes[k]?.length) {
            shown.add(k);
            out.push(
              <Box key={`notes-${i}`} my={2}>
                <NoteCardList cards={sectionNotes[k]} />
              </Box>,
            );
          }
        }
        return out;
      })}
    </Box>
  );
}

function ChartLine({ line, showChords }: { line: Line; showChords: boolean }) {
  switch (line.type) {
    case 'blank':
      return <Box height="0.9em" />;

    case 'section':
      return (
        <Text
          mt={4}
          mb={1}
          fontWeight="bold"
          textTransform="uppercase"
          letterSpacing="wider"
          fontSize="0.8em"
          color="blue.600"
        >
          {line.name}
        </Text>
      );

    case 'chords':
      if (!showChords) return null;
      return (
        <Box mb={1} fontWeight="bold" color="blue.600">
          {line.chords.join('   ')}
        </Box>
      );

    case 'lyrics':
      return (
        <Box whiteSpace="pre-wrap" mb={showChords ? 1 : 0}>
          {line.pairs.map((pair, i) => (
            <Box key={i} display="inline-block" verticalAlign="bottom" whiteSpace="pre">
              {showChords && (
                <Box height="1.3em" fontWeight="bold" color="blue.600" pr={pair.chord ? 2 : 0}>
                  {pair.chord}
                </Box>
              )}
              <Box>{pair.lyric}</Box>
            </Box>
          ))}
        </Box>
      );
  }
}
