/**
 * ChordPro-style parser.
 *
 * Body format:
 *   {Verse 1}            section header (a bare "Verse 1:" line works too)
 *   [G]Amazing [C]grace  inline chords, anchored to the syllable after them
 *   | G | C | D |        a chord-only line, rendered as-is
 *   # a comment          ignored
 *   ## Big text          oversized heading line ("###" for a smaller one)
 *
 * Chords may also be written on their own line above the lyric, in which case
 * each chord anchors to the column it starts at:
 *
 *       G          C            or        [G]        [C]
 *   Amazing grace how sweet           Amazing grace how sweet
 *
 * Both spellings parse to exactly the same pairs as the inline form, so a
 * chart can mix the two and everything downstream stays unaware of which was
 * typed.
 *
 * Anywhere text can go — in a lyric, on a chord row, on a line of its own —
 * *asterisks* mark an author's note, shown in red italics and never treated
 * as a chord or transposed:
 *
 *       G     *hold*     C
 *   Amazing grace *softly* how sweet
 */

import { parseChord, transposeChordToKey } from './chords';

export interface ChordPair {
  chord: string; // '' when the lyric has no chord above it
  lyric: string;
  /** The chord slot holds an author's note rather than a chord. */
  note?: boolean;
}

/** A token on a chord row: a chord, or an author's note written *like this*. */
export interface ChordToken {
  text: string;
  note: boolean;
}

/** A stretch of lyric text, flagged when it came from inside *asterisks*. */
export interface TextRun {
  text: string;
  note: boolean;
}

export type Line =
  | { type: 'section'; name: string }
  | { type: 'lyrics'; pairs: ChordPair[] }
  | { type: 'chords'; chords: ChordToken[] }
  | { type: 'heading'; text: string; level: 2 | 3 }
  | { type: 'blank' };

export interface ParsedSong {
  lines: Line[];
}

