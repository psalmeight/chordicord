import { Box, Text } from '@chakra-ui/react';
import { Fragment, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  isMarked, lyricRuns, markRuns, parseSong, punctRuns, transposeSong,
  type HeadingLevel, type Line,
} from '@/lib/chordpro';
import { sectionKey } from '@/lib/noteColors';
import { NoteCardList } from '@/components/NoteCardView';
import type { NoteCard } from '@/types';

/** An author's note, wherever it turns up — chord row, lyric or its own line.
 *  Red, bold and italic so it never reads as something to play or sing. */
const NOTE_STYLE = { color: 'red.600', fontStyle: 'italic', fontWeight: 'bold' } as const;

/** ^^A cue^^ that has to be caught mid-song. The pulse itself lives in CSS so
 *  print, and anyone who has asked for less motion, can switch it off. */
const BLINK_STYLE = { color: 'red.600', fontWeight: 'bold', className: 'chart-blink' } as const;

/** How the author marked this text up, if at all. */
const markStyle = (m: { note?: boolean; blink?: boolean }) =>
  m.blink ? BLINK_STYLE : m.note ? NOTE_STYLE : null;

/** "##" through "####", relative to the chart's own size so they scale with
 *  the reader's font setting. */
const HEADING_SIZES: Record<HeadingLevel, string> = { 2: '1.5em', 3: '1.25em', 4: '1.08em' };

/** How far back structural punctuation sits — bars, dashes and brackets frame
 *  the chart without being part of it, so they read as scaffolding. */
const PUNCT_OPACITY = 0.5;

/** Text with its punctuation faded. Inline spans only, so nothing shifts: the
 *  chart's width measurement and every chord column stay exactly where they
 *  were. */
function Faded({ text }: { text: string }) {
  return (
    <>
      {punctRuns(text).map((run, i) =>
        run.punct ? (
          <Box as="span" key={i} opacity={PUNCT_OPACITY}>
            {run.text}
          </Box>
        ) : (
          <Fragment key={i}>{run.text}</Fragment>
        ),
      )}
    </>
  );
}

/**
 * A chord slot's text: anything marked inside it styled, punctuation faded.
 *
 * Most slots hold one chord and arrive with their marks already resolved. A
 * bracketed bar phrase — "[| D | ^^G^^ |]" — arrives whole, carets and all, so
 * the marks in it are found here instead.
 */
function SlotText({ text }: { text: string }) {
  return (
    <>
      {markRuns(text).map((run, i) =>
        isMarked(run) ? (
          <Box as="span" key={i} {...markStyle(run)}>
            {run.text}
          </Box>
        ) : (
          <Faded key={i} text={run.text} />
        ),
      )}
    </>
  );
}

/** Chart line height, shared so an empty lyric row can be held to exactly the
 *  height a line of text would have taken. */
const LINE_HEIGHT = 1.35;

/** Space between the two columns when the chart splits. */
const COLUMN_GAP = '2.5rem';

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
  /** How many columns to flow the chart into. 2 still falls back to a single
   *  column whenever two full-width columns don't fit. Defaults to 1. */
  columns?: number;
}

/**
 * Renders a chart with chords sitting above their syllables.
 *
 * Each chord+lyric pair is an inline-block column: the chord occupies its own
 * line above the lyric, so nothing reflows when a chord name gets wider (G ->
 * F#m7).
 *
 * Lines never soft-wrap: the chart renders at its natural width (the longest
 * line) so chord positioning and lyric width are exactly as written. That
 * width, measured live, drives the layout — a chart set to two columns flows
 * into two only when the container fits both side by side, and on anything
 * narrower it falls back to one (scrolling sideways if even one column
 * doesn't fit, rather than ever wrapping a line).
 */
