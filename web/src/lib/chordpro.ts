/**
 * ChordPro-style parser.
 *
 * Body format:
 *   {Verse 1}            section header (a bare "Verse 1:" line works too)
 *   [G]Amazing [C]grace  inline chords, anchored to the syllable after them
 *   | G | C | D |        a chord-only line, rendered as-is
 *   # a comment          ignored
 *   ## Big text          oversized heading line ("###" and "####" step down)
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
 *
 * ^^Double carets^^ mark the same kind of aside, but one that has to be caught
 * mid-song, so it blinks instead of merely sitting there in red.
 */

import { parseChord, transposeChordToKey } from './chords';

/**
 * `note` means the text is the author talking — an aside, never played, never
 * transposed, never evidence that a line is a chord row. Every "is this a
 * chord?" test in here asks `!note` alone.
 *
 * `blink` is emphasis, and orthogonal: it says how the text is drawn, not what
 * it is. *Asterisks* always mean prose, but ^^carets^^ only make something
 * blink — so ^^G^^ is the chord G, still transposed with everything else,
 * while ^^watch me^^ is prose that happens to flash. What decides is whether
 * the marked text parses as a chord, which is the same question the chord-row
 * patterns already ask of everything else on the line.
 *
 * Both flags are set only when true, never to false, so a plain token still
 * deep-equals the shape it had before any of this existed.
 */
export interface Marked {
  note?: boolean;
  blink?: true;
}

export interface ChordPair extends Marked {
  chord: string; // '' when the lyric has no chord above it
  lyric: string;
}

/** A token on a chord row: a chord, or author's text written *like this*. */
export interface ChordToken extends Marked {
  text: string;
  note: boolean;
}

/** A stretch of lyric text, flagged when it came from inside a mark. */
export interface TextRun extends Marked {
  text: string;
  note: boolean;
}

/** Heading sizes, largest first: "##", "###", "####". */
export type HeadingLevel = 2 | 3 | 4;

export type Line =
  | { type: 'section'; name: string }
  | { type: 'lyrics'; pairs: ChordPair[] }
  | { type: 'chords'; chords: ChordToken[] }
  | { type: 'heading'; text: string; level: HeadingLevel }
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
/** Either mark — *a note* or a ^^blinking cue^^. Each is held to a single line
 *  so a stray asterisk or caret can't run away with the rest of the chart.
 *  Notes come first only for tidiness: the two delimiters can't overlap, so
 *  the order between them never decides a match. */
const MARK_RE = /\*[^*\n]+\*|\^\^[^^\n]+\^\^/;

/** The mark a matched run was written with, or null if it isn't one. */
function markOf(raw: string): Marked | null {
  if (raw.length > 4 && raw.startsWith('^^') && raw.endsWith('^^')) {
    return { note: true, blink: true };
  }
  // A bare token can start with a stray asterisk, so both ends must agree
  // before this counts as a note.
  if (raw.length > 1 && raw.startsWith('*') && raw.endsWith('*')) return { note: true };
  return null;
}

/** Strips a mark's delimiters off the text it wraps. */
const unwrap = (raw: string, mark: Marked) => raw.slice(mark.blink ? 2 : 1, mark.blink ? -2 : -1);

/** Whether a mark wraps a chord rather than prose — true only for ^^carets^^,
 *  which are emphasis and leave what they wrap a chord. */
const marksAChord = (mark: Marked, text: string) => Boolean(mark.blink) && Boolean(parseChord(text));

/** Whether this carries a mark at all, and so has to be written back out with
 *  its delimiters. */
export const isMarked = (m: Marked) => Boolean(m.note || m.blink);

/** A stretch of a chord token's text, flagged with the mark it came from. */
export interface MarkRun extends Marked {
  text: string;
}

/**
 * Splits arbitrary text into its marked stretches and everything between.
 *
 * A chord row is normally tokenised before any renderer sees it, and the marks
 * fall out on the way. A bracketed bar phrase is the exception: "[| D | ^^G^^
 * |]" is deliberately kept as a single token carrying a whole run of chords —
 * transposing it word by word is what lets bars and spacing survive — so
 * anything marked inside it has to be found late, at the point of drawing.
 */
