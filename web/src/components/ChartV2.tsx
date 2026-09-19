import { Box, Text } from '@chakra-ui/react';
import { Fragment, useEffect, useMemo, useRef } from 'react';
import type { ReactNode } from 'react';
import { transposeContent } from '@/lib/chordpro';
import { parseChord } from '@/lib/chords';

/**
 * The v2 chart, the way Ultimate Guitar does it: plain text, chords on their
 * own line above the lyric, aligned with spaces; "N.C." for no chord, "x2"
 * for a repeat.
 *
 * Two pieces that are the same picture. ChartV2 is the view — a <pre> of the
 * text. ChartV2Editor is the editor — a <textarea> of it — and the two share
 * one set of styles (font, size, line height, no padding, no border, black
 * on white), so the chart looks the same on the page and in the form. The
 * app's ordinary Edit buttons open the form; there is no editing in the view.
 *
 * The view adds three marks — see renderLine:
 *   [anything]    drawn as-is in chord styling: "[| A | G - B |]"
 *   [###Chorus]   a heading, markdown-style: bold, sized by the hashes
 *   *text here*   bold red
 * The marks themselves are not drawn. A bare row of chords is still found
 * and coloured without any marks at all. Transposition is applied on
 * display only; the editor always holds the stored text, in the song's own
 * key.
 */

interface Props {
  /** The stored v2 text, in the song's own key. */
  value: string;
  /** The key the stored text is written in ('' when unknown). */
  fromKey: string;
  /** The key to display in. Equal to fromKey, or either blank, means as written. */
  toKey: string;
  fontSize: number;
}

/** Chart line height. Roomier than the classic chart's 1.35: with chords on
 *  their own row there's no per-row gap to add, so the leading does that job. */
const LINE_HEIGHT = 1.5;