const SECTION_BRACE_RE = /^\{\s*(.+?)\s*\}$/;
const SECTION_COLON_RE = /^([A-Za-z][A-Za-z0-9 '’\-]{0,30}):\s*$/;
/** A line of only bar-separated chords, e.g. "| G | Em7 | C |" or "G  C  D".
 *  A token may open with "(" for an implied chord like "(C)". */
const CHORD_LINE_RE = /^[|\s]*(?:\(?[A-G][^\s|]*[\s|]*)+$/;
/** A line of nothing but bracketed chords, e.g. "  [G]     [C]". */
const BRACKET_LINE_RE = /^(?:\[[^\]]*\]\s*)+$/;
/** An author's note. Kept to one line so a stray asterisk can't run away with
 *  the rest of the chart. */
const NOTE_RE = /\*([^*\n]+)\*/;
/** One token on a chord row: a note, a bracketed chord, or a bare run. */
const CHORD_TOKEN_RE = /\*[^*\n]+\*|\[([^\]]*)\]|[^\s|]+/;

/** A chord row token, with the column its text starts at. */
interface Anchored extends ChordToken {
  col: number;
}

/** A fresh global copy, so a shared pattern never carries lastIndex between
 *  callers. */
const scan = (re: RegExp) => new RegExp(re.source, 'g');

/** Blanks out notes, keeping every other column where it was. Lets the chord
 *  patterns above be written without knowing about notes at all. */
function stripNotes(line: string): string {
  return line.replace(scan(NOTE_RE), (m) => ' '.repeat(m.length));
}

type LineKind =
  | { kind: 'blank' }
  | { kind: 'comment' }
  | { kind: 'section'; name: string }
  | { kind: 'heading'; text: string; level: 2 | 3 }
  | { kind: 'chords' }
  | { kind: 'lyrics' };

/**
 * How a single raw line should be read. Shared by the renderer and by
 * transposeContent so a key conversion rewrites exactly the tokens the
 * preview is already showing as chords — never more.
 */
function classifyLine(line: string): LineKind {
  if (!line.trim()) return { kind: 'blank' };

  // Markdown-style headings for oversized text: "## Big" and "### smaller".
  // Checked before comments because they share the # sigil — a single # keeps
  // its long-standing meaning as a comment line.
  const heading = /^(##+)\s*(.+)$/.exec(line.trim());
  if (heading) {
    return { kind: 'heading', text: heading[2], level: heading[1].length === 2 ? 2 : 3 };
  }

  if (line.trimStart().startsWith('#')) return { kind: 'comment' };

  const brace = SECTION_BRACE_RE.exec(line.trim());
  if (brace) return { kind: 'section', name: brace[1] };

  // A "Chorus:" style header, but only when it carries no chords.
  const colon = SECTION_COLON_RE.exec(line.trim());
  if (colon && !line.includes('[')) return { kind: 'section', name: colon[1] };

  return { kind: isChordRow(line) ? 'chords' : 'lyrics' };
}

/**
 * Whether a line is a row of chords and/or notes rather than a lyric.
 *
 * Notes are blanked out before the chord patterns run, so "G *hold* C" is
 * judged on its chords alone and a row of nothing but notes still counts —
 * an annotation has no lyric to be inline against either.
 */
function isChordRow(line: string): boolean {
  const tokens = chordTokens(line);
  if (!tokens.length) return false;

  const chords = tokens.filter((t) => !t.note);
  if (!chords.length) return true;

  const bare = stripNotes(line);
  // Brackets around every chord say outright that this is a chord row.
  if (BRACKET_LINE_RE.test(bare.trim())) return true;
  if (line.includes('[')) return false;
  if (!CHORD_LINE_RE.test(bare.trim())) return false;

  // Bars are the other outright signal, so "x2" and similar margin scribbles
  // inside them are taken on trust. Without bars the only evidence is the
  // tokens themselves, and CHORD_LINE_RE is far too generous there — it reads
  // "Amazing Grace" as two chords. That was harmless while chord rows stood
  // alone; now one can claim the lyric underneath it, so the tokens have to
  // actually be chords.
  return line.includes('|') || chords.every((c) => parseChord(c.text));
}

/** Every token on a chord row, with the column each one starts at. */
function chordTokens(line: string): Anchored[] {
  const re = scan(CHORD_TOKEN_RE);
  const out: Anchored[] = [];
  let match: RegExpExecArray | null;

  while ((match = re.exec(line)) !== null) {
    const raw = match[0];
    // A bare token can start with a stray asterisk, so both ends must agree
    // before this counts as a note.
    if (raw.length > 1 && raw.startsWith('*') && raw.endsWith('*')) {
      out.push({ text: raw.slice(1, -1), note: true, col: match.index });
      continue;
    }
    const text = match[1] ?? raw;
    if (text) out.push({ text, note: false, col: match.index });
  }
  return out;
}

/**
 * The tokens of a row that can sit above a lyric, or null when the line isn't
 * one of those.
 *
 * Bar charts are the only chord rows held back: "| G | C |" is a notation of
 * its own and lands above a lyric only by coincidence, so it keeps its own row.
 * A row of nothing but notes anchors like any other — "*softly*" over a line
 * is annotating that line.
 */
function anchorChords(line: string): Anchored[] | null {
  if (line.includes('|') || classifyLine(line).kind !== 'chords') return null;
  const tokens = chordTokens(line);
  return tokens.length ? tokens : null;
}

/** Whether a chord line directly above this one should anchor into it. */
function isLyricTarget(line: string): boolean {
  // A lyric already carrying inline chords is left alone — two chord
  // notations over one line is ambiguous, and guessing would drop one.
  return classifyLine(line).kind === 'lyrics' && !line.includes('[');
}

/**
 * Splits a lyric at the columns its chords were written above.
 *
 * A chord past the end of the lyric keeps an empty lyric rather than being
 * dropped, so a trailing turnaround chord still renders.
 */
function anchorToLyric(chords: Anchored[], lyric: string): ChordPair[] {
  const pairs: ChordPair[] = [];

  if (chords[0].col > 0) pairs.push({ chord: '', lyric: lyric.slice(0, chords[0].col) });
  chords.forEach((c, i) => {
    const end = i + 1 < chords.length ? chords[i + 1].col : lyric.length;
    const lyricAt = lyric.slice(c.col, end);
    pairs.push(c.note ? { chord: c.text, lyric: lyricAt, note: true } : { chord: c.text, lyric: lyricAt });
  });

  return pairs;
}

export function parseSong(content: string): ParsedSong {
  const lines: Line[] = [];
  const raws = content.replace(/\r\n/g, '\n').split('\n');

  for (let i = 0; i < raws.length; i++) {
    const line = raws[i].trimEnd();

    // A chord line claims the lyric under it, collapsing the pair into the
    // same shape inline chords produce. Done here rather than in classifyLine
    // because it is the one decision that needs to see two lines at once.
    const anchors = anchorChords(line);
    const next = raws[i + 1] !== undefined ? raws[i + 1].trimEnd() : '';
    if (anchors && isLyricTarget(next)) {
      lines.push({ type: 'lyrics', pairs: anchorToLyric(anchors, next) });
      i++;
      continue;
    }

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
      case 'heading':
        lines.push({ type: 'heading', text: classified.text, level: classified.level });
        break;
      case 'chords':
        lines.push({
          type: 'chords',
          chords: chordTokens(line).map(({ text, note }) => ({ text, note })),
        });
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

  // A chord slot usually holds one chord, but a bracketed bar phrase —
  // "[| D | G | Em7 A |]" — parses as a single token whose text carries the
  // whole run. Transposing word-by-word covers both: bars, spacing and
  // anything that isn't a chord pass through unchanged.
  const tr = (text: string) =>
    text.replace(/[^\s|]+/g, (token) => transposeChordToKey(token, fromKey, toKey));

  return {
    lines: song.lines.map((line) => {
      if (line.type === 'lyrics') {
        return {
          ...line,
          pairs: line.pairs.map((p) => ({
            ...p,
            chord: p.chord && !p.note ? tr(p.chord) : p.chord,
          })),
        };
      }
      if (line.type === 'chords') {
        return {
          ...line,
          chords: line.chords.map((t) => (t.note ? t : { ...t, text: tr(t.text) })),
        };
      }
      return line;
    }),
  };
}

/** Distinct section names in the chart, in first-appearance order. Used to
 *  offer note-card anchor targets. */
export function sectionNames(content: string): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const line of parseSong(content).lines) {
    if (line.type === 'section') {
      const key = line.name.trim().toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        names.push(line.name);
      }
    }
  }
  return names;
}