export function markRuns(text: string): MarkRun[] {
  const out: MarkRun[] = [];
  const re = scan(MARK_RE);
  let last = 0;
  let m: RegExpExecArray | null;

  while ((m = re.exec(text)) !== null) {
    const mark = markOf(m[0]);
    if (!mark) continue;
    if (m.index > last) out.push({ text: text.slice(last, m.index), note: false });
    const inner = unwrap(m[0], mark);
    out.push({ text: inner, ...mark, note: !marksAChord(mark, inner) });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last), note: false });
  return out;
}
/** One token on a chord row: a mark, a bracketed chord, a bar, or a bare run.
 *  Bars are tokens in their own right so "| G | C |" renders as the notation it
 *  was written as — they used to fall through the tokenizer and vanish, which
 *  left the bar chart in the placeholder rendering as a bare "G C". */
const CHORD_TOKEN_RE = /\*[^*\n]+\*|\^\^[^^\n]+\^\^|\[([^\]]*)\]|\||[^\s|]+/;

/** A bar is punctuation, never something played. Every judgement about whether
 *  a line *is* a chord row ignores bars — as it did when they were dropped. */
const isBar = (t: ChordToken) => t.text === '|';

/** Structural punctuation: bar lines, dashes, and the brackets around an
 *  implied chord. It frames what you play or sing without being either, so
 *  every renderer fades it back rather than letting it compete. */
const PUNCT_RE = /[|\-()]+/g;

/** A stretch of text, flagged when it is structural punctuation. */
export interface PunctRun {
  text: string;
  punct: boolean;
}

/** Splits text into what's played or sung and the scaffolding around it. */
export function punctRuns(text: string): PunctRun[] {
  const out: PunctRun[] = [];
  const re = scan(PUNCT_RE);
  let last = 0;
  let m: RegExpExecArray | null;

  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push({ text: text.slice(last, m.index), punct: false });
    out.push({ text: m[0], punct: true });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last), punct: false });
  return out;
}

/** A chord row token, with the column its text starts at. */
interface Anchored extends ChordToken {
  col: number;
}

/** A fresh global copy, so a shared pattern never carries lastIndex between
 *  callers. */
const scan = (re: RegExp) => new RegExp(re.source, 'g');

/** Blanks out the author's asides, keeping every other column where it was.
 *  Lets the chord patterns above be written without knowing about marks at
 *  all. A ^^blinking chord^^ keeps its name — it is one of the chords those
 *  patterns are looking for — padded back to the width it occupied so no
 *  column moves. */
function stripMarks(line: string): string {
  return line.replace(scan(MARK_RE), (m) => {
    const mark = markOf(m);
    const text = mark ? unwrap(m, mark) : '';
    if (mark && marksAChord(mark, text)) return text + ' '.repeat(m.length - text.length);
    return ' '.repeat(m.length);
  });
}

type LineKind =
  | { kind: 'blank' }
  | { kind: 'comment' }
  | { kind: 'section'; name: string }
  | { kind: 'heading'; text: string; level: HeadingLevel }
  | { kind: 'chords' }
  | { kind: 'lyrics' };

/**
 * How a single raw line should be read. Shared by the renderer and by
 * transposeContent so a key conversion rewrites exactly the tokens the
 * preview is already showing as chords — never more.
 */