export default function ChordChart({
  content, fromKey, toKey, fontSize = 15, showChords = true, sectionNotes, columns = 1,
}: Props) {
  const song = useMemo(
    () => transposeSong(parseSong(content), fromKey, toKey),
    [content, fromKey, toKey],
  );

  // A chords line and the lyric line under it — and a section header and its
  // note cards — render as one unbreakable block, so a column break can never
  // strand chords at the foot of one column with their lyrics atop the next.
  const blocks = useMemo(() => {
    const out: Line[][] = [];
    for (let i = 0; i < song.lines.length; i++) {
      const line = song.lines[i];
      const next = song.lines[i + 1];
      if (line.type === 'chords' && next?.type === 'lyrics') {
        out.push([line, next]);
        i++;
      } else {
        out.push([line]);
      }
    }
    return out;
  }, [song]);

  // The natural width of the longest line, kept current by a ResizeObserver —
  // it moves when the font size changes and again when a chart font finishes
  // loading. Read from the FIRST fragment rect, never getBoundingClientRect:
  // once the chart is in two columns the wrapper is fragmented across both,
  // and the bounding rect is their union (~double the true width). Feeding
  // that back in collapses the columns, which re-measures narrow, which
  // splits them again — an endless flicker. A single fragment always has the
  // wrapper's real max-content width, in one column or two.
  const innerRef = useRef<HTMLDivElement>(null);
  const [lineWidth, setLineWidth] = useState(0);
  useLayoutEffect(() => {
    const el = innerRef.current;
    if (!el) return;
    const measure = () => {
      const rect = el.getClientRects()[0];
      if (rect) setLineWidth(Math.ceil(rect.width));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // A section's notes render under its first appearance only, so a chart that
  // repeats "{Chorus}" doesn't stamp the same note three times.
  const shown = new Set<string>();

  return (
    <Box
      className="chart"
      fontSize={`${fontSize}px`}
      lineHeight={LINE_HEIGHT}
      overflowX="auto"
      style={
        columns === 2 && lineWidth > 0
          ? { columnCount: 2, columnWidth: `${lineWidth}px`, columnGap: COLUMN_GAP }
          : undefined
      }
    >
      <Box ref={innerRef} width="max-content" maxWidth="none">
        {blocks.map((block, i) => {
          const section = block[0].type === 'section' ? block[0] : null;
          let notes: NoteCard[] | null = null;
          if (section && sectionNotes) {
            const k = sectionKey(section.name);
            if (!shown.has(k) && sectionNotes[k]?.length) {
              shown.add(k);
              notes = sectionNotes[k];
            }
          }
          return (
            <Box key={i} style={{ breakInside: 'avoid' }}>
              {block.map((line, j) => (
                <ChartLine key={j} line={line} showChords={showChords} />
              ))}
              {notes && (
                // width 0 + minWidth 100%: the cards span the chart without
                // their text counting towards the max-content measurement —
                // otherwise a wordy note would widen every column.
                <Box my={2} width="0" minWidth="100%">
                  <NoteCardList cards={notes} />
                </Box>
              )}
            </Box>
          );
        })}
      </Box>
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

    case 'heading':
      // "##" down to "####" — oversized lines for titles and callouts. Even
      // the smallest still outranks a lyric, or it would say nothing.
      return (
        <Text mt={2} mb={1} fontWeight="bold" fontSize={HEADING_SIZES[line.level]}>
          {line.text}
        </Text>
      );

    case 'chords':
      if (!showChords) return null;
      return (
        <Box mb={1} fontWeight="bold" color="blue.600">
          {line.chords.map((token, i) => (
            <Box as="span" key={i} pr={3} {...markStyle(token)}>
              {/* A note is prose — its own brackets are part of what it says. */}
              {token.note ? token.text : <SlotText text={token.text} />}
            </Box>
          ))}
        </Box>
      );

    case 'lyrics': {
      const runs = lyricRuns(line.pairs);
      // A line with no chords at all gets no chord row: reserving the empty
      // slot anyway pushes chord-less lyrics a full line away from whatever
      // sits above them (a bar chart, a section header). The PDF renderer
      // makes the same call in drawCellRow. Every lyric line still keeps a
      // small bottom margin so the next chord row never sits flush under it.
      const anyChord = line.pairs.some((p) => p.chord);
      return (
        <Box whiteSpace="pre-wrap" mb={showChords ? 1.5 : 0}>
          {line.pairs.map((pair, i) => (
            <Box key={i} display="inline-block" verticalAlign="bottom" whiteSpace="pre">
              {showChords && anyChord && (
                <Box
                  height="1.3em"
                  fontWeight="bold"
                  color="blue.600"
                  pr={pair.chord ? 2 : 0}
                  {...markStyle(pair)}
                >
                  {pair.note ? pair.chord : <SlotText text={pair.chord} />}
                </Box>
              )}
              {/* A chord past the end of the lyric has nothing under it. The
                  empty row still has to stand a full line tall, or bottom
                  alignment drops that column's chord down beside the lyrics. */}
              <Box minHeight={`${LINE_HEIGHT}em`}>
                {runs[i].map((run, j) =>
                  run.note ? (
                    <Box as="span" key={j} {...markStyle(run)}>
                      {run.text}
                    </Box>
                  ) : (
                    <Faded key={j} text={run.text} />
                  ),
                )}
              </Box>
            </Box>
          ))}
        </Box>
      );
    }
  }
}