/** Every distinct chord in the song, in first-appearance order. */
export function uniqueChords(song: ParsedSong): string[] {
  const seen = new Set<string>();
  for (const line of song.lines) {
    if (line.type === 'lyrics') {
      for (const p of line.pairs) if (p.chord && !p.note) seen.add(p.chord);
    } else if (line.type === 'chords') {
      for (const t of line.chords) if (!t.note) seen.add(t.text);
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
          return outsideNotes(line, (part) =>
            part.replace(/\[([^\]]*)\]/g, (whole, chord: string) =>
              chord ? `[${transposeChordToKey(chord, fromKey, toKey)}]` : whole,
            ),
          );
        case 'chords':
          // Bar charts carry their own structure; replacing token-wise keeps
          // every bar exactly where the author put it.
          if (line.includes('|')) {
            return outsideNotes(line, (part) =>
              part.replace(/[^\s|]+/g, (token) => transposeChordToKey(token, fromKey, toKey)),
            );
          }
          // Everywhere else the column IS the anchor, so the line is respaced
          // rather than patched: G -> F#m7 would otherwise shove every later
          // chord three characters right and silently re-point it at a
          // different syllable.
          return respaceChordLine(line, fromKey, toKey);
        default:
          return line;
      }
    })
    .join('\n');
}

/**
 * Rewrites a chord line into a new key, pinning each chord back to the column
 * it was written at.
 *
 * A chord that outgrew its slot pushes the next one right by a single space
 * instead of overlapping it — the alignment after that point is off, but the
 * line stays readable, which is what every printed chart does too.
 */
function respaceChordLine(line: string, fromKey: string, toKey: string): string {
  const moved = chordTokens(line).map((t) =>
    t.note ? t : { ...t, text: transposeChordToKey(t.text, fromKey, toKey) },
  );
  return layOutChords(moved, BRACKET_LINE_RE.test(stripNotes(line).trim()));
}

/** Writes a chord row out at its columns, nudging right only when one won't
 *  fit. Notes keep their asterisks so the row reads back the same way. */
function layOutChords(anchors: Anchored[], bracketed: boolean): string {
  return anchors.reduce((out, a) => {
    const text = a.note ? `*${a.text}*` : bracketed ? `[${a.text}]` : a.text;
    return out + ' '.repeat(Math.max(a.col - out.length, out ? 1 : 0)) + text;
  }, '');
}

/** Runs `fn` over the stretches of a line that sit outside any *note*, so an
 *  aside like "*capo 2, G shapes*" never has its words transposed. */
