/**
 * ChordPro-style parser.
 *
 * Body format:
 *   {Verse 1}            section header (a bare "Verse 1:" line works too)
 *   [G]Amazing [C]grace  inline chords, anchored to the syllable after them
 *   | G | C | D |        a chord-only line, rendered as-is
 *   # a comment          ignored
 */

import { transposeChordToKey } from './chords';

export interface ChordPair {
  chord: string; // '' when the lyric has no chord above it
  lyric: string;
}

export type Line =
  | { type: 'section'; name: string }
  | { type: 'lyrics'; pairs: ChordPair[] }
  | { type: 'chords'; chords: string[] }
  | { type: 'blank' };

export interface ParsedSong {
  lines: Line[];
}

const SECTION_BRACE_RE = /^\{\s*(.+?)\s*\}$/;
const SECTION_COLON_RE = /^([A-Za-z][A-Za-z0-9 '’\-]{0,30}):\s*$/;
/** A line of only bar-separated chords, e.g. "| G | Em7 | C |" or "G  C  D". */
const CHORD_LINE_RE = /^[|\s]*(?:[A-G][^\s|]*[\s|]*)+$/;

type LineKind =
  | { kind: 'blank' }
  | { kind: 'comment' }
  | { kind: 'section'; name: string }
  | { kind: 'chords' }
  | { kind: 'lyrics' };

/**
 * How a single raw line should be read. Shared by the renderer and by
 * transposeContent so a key conversion rewrites exactly the tokens the
 * preview is already showing as chords — never more.
 */
function classifyLine(line: string): LineKind {
  if (!line.trim()) return { kind: 'blank' };
  if (line.trimStart().startsWith('#')) return { kind: 'comment' };

  const brace = SECTION_BRACE_RE.exec(line.trim());
  if (brace) return { kind: 'section', name: brace[1] };

  // A "Chorus:" style header, but only when it carries no chords.
  const colon = SECTION_COLON_RE.exec(line.trim());
  if (colon && !line.includes('[')) return { kind: 'section', name: colon[1] };

  // Bare chord lines (intros, turnarounds) only count when there are no
  // inline chord brackets — otherwise it's a lyric line.
  if (!line.includes('[') && CHORD_LINE_RE.test(line.trim())) return { kind: 'chords' };

  return { kind: 'lyrics' };
}

export function parseSong(content: string): ParsedSong {
  const lines: Line[] = [];

  for (const raw of content.replace(/\r\n/g, '\n').split('\n')) {
    const line = raw.trimEnd();
    const classified = classifyLine(line);

    switch (classified.kind) {
      case 'blank':
        lines.push({ type: 'blank' });
        break;
      case 'comment':
        break;
      case 'section':
        lines.push({ type: 'section', name: classified.name });
        break;
      case 'chords':
        lines.push({ type: 'chords', chords: line.split(/[\s|]+/).filter(Boolean) });
        break;
      case 'lyrics':
        lines.push({ type: 'lyrics', pairs: parseLyricLine(line) });
        break;
    }
  }

  return { lines };
}

/**
 * Splits "[G]Amazing [C]grace" into [{G, "Amazing "}, {C, "grace"}].
 * Text before the first chord becomes a pair with an empty chord, so the
 * lyric still renders in the right place.
 */
function parseLyricLine(line: string): ChordPair[] {
  const pairs: ChordPair[] = [];
  const re = /\[([^\]]*)\]/g;

  let lastIndex = 0;
  let pendingChord = '';
  let match: RegExpExecArray | null;

  while ((match = re.exec(line)) !== null) {
    const lyric = line.slice(lastIndex, match.index);
    if (lyric || pendingChord) pairs.push({ chord: pendingChord, lyric });
    pendingChord = match[1];
    lastIndex = re.lastIndex;
  }

  const tail = line.slice(lastIndex);
  if (tail || pendingChord) pairs.push({ chord: pendingChord, lyric: tail });

  return pairs;
}

/** Applies a key change to every chord in a parsed song. */
export function transposeSong(song: ParsedSong, fromKey: string, toKey: string): ParsedSong {
  if (fromKey === toKey) return song;

  return {
    lines: song.lines.map((line) => {
      if (line.type === 'lyrics') {
        return {
          ...line,
          pairs: line.pairs.map((p) => ({
            ...p,
            chord: p.chord ? transposeChordToKey(p.chord, fromKey, toKey) : '',
          })),
        };
      }
      if (line.type === 'chords') {
        return { ...line, chords: line.chords.map((ch) => transposeChordToKey(ch, fromKey, toKey)) };
      }
      return line;
    }),
  };
}

/** Every distinct chord in the song, in first-appearance order. */
export function uniqueChords(song: ParsedSong): string[] {
  const seen = new Set<string>();
  for (const line of song.lines) {
    if (line.type === 'lyrics') {
      for (const p of line.pairs) if (p.chord) seen.add(p.chord);
    } else if (line.type === 'chords') {
      for (const ch of line.chords) seen.add(ch);
    }
  }
  return [...seen];
}

/**
 * Rewrites the chords in raw ChordPro source into a new key, in place.
 *
 * Deliberately not parseSong -> transposeSong -> toChordPro: that round trip
 * drops `#` comments and reflows "| G | C |" into "G C". This edits only the
 * chord tokens and leaves every other byte — bars, spacing, comments, section
 * headers — exactly as the author wrote them.
 *
 * This is the one place transposed chords are written back to storage, so it
 * only ever runs behind an explicit confirmation.
 */
export function transposeContent(content: string, fromKey: string, toKey: string): string {
  if (!fromKey || !toKey || fromKey === toKey) return content;

  return content
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => {
      switch (classifyLine(line).kind) {
        case 'lyrics':
          return line.replace(/\[([^\]]*)\]/g, (whole, chord: string) =>
            chord ? `[${transposeChordToKey(chord, fromKey, toKey)}]` : whole,
          );
        case 'chords':
          // Token-wise so the surrounding bars and column alignment survive.
          return line.replace(/[^\s|]+/g, (token) => transposeChordToKey(token, fromKey, toKey));
        default:
          return line;
      }
    })
    .join('\n');
}

/** Whether a chart contains anything a key change would actually rewrite. */
export function hasChords(content: string): boolean {
  return uniqueChords(parseSong(content)).length > 0;
}

/** Renders back to ChordPro source — used to save a transposed copy. */
export function toChordPro(song: ParsedSong): string {
  return song.lines
    .map((line) => {
      switch (line.type) {
        case 'section':
          return `{${line.name}}`;
        case 'chords':
          return line.chords.join(' ');
        case 'lyrics':
          return line.pairs.map((p) => (p.chord ? `[${p.chord}]` : '') + p.lyric).join('');
        case 'blank':
          return '';
      }
    })
    .join('\n');
}