/** The marks: a [bracketed] run, or a *starred* one. */
const MARK_RE = /\[[^\]\n]*\]|\*[^*\n]+\*/g;
/** Inside brackets, leading hashes make a heading — "[###Chorus]". */
const HEADING_RE = /^(#+)\s*(.*)$/;
/** Heading sizes by hash count, markdown's way round: fewer is bigger. */
const HEADING_SIZES = ['1.4em', '1.25em', '1.1em'];

/** A chord-row token: a chord, or "N.C." (no chord), which belongs there. */
const isChordToken = (w: string) => /^N\.?C\.?$/i.test(w) || parseChord(w) !== null;

/** A repeat count — "x2", "2x", "(x2)" — which UG allows on a chord row. It
 *  neither makes a row a chord row nor stops it being one. */
const isRowAnnotation = (w: string) => /^\(?(x\d+|\d+x)\)?$/i.test(w);

/** Chord styling — the one colour on the page. */
const Chord = ({ children }: { children: ReactNode }) => (
  <Box as="span" fontWeight="bold" color="blue.600">
    {children}
  </Box>
);

/** A bar line: scaffolding, not something played, so it sits back. */
const Bar = () => (
  <Box as="span" opacity={0.35}>
    |
  </Box>
);

/** Text with its bars faded. Inline spans only, so nothing shifts. */
function withBars(text: string): ReactNode {
  if (!text.includes('|')) return text;
  return text.split(/(\|)/).map((p, i) => (p === '|' ? <Bar key={i} /> : <Fragment key={i}>{p}</Fragment>));
}

/** A [bracketed] run: a heading if it opens with hashes, otherwise whatever
 *  is inside, exactly as typed, in chord styling. The brackets are not drawn. */
function renderBracket(inner: string): ReactNode {
  const heading = HEADING_RE.exec(inner);
  if (heading) {
    const [, hashes, text] = heading;
    return (
      <Box as="span" fontWeight="bold" fontSize={HEADING_SIZES[hashes.length - 1] ?? '1em'}>
        {text}
      </Box>
    );
  }
  return <Chord>{withBars(inner)}</Chord>;
}

/** The chords on a bare chord row, each coloured; whitespace, bars and repeat
 *  counts left as they are, so nothing is re-spaced. */
function renderChordRow(text: string): ReactNode {
  return text
    .split(/(\s+|\|)/)
    .filter((p) => p !== '')
    .map((p, i) =>
      p === '|' ? (
        <Bar key={i} />
      ) : /^\s+$/.test(p) || isRowAnnotation(p) ? (
        <Fragment key={i}>{p}</Fragment>
      ) : (
        <Chord key={i}>{p}</Chord>
      ),
    );
}

/**
 * A line as the view draws it. The marks are found first — [brackets] and
 * *stars* — and drawn as described at the top; what's left between them is
 * plain text, unless the line's plain words are all chords (bars and repeat
 * counts allowed), in which case it's a chord row and each chord is coloured.
 */
function renderLine(line: string): ReactNode {
  const segments: { mark: boolean; text: string }[] = [];
  let last = 0;
  for (const m of line.matchAll(MARK_RE)) {
    if (m.index! > last) segments.push({ mark: false, text: line.slice(last, m.index) });
    segments.push({ mark: true, text: m[0] });
    last = m.index! + m[0].length;
  }
  if (last < line.length) segments.push({ mark: false, text: line.slice(last) });

  const words = segments
    .filter((seg) => !seg.mark)
    .flatMap((seg) => seg.text.split(/\s+|\|/))
    .filter((w) => w !== '' && !isRowAnnotation(w));
  const isChordRow = words.length > 0 && words.every(isChordToken);

  return segments.map((seg, i) => {
    if (seg.mark && seg.text.startsWith('[')) {
      return <Fragment key={i}>{renderBracket(seg.text.slice(1, -1))}</Fragment>;
    }
    if (seg.mark) {
      return (
        <Box as="span" key={i} fontWeight="bold" color="red.600">
          {seg.text.slice(1, -1)}
        </Box>
      );
    }
    return <Fragment key={i}>{isChordRow ? renderChordRow(seg.text) : withBars(seg.text)}</Fragment>;
  });
}

/** Everything typographic, shared by the view and the editor: this list is
 *  what makes them the same picture. Neither paints a background of its own —
 *  the panel around them does — so the two can't differ by a shade, and
 *  `appearance: none` stops iOS drawing its own inset field. */
const chartStyleFor = (fontSize: number) => ({
  fontSize: `${fontSize}px`,
  lineHeight: LINE_HEIGHT,
  color: 'black',
  background: 'transparent',
  whiteSpace: 'pre' as const,
  margin: 0,
  padding: 0,
  border: 'none',
  outline: 'none',
  boxShadow: 'none',
  appearance: 'none' as const,
  WebkitAppearance: 'none' as const,
  borderRadius: 0,
  width: '100%',
  display: 'block',
  overflowX: 'auto' as const,
});

/** The view alone — the chart drawn from text, no editing. ChartV2 uses it,
 *  and so does the guide, so an example there is drawn by the real thing. */
export function ChartV2Text({ text, fontSize }: { text: string; fontSize: number }) {
  return (
    <Box as="pre" className="chart-source" style={chartStyleFor(fontSize)}>
      {text.split('\n').map((line, i) => (
        <Fragment key={i}>
          {i > 0 && '\n'}
          {renderLine(line)}
        </Fragment>
      ))}
    </Box>
  );
}

/** The view: the chart drawn from its stored text, transposed for display
 *  if a key was picked. */
export default function ChartV2({ value, fromKey, toKey, fontSize }: Props) {
  const shown = useMemo(
    () => (fromKey && toKey ? transposeContent(value, fromKey, toKey) : value),
    [value, fromKey, toKey],
  );
  if (!shown.trim()) return <Text color="gray.500">No lyrics or chords yet.</Text>;
  return <ChartV2Text text={shown} fontSize={fontSize} />;
}

/**
 * The editor: the same text in a <textarea> drawn exactly like the view,
 * for the song and setlist-item forms. It grows with its text rather than
 * scrolling inside itself, so the form scrolls the same way the page does.
 */
export function ChartV2Editor({
  value,
  onChange,
  fontSize,
}: {
  value: string;
  onChange: (text: string) => void;
  fontSize: number;
}) {
  const areaRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [value, fontSize]);

  return (
    <Box bg="white">
      <textarea
        ref={areaRef}
        className="chart-source"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
        wrap="off"
        placeholder={'[###Verse 1]\n      G          C\nAmazing grace how sweet the sound'}
        style={{ ...chartStyleFor(fontSize), resize: 'none', overflowY: 'hidden', minHeight: '8em' }}
      />
    </Box>
  );
}