function outsideNotes(line: string, fn: (part: string) => string): string {
  const re = scan(NOTE_RE);
  let out = '';
  let at = 0;
  let match: RegExpExecArray | null;

  while ((match = re.exec(line)) !== null) {
    out += fn(line.slice(at, match.index)) + match[0];
    at = match.index + match[0].length;
  }
  return out + fn(line.slice(at));
}

/**
 * Splits a lyric line's pairs into runs, marking the stretches that came from
 * inside asterisks.
 *
 * Matched across the whole line rather than pair by pair: a note can straddle
 * a chord boundary ("*hold [G]this*"), and a lone asterisk that never closes
 * has to stay literal text instead of turning the rest of the line red.
 */
export function lyricRuns(pairs: ChordPair[]): TextRun[][] {
  const full = pairs.map((p) => p.lyric).join('');
  if (!full.includes('*')) {
    return pairs.map((p) => (p.lyric ? [{ text: p.lyric, note: false }] : []));
  }

  // 0 = plain, 1 = inside a note, -1 = an asterisk to drop.
  const marks = new Array<number>(full.length).fill(0);
  const re = scan(NOTE_RE);
  let match: RegExpExecArray | null;
  while ((match = re.exec(full)) !== null) {
    const end = match.index + match[0].length;
    marks[match.index] = -1;
    marks[end - 1] = -1;
    for (let i = match.index + 1; i < end - 1; i++) marks[i] = 1;
  }

  let at = 0;
  return pairs.map((p) => {
    const runs: TextRun[] = [];
    for (let i = 0; i < p.lyric.length; i++) {
      const mark = marks[at++];
      if (mark === -1) continue;
      const last = runs[runs.length - 1];
      if (last && last.note === (mark === 1)) last.text += p.lyric[i];
      else runs.push({ text: p.lyric[i], note: mark === 1 });
    }
    return runs;
  });
}

/**
 * Rewrites inline `[G]lyric` lines into the two-line, column-aligned form.
 *
 * Emits bare chords, since that is what reads best and what gets pasted in
 * from songbooks — but falls back to brackets for any row that wouldn't be
 * recognised as chords on the way back in, so the conversion is never lossy.
 *
 * Everything else — bar charts, section headers, comments, lyric lines with no
 * chords — is passed through untouched.
 */
export function toAligned(content: string): string {
  const out: string[] = [];

  for (const raw of content.replace(/\r\n/g, '\n').split('\n')) {
    const line = raw.trimEnd();
    const pairs = classifyLine(line).kind === 'lyrics' && line.includes('[')
      ? parseLyricLine(line)
      : null;

    if (!pairs?.some((p) => p.chord)) {
      out.push(line);
      continue;
    }

    out.push(...alignPairs(pairs));
  }

  return out.join('\n');
}

/**
 * Lays a pair list out as a chord row and the lyric beneath it.
 *
 * Each chord anchors at the column its lyric segment begins at, which is
 * exactly the offset the text has reached by the time we meet that chord.
 */
function alignPairs(pairs: ChordPair[]): [string, string] {
  const anchors: Anchored[] = [];
  let lyric = '';
  for (const p of pairs) {
    if (p.chord) anchors.push({ text: p.chord, note: !!p.note, col: lyric.length });
    lyric += p.lyric;
  }

  const bare = layOutChords(anchors, false);
  return [anchorChords(bare) ? bare : layOutChords(anchors, true), lyric];
}

/** Whether any chord is still written inline, i.e. there is something for
 *  toAligned to convert. */
export function hasInlineChords(content: string): boolean {
  return content
    .replace(/\r\n/g, '\n')
    .split('\n')
    .some((line) => classifyLine(line).kind === 'lyrics' && /\[[^\]]*\]/.test(line));
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
        case 'heading':
          return `${'#'.repeat(line.level)} ${line.text}`;
        case 'chords':
          return line.chords.map((t) => (t.note ? `*${t.text}*` : t.text)).join(' ');
        case 'lyrics':
          // A note in the chord slot has no inline spelling — [*hold*] would
          // read back as a chord named "*hold*". Lines carrying one are
          // written in the two-row form, which can say exactly that.
          return line.pairs.some((p) => p.note)
            ? alignPairs(line.pairs).join('\n')
            : line.pairs.map((p) => (p.chord ? `[${p.chord}]` : '') + p.lyric).join('');
        case 'blank':
          return '';
      }
    })
    .join('\n');
}