function classifyLine(line: string): LineKind {
  if (!line.trim()) return { kind: 'blank' };

  // Markdown-style headings for oversized text: "##", "###" and "####", each a
  // size down. Checked before comments because they share the # sigil — a
  // single # keeps its long-standing meaning as a comment line. Anything
  // deeper than four bottoms out at the smallest rather than becoming a
  // heading nobody can see.
  const heading = /^(##+)\s*(.+)$/.exec(line.trim());
  if (heading) {
    const level = Math.min(heading[1].length, 4) as HeadingLevel;
    return { kind: 'heading', text: heading[2], level };
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
  const tokens = chordTokens(line).filter((t) => !isBar(t));
  if (!tokens.length) return false;

  const chords = tokens.filter((t) => !t.note);
  if (!chords.length) return true;

  const bare = stripMarks(line);
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
    const mark = markOf(raw);
    if (mark) {
      const text = unwrap(raw, mark);
      out.push({ text, ...mark, note: !marksAChord(mark, text), col: match.index });
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
    pairs.push({
      chord: c.text,
      lyric: lyricAt,
      ...(c.note ? { note: true } : null),
      ...(c.blink ? { blink: c.blink } : null),
    });
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
          // Everything but the column, which only matters while anchoring.
          chords: chordTokens(line).map(({ col, ...token }) => token),
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
  let pendingMark: Marked | null = null;
  let match: RegExpExecArray | null;

  while ((match = re.exec(line)) !== null) {
    const lyric = line.slice(lastIndex, match.index);
    if (lyric || pendingChord) pairs.push({ chord: pendingChord, lyric, ...pendingMark });
    [pendingChord, pendingMark] = readChordSlot(match[1]);
    lastIndex = re.lastIndex;
  }

  const tail = line.slice(lastIndex);
  if (tail || pendingChord) pairs.push({ chord: pendingChord, lyric: tail, ...pendingMark });

  return pairs;
}

/** Reads what's between the brackets of an inline chord. "[^^G^^]" is the
 *  inline spelling of a blinking chord — without this the marks would survive
 *  into the chord name and render as a chord literally called "^^G^^". */
function readChordSlot(raw: string): [string, Marked | null] {
  const mark = markOf(raw);
  if (!mark) return [raw, null];
  const text = unwrap(raw, mark);
  return marksAChord(mark, text) ? [text, { blink: mark.blink }] : [text, mark];
}

/** Applies a key change to every chord in a parsed song. */
export function transposeSong(song: ParsedSong, fromKey: string, toKey: string): ParsedSong {
  if (fromKey === toKey) return song;

  // A chord slot usually holds one chord, but a bracketed bar phrase —
  // "[| D | G | Em7 A |]" — parses as a single token whose text carries the
  // whole run. Transposing word-by-word covers both: bars, spacing and
  // anything that isn't a chord pass through unchanged.
  //
  // A ^^blinking chord^^ still wears its carets in there, and they'd stop it
  // parsing as a chord — leaving the one chord the author flagged as the one
  // showing a stale value while everything around it moved.
  const tr = (text: string) =>
    text.replace(/[^\s|]+/g, (token) => {
      const mark = markOf(token);
      if (!mark) return transposeChordToKey(token, fromKey, toKey);
      const inner = unwrap(token, mark);
      return marksAChord(mark, inner)
        ? `^^${transposeChordToKey(inner, fromKey, toKey)}^^`
        : token;
    });

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
          return outsideMarks(line, (part) =>
            part.replace(/\[([^\]]*)\]/g, (whole, chord: string) => {
              if (!chord) return whole;
              const mark = markOf(chord);
              const text = mark ? unwrap(chord, mark) : chord;
              // Prose in a chord slot stays exactly as typed.
              if (mark && !marksAChord(mark, text)) return whole;
              const moved = transposeChordToKey(text, fromKey, toKey);
              return `[${mark ? `^^${moved}^^` : moved}]`;
            }),
          );
        case 'chords':
          // Bar charts carry their own structure; replacing token-wise keeps
          // every bar exactly where the author put it.
          if (line.includes('|')) {
            return outsideMarks(line, (part) =>
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
  return layOutChords(moved, BRACKET_LINE_RE.test(stripMarks(line).trim()));
}

/** Writes a chord row out at its columns, nudging right only when one won't
 *  fit. Marks keep their delimiters so the row reads back the same way. */
function layOutChords(anchors: Anchored[], bracketed: boolean): string {
  return anchors.reduce((out, a) => {
    const text = isMarked(a) ? rewrap(a) : bracketed ? `[${a.text}]` : a.text;
    return out + ' '.repeat(Math.max(a.col - out.length, out ? 1 : 0)) + text;
  }, '');
}

/** Puts a mark's delimiters back on, so what was parsed can be written out
 *  again byte for byte. Chord slots pass their text separately, since a pair
 *  keeps it under a different name. */
const rewrap = (m: Marked & { text?: string }, text = m.text ?? '') =>
  m.blink ? `^^${text}^^` : m.note ? `*${text}*` : text;

/** Runs `fn` over the stretches of a line that sit outside any mark, so an
 *  aside like "*capo 2, G shapes*" never has its words transposed.
 *
 *  A ^^blinking chord^^ is the exception: it is a chord, so it moves with the
 *  key like any other. Without this a chart transposed on its way to storage
 *  would keep the old chord inside the carets — still blinking, and now
 *  wrong. */
function outsideMarks(line: string, fn: (part: string) => string): string {
  const re = scan(MARK_RE);
  let out = '';
  let at = 0;
  let match: RegExpExecArray | null;

  while ((match = re.exec(line)) !== null) {
    const end = match.index + match[0].length;
    // "[^^G^^]" is a chord slot that happens to be marked, not a mark that
    // happens to sit in brackets. Splitting here would hand `fn` a bare "["
    // and hide the slot from it, so the whole thing is left in the plain run
    // for `fn` to recognise.
    if (line[match.index - 1] === '[' && line[end] === ']') continue;
    const mark = markOf(match[0]);
    const text = mark ? unwrap(match[0], mark) : '';
    const kept = mark && marksAChord(mark, text) ? `^^${fn(text)}^^` : match[0];
    out += fn(line.slice(at, match.index)) + kept;
    at = end;
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
  if (!full.includes('*') && !full.includes('^')) {
    return pairs.map((p) => (p.lyric ? [{ text: p.lyric, note: false }] : []));
  }

  // Per character: PLAIN, NOTE, BLINK, or DROP for a delimiter that shouldn't
  // reach the page. A delimiter is one character for *, two for ^^.
  const PLAIN = 0;
  const DROP = -1;
  const kinds = new Array<number>(full.length).fill(PLAIN);
  const re = scan(MARK_RE);
  let match: RegExpExecArray | null;
  while ((match = re.exec(full)) !== null) {
    const mark = markOf(match[0]);
    if (!mark) continue;
    const width = mark.blink ? 2 : 1;
    const start = match.index;
    const end = start + match[0].length;
    for (let i = 0; i < width; i++) {
      kinds[start + i] = DROP;
      kinds[end - 1 - i] = DROP;
    }
    for (let i = start + width; i < end - width; i++) kinds[i] = mark.blink ? 2 : 1;
  }

  const runOf = (kind: number): TextRun =>
    kind === 2 ? { text: '', note: true, blink: true } : { text: '', note: kind === 1 };

  let at = 0;
  return pairs.map((p) => {
    const runs: TextRun[] = [];
    let openKind = PLAIN;
    for (let i = 0; i < p.lyric.length; i++) {
      const kind = kinds[at++];
      if (kind === DROP) continue;
      const last = runs[runs.length - 1];
      if (last && openKind === kind) {
        last.text += p.lyric[i];
      } else {
        const run = runOf(kind);
        run.text = p.lyric[i];
        runs.push(run);
        openKind = kind;
      }
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
    if (p.chord) {
      anchors.push({
        text: p.chord,
        note: !!p.note,
        ...(p.blink ? { blink: p.blink } : null),
        col: lyric.length,
      });
    }
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
          return line.chords.map((t) => (isMarked(t) ? rewrap(t) : t.text)).join(' ');
        case 'lyrics':
          // A note in the chord slot has no inline spelling — [*hold*] would
          // read back as a chord named "*hold*". Lines carrying one are
          // written in the two-row form, which can say exactly that. A
          // ^^blinking chord^^ is still a chord, so [^^G^^] reads back fine.
          return line.pairs.some((p) => p.note)
            ? alignPairs(line.pairs).join('\n')
            : line.pairs.map((p) => (p.chord ? `[${rewrap(p, p.chord)}]` : '') + p.lyric).join('');
        case 'blank':
          return '';
      }
    })
    .join('\n');
}
