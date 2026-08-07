/**
 * Chart -> PDF.
 *
 * The chart is laid out into the PDF from the parsed song rather than
 * screenshotted from the DOM: text stays real text (selectable, searchable,
 * crisp at any zoom) and page breaks land where we choose instead of wherever
 * a raster image happened to be cut.
 *
 * The layout mirrors ChordChart — a chord sits in its own row above the
 * syllable it was written over, and each chord+syllable pair is a column that
 * wraps as a unit, so a wide chord name never shifts a lyric.
 *
 * This is also what the print button produces: printing goes through the same
 * document rather than through window.print() on the page, so a chart comes off
 * a printer exactly as it comes out of the file.
 */

import { jsPDF } from 'jspdf';
import {
  isMarked, lyricRuns, markRuns, parseSong, punctRuns, transposeSong,
  type HeadingLevel, type Line, type Marked, type ParsedSong, type TextRun,
} from './chordpro';
import { sectionKey } from './noteColors';
import type { NoteCard } from '@/types';

/* ── Typeface ──────────────────────────────────────────────────────────── */

/**
 * Courier — the one monospace face jsPDF carries without embedding anything.
 *
 * Monospace throughout, matching the chart font the app ships with: a chart is
 * written on a character grid in the editor, and equal-width characters keep
 * the printed page reading like the source it was typed from. The heading and
 * meta lines use it too, so the sheet is one typeface rather than a chart in
 * one face under a header in another.
 */
const FONT = 'courier';

/* ── Page geometry, in points ───────────────────────────────────────────── */

const PAGE_W = 595.28; // A4 portrait
const PAGE_H = 841.89;
const MARGIN = { top: 46, right: 40, bottom: 46, left: 40 };
const CONTENT_W = PAGE_W - MARGIN.left - MARGIN.right;
const PAGE_BOTTOM = PAGE_H - MARGIN.bottom;
/** Space between columns when a chart is printed two-up. */
const GUTTER = 26;

/* ── Palette, tracking the on-screen theme ─────────────────────────────── */

const INK = '#141a22';
const MUTED = '#5d564e';
const RULE = '#dfd8cc';
const BLUE = '#2563eb'; // chords and section headers
// Author's notes. A ^^blinking cue^^ prints as one too: paper can't blink, and
// the two say the same thing — this is an aside, not something to play.
const RED = '#c0392b';
// Structural punctuation — bars, dashes, brackets — at half strength, the flat
// equivalent of the opacity ChordChart gives it on screen.
const BLUE_FAINT = '#92b1f5';
const INK_FAINT = '#898c90';

/** Note-card colours, mirroring NOTE_COLORS as flat hex for the PDF. */
const CARD_COLORS: Record<string, { bg: string; border: string; fg: string }> = {
  amber: { bg: '#fefce8', border: '#eab308', fg: '#713f12' },
  red: { bg: '#fef2f2', border: '#ef4444', fg: '#991b1b' },
  green: { bg: '#f0fdf4', border: '#22c55e', fg: '#166534' },
  blue: { bg: '#eff6ff', border: '#60a5fa', fg: '#1e40af' },
  gray: { bg: '#ece7de', border: '#b3a99b', fg: '#182231' },
};

const cardColor = (key: string) => CARD_COLORS[key] ?? CARD_COLORS.amber;

/* ── Input ─────────────────────────────────────────────────────────────── */

/** Everything a rendered song needs, flattened so a Song and a SetlistItem can
 *  both be fed in without the renderer knowing which it got. */
export interface PdfSong {
  title: string;
  artist?: string;
  /** The key `content` is written in. '' when the song has no key. */
  fromKey: string;
  /** The key to print in. Equal to fromKey means no transposition. */
  toKey: string;
  timeSignature?: string;
  tempo?: number | null;
  feel?: string;
  ccli?: string;
  content: string;
  noteCards?: NoteCard[];
  /** Capo the chart was printed for. `toKey` is then the shapes being
   *  fingered, not the sounding key, which the meta line has to say. */
  capo?: number;
  /** The key the capoed shapes sound in. Only meaningful alongside `capo`. */
  soundingKey?: string;
  /** Running-order number, printed before the title. */
  index?: number;
  /** Chart body size in points. Defaults to 11. */
  fontSize?: number;
  showChords?: boolean;
  /** Columns to flow the chart into, 1 or 2 — the song's own setting. Two
   *  falls back to one when the chart's lines are too wide to fit. */
  columns?: number;
}

/* ── Drawing context ───────────────────────────────────────────────────── */

/**
 * Where the next block goes.
 *
 * Everything draws into the current column rather than the page, so the same
 * routines lay out a full-width block and a two-up chart. In one column `x`
 * and `w` are simply the page's own margins and width.
 */
interface Ctx {
  doc: jsPDF;
  /** Top of the next block. */
  y: number;
  /** Left edge of the column being filled. */
  x: number;
  /** Width of the column being filled. */
  w: number;
  /** Columns the flow runs in, and which one is being filled (0-based). */
  cols: number;
  col: number;
  /** Where a column starts on this page — below the song header on the first
   *  page of a song, at the top margin on every page after it. */
  top: number;
}

const newCtx = (doc: jsPDF): Ctx => ({
  doc, y: MARGIN.top, x: MARGIN.left, w: CONTENT_W, cols: 1, col: 0, top: MARGIN.top,
});

type Weight = 'normal' | 'bold' | 'italic' | 'bolditalic';

function style(ctx: Ctx, size: number, weight: Weight, color: string) {
  ctx.doc.setFont(FONT, weight);
  ctx.doc.setFontSize(size);
  ctx.doc.setTextColor(color);
}

/** Width of `text` in the font that is currently set. */
const widthOf = (ctx: Ctx, text: string) => (text ? ctx.doc.getTextWidth(text) : 0);

/**
 * Draws text with its structural punctuation faded, mirroring ChordChart.
 *
 * Every run keeps the font already set and only the colour changes, so the
 * total advance is the same width the caller measured with widthOf — nothing
 * about the layout depends on this.
 */
function drawFaded(ctx: Ctx, text: string, x: number, y: number, ink: string, faint: string) {
  let cx = x;
  for (const run of punctRuns(text)) {
    ctx.doc.setTextColor(run.punct ? faint : ink);
    ctx.doc.text(safe(run.text), cx, y);
    cx += widthOf(ctx, run.text);
  }
  ctx.doc.setTextColor(ink);
}

/** Baseline for a line of `size` whose top sits at `top`. */
const baseline = (top: number, size: number) => top + size * 0.8;

function newPage(ctx: Ctx) {
  ctx.doc.addPage();
  ctx.col = 0;
  ctx.x = MARGIN.left;
  ctx.top = MARGIN.top;
  ctx.y = MARGIN.top;
}

/**
 * Flows the rest of this song into `cols` columns, starting here.
 *
 * The columns hang off the current cursor, so a chart printed two-up begins
 * under its own header rather than beside it.
 */
function startColumns(ctx: Ctx, cols: number) {
  ctx.cols = cols;
  ctx.col = 0;
  ctx.x = MARGIN.left;
  ctx.w = columnWidth(cols);
  ctx.top = ctx.y;
}

/** Back to one full-width column, at the foot of whatever was drawn. */
function endColumns(ctx: Ctx) {
  ctx.cols = 1;
  ctx.col = 0;
  ctx.x = MARGIN.left;
  ctx.w = CONTENT_W;
}

const columnWidth = (cols: number) => (CONTENT_W - GUTTER * (cols - 1)) / cols;

/**
 * The bottom of the column has been reached.
 *
 * Filling is vertical first: a column runs from its top to the bottom of the
 * page, then the next column across takes over, and only when the last one is
 * full does a new page start. Nothing is balanced — verse 2 follows verse 1
 * down the page, not across it.
 */
function columnBreak(ctx: Ctx) {
  if (ctx.col + 1 < ctx.cols) {
    ctx.col += 1;
    ctx.x = MARGIN.left + ctx.col * (ctx.w + GUTTER);
    ctx.y = ctx.top;
    return;
  }
  newPage(ctx);
}

/** Moves on to the next column or page unless `height` still fits in this one. */
function ensure(ctx: Ctx, height: number) {
  if (ctx.y > ctx.top && ctx.y + height > PAGE_BOTTOM) columnBreak(ctx);
}

/** Space left in the column below the cursor. */
const room = (ctx: Ctx) => PAGE_BOTTOM - ctx.y;

/** PDF standard fonts encode Latin-1/WinAnsi; a stray control character would
 *  otherwise land as a literal glyph. */
const safe = (text: string) => text.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '');

/* ── Note cards ────────────────────────────────────────────────────────── */

const CARD_PAD_X = 8;
const CARD_PAD_Y = 6;
const CARD_BAR = 3;

/**
 * A tinted callout, split across pages when its text is longer than one.
 *
 * Each page-chunk draws its own fill and bar so a note that spills never leaves
 * a band of background hanging past the text.
 */
function drawNoteCard(ctx: Ctx, card: NoteCard, size: number) {
  const c = cardColor(card.color);
  const lineH = size * 1.35;
  const textW = ctx.w - CARD_BAR - CARD_PAD_X * 2;

  style(ctx, size, 'normal', c.fg);
  const lines: string[] = ctx.doc.splitTextToSize(safe(card.text), textW);

  let at = 0;
  while (at < lines.length) {
    // At least one line goes down per page, otherwise a page whose remaining
    // room is under a single line height would loop forever.
    ensure(ctx, lineH + CARD_PAD_Y * 2);
    const fits = Math.max(1, Math.floor((room(ctx) - CARD_PAD_Y * 2) / lineH));
    const chunk = lines.slice(at, at + fits);
    const h = chunk.length * lineH + CARD_PAD_Y * 2;

    ctx.doc.setFillColor(c.bg);
    ctx.doc.rect(ctx.x, ctx.y, ctx.w, h, 'F');
    ctx.doc.setFillColor(c.border);
    ctx.doc.rect(ctx.x, ctx.y, CARD_BAR, h, 'F');

    style(ctx, size, 'normal', c.fg);
    chunk.forEach((line, i) => {
      ctx.doc.text(line, ctx.x + CARD_BAR + CARD_PAD_X, baseline(ctx.y + CARD_PAD_Y + i * lineH, size));
    });

    ctx.y += h;
    at += chunk.length;
  }
  ctx.y += 5;
}

function drawNoteCards(ctx: Ctx, cards: NoteCard[], size: number) {
  for (const card of cards) drawNoteCard(ctx, card, size);
}

/* ── Chart ─────────────────────────────────────────────────────────────── */

/** One chord-over-syllable column. `chord` is '' when the syllable carries none. */
interface Cell {
  chord: string;
  chordNote: boolean;
  /** Marked in any way, so it prints red — a note or a blinking chord. */
  chordMarked: boolean;
  runs: TextRun[];
  width: number;
  chordWidth: number;
}

/** "##" through "####", against the body size — the same steps ChordChart
 *  uses on screen, so a printed chart keeps the shape of the one on it. */
const HEADING_SCALE: Record<HeadingLevel, number> = { 2: 1.5, 3: 1.25, 4: 1.08 };

/**
 * A lyric row's own height, and the air kept under it — the same pair
 * ChordChart uses on screen, so a chart is spaced the same however it's read.
 *
 * The gap is what stops a verse setting solid: on a stand the eye needs
 * somewhere to land when it comes back to the page mid-song.
 */
const LINE_HEIGHT = 1.35;
const LYRIC_GAP = 0.45;

/** A blank line in the source — a breath between blocks, not an empty line of
 *  singing, so it stands shorter than a lyric row. */
const BLANK_HEIGHT = 0.9;

/** The chord row above a lyric, against the body size rather than the chord's
 *  own — ChordChart reserves the same, and the two have to agree or a printed
 *  verse sits at a different pitch to the one on screen. */
const CHORD_ROW = 1.3;

/**
 * Gap kept to the right of a chord so neighbouring chords never touch, and the
 * gap between tokens on a bar-chart row.
 *
 * Both are ems rather than points. A chart shrunk to fit two columns is scaled
 * whole — padding that stayed a fixed 5pt while the text around it halved
 * would swallow the space it saved, and would leave the ratio between a
 * chart's width and its size non-linear, so fitColumns could no longer work
 * out the size that fits by dividing.
 */
const chordPad = (size: number) => size * 0.45;
const tokenGap = (size: number) => size * 0.8;

/** What a chord slot actually shows. A bracketed bar phrase arrives with its
 *  marks still spelled out — "| D | ^^G^^ |" — and the delimiters are never
 *  drawn, so every measurement has to be taken without them. */
const slotText = (text: string) => markRuns(text).map((r) => r.text).join('');

/**
 * Draws a chord slot: marked stretches in red, the rest in `ink` with its
 * structural punctuation faded.
 *
 * Paper can't blink, so a ^^blinking^^ chord prints as a red one — the same
 * fallback a red note gets, and the same thing it means on screen: look here.
 */
function drawSlot(ctx: Ctx, text: string, x: number, y: number, ink: string, faint: string) {
  let cx = x;
  for (const run of markRuns(text)) {
    if (isMarked(run)) {
      ctx.doc.setTextColor(RED);
      ctx.doc.text(safe(run.text), cx, y);
    } else {
      drawFaded(ctx, run.text, cx, y, ink, faint);
    }
    cx += widthOf(ctx, run.text);
  }
  ctx.doc.setTextColor(ink);
}

function runsWidth(ctx: Ctx, runs: TextRun[], size: number): number {
  let w = 0;
  for (const run of runs) {
    style(ctx, size, run.note ? 'bolditalic' : 'normal', INK);
    w += widthOf(ctx, run.text);
  }
  return w;
}

/**
 * The columns of a lyric line, measured.
 *
 * A syllable with no chord over it carries no alignment, so it is broken into
 * words: on a page this narrow an unchorded line is otherwise one indivisible
 * column running off the right edge.
 */
function lyricCells(ctx: Ctx, line: Extract<Line, { type: 'lyrics' }>, size: number, chordSize: number): Cell[] {
  const runs = lyricRuns(line.pairs);
  const cells: Cell[] = [];

  const push = (chord: string, mark: Marked, text: TextRun[]) => {
    style(ctx, chordSize, mark.note ? 'bolditalic' : 'bold', BLUE);
    // Measured on what will be drawn, never on the source: a slot carrying
    // "^^G^^" shows one character, not five.
    const chordWidth = chord ? widthOf(ctx, slotText(chord)) + chordPad(chordSize) : 0;
    cells.push({
      chord,
      chordNote: !!mark.note,
      chordMarked: isMarked(mark),
      runs: text,
      chordWidth,
      width: Math.max(chordWidth, runsWidth(ctx, text, size)),
    });
  };

  line.pairs.forEach((pair, i) => {
    const text = runs[i];
    if (pair.chord) {
      push(pair.chord, pair, text);
      return;
    }
    // Words keep their trailing space, so the gap between them survives the
    // split and the line reads exactly as written.
    for (const run of text) {
      for (const word of run.text.match(/\S+\s*|\s+/g) ?? []) {
        push('', {}, [{ text: word, note: run.note }]);
      }
    }
  });

  return cells;
}

function drawCellRow(ctx: Ctx, row: Cell[], size: number, chordSize: number, showChords: boolean) {
  const hasChord = showChords && row.some((c) => c.chord);
  const chordH = hasChord ? size * CHORD_ROW : 0;
  const lyricH = size * (LINE_HEIGHT + LYRIC_GAP);

  ensure(ctx, chordH + lyricH);

  let x = ctx.x;
  for (const cell of row) {
    if (hasChord && cell.chord) {
      const ink = cell.chordMarked ? RED : BLUE;
      style(ctx, chordSize, cell.chordNote ? 'bolditalic' : 'bold', ink);
      // A note is prose — its own brackets are part of what it says.
      if (cell.chordNote) ctx.doc.text(safe(cell.chord), x, baseline(ctx.y, chordSize));
      else drawSlot(ctx, cell.chord, x, baseline(ctx.y, chordSize), ink, cell.chordMarked ? ink : BLUE_FAINT);
    }
    let lx = x;
    for (const run of cell.runs) {
      style(ctx, size, run.note ? 'bolditalic' : 'normal', run.note ? RED : INK);
      if (run.note) ctx.doc.text(safe(run.text), lx, baseline(ctx.y + chordH, size));
      else drawFaded(ctx, run.text, lx, baseline(ctx.y + chordH, size), INK, INK_FAINT);
      lx += widthOf(ctx, run.text);
    }
    x += cell.width;
  }

  ctx.y += chordH + lyricH;
}

function drawLyricLine(ctx: Ctx, line: Extract<Line, { type: 'lyrics' }>, size: number, chordSize: number, showChords: boolean) {
  const cells = lyricCells(ctx, line, size, chordSize);
  if (!cells.length) {
    ctx.y += size * (LINE_HEIGHT + LYRIC_GAP);
    return;
  }

  let row: Cell[] = [];
  let rowW = 0;
  for (const cell of cells) {
    if (row.length && rowW + cell.width > ctx.w) {
      drawCellRow(ctx, row, size, chordSize, showChords);
      row = [];
      rowW = 0;
    }
    row.push(cell);
    rowW += cell.width;
  }
  if (row.length) drawCellRow(ctx, row, size, chordSize, showChords);
}

/** A bar chart or standalone chord row — its own notation, wrapped by token. */
function drawChordLine(ctx: Ctx, line: Extract<Line, { type: 'chords' }>, chordSize: number) {
  const lineH = chordSize * 1.4;
  ensure(ctx, lineH);
  let x = ctx.x;

  for (const token of line.chords) {
    const ink = isMarked(token) ? RED : BLUE;
    const setFont = () => style(ctx, chordSize, token.note ? 'bolditalic' : 'bold', ink);
    setFont();
    // Measured on what will be drawn: a phrase carrying "^^G^^" loses four
    // characters between here and the page, and the wrap test has to know.
    const w = widthOf(ctx, slotText(token.text));
    if (x > ctx.x && x + w > ctx.x + ctx.w) {
      ctx.y += lineH;
      ensure(ctx, lineH);
      // Re-read after ensure: a break here moves the row into the next column.
      x = ctx.x;
      setFont();
    }
    if (token.note) ctx.doc.text(safe(token.text), x, baseline(ctx.y, chordSize));
    else drawSlot(ctx, token.text, x, baseline(ctx.y, chordSize), ink, ink === RED ? ink : BLUE_FAINT);
    x += w + tokenGap(chordSize);
  }
  ctx.y += lineH;
}

function drawSection(ctx: Ctx, name: string, size: number, first: boolean) {
  const s = size * 0.82;
  const lineH = s * 1.4;
  ctx.y += first ? 0 : size * 0.75;
  // A header alone at the foot of a page reads as a section with nothing in
  // it, so it only stays if a chord row and its lyric fit under it too.
  ensure(ctx, lineH + size * 2.5);
  style(ctx, s, 'bold', BLUE);
  ctx.doc.text(safe(name.toUpperCase()), ctx.x, baseline(ctx.y, s), { charSpace: 0.6 });
  ctx.y += lineH;
}

/**
 * How wide the chart wants to be — its longest line that can't be broken.
 *
 * A line carrying chords is measured whole: wrapping it drops half the chords
 * onto a row of their own, away from the line they were written against. Bare
 * lyrics, note cards and headings are prose that wraps to whatever width it is
 * given, so none of them gets a say in whether the chart fits two columns.
 */
function naturalWidth(ctx: Ctx, song: ParsedSong, size: number, chordSize: number, showChords: boolean): number {
  let widest = 0;
  for (const line of song.lines) {
    if (line.type === 'lyrics' && line.pairs.some((p) => p.chord)) {
      widest = Math.max(widest, lyricCells(ctx, line, size, chordSize).reduce((w, c) => w + c.width, 0));
    } else if (line.type === 'chords' && showChords) {
      style(ctx, chordSize, 'bold', BLUE);
      const gap = tokenGap(chordSize);
      const w = line.chords.reduce((sum, t) => sum + widthOf(ctx, slotText(t.text)) + gap, 0);
      widest = Math.max(widest, w - gap);
    }
  }
  return widest;
}

/**
 * The smallest a chart body may be set at, in points.
 *
 * Two columns are the song's own setting, so the body shrinks by as much as it
 * takes to honour them — a chart that reads two-up on screen has to print
 * two-up as well. Only when even this size won't fit does the layout change,
 * because a chart set smaller than this can't be read from a music stand and a
 * single readable column beats two unreadable ones.
 */
const MIN_CHART_SIZE = 6;

/**
 * The column count and body size to print this chart at.
 *
 * A chart's lines are never re-wrapped to make them fit — a chord sits over its
 * own syllable, and folding a line in half moves it — so the body size is what
 * gives instead. Text scales linearly, so the ratio of the column to the
 * longest unbreakable line is exactly the scale that makes it fit.
 */
function fitColumns(ctx: Ctx, song: ParsedSong, size: number, showChords: boolean): { cols: number; size: number } {
  const wanted = 2;
  const natural = naturalWidth(ctx, song, size, size * 0.94, showChords);
  if (!natural) return { cols: wanted, size };

  const scale = columnWidth(wanted) / natural;
  if (scale >= 1) return { cols: wanted, size };

  const shrunk = size * scale;
  return shrunk >= MIN_CHART_SIZE ? { cols: wanted, size: shrunk } : { cols: 1, size };
}

function drawChart(ctx: Ctx, song: PdfSong) {
  const showChords = song.showChords !== false;
  const parsed = transposeSong(parseSong(song.content), song.fromKey, song.toKey);

  const fit = song.columns === 2
    ? fitColumns(ctx, parsed, song.fontSize ?? 11, showChords)
    : { cols: 1, size: song.fontSize ?? 11 };
  const size = fit.size;
  const chordSize = size * 0.94;

  startColumns(ctx, fit.cols);

  const sections = groupSectionNotes(song.noteCards);
  const shown = new Set<string>();

  parsed.lines.forEach((line, i) => {
    switch (line.type) {
      case 'blank':
        ctx.y += size * BLANK_HEIGHT;
        break;
      case 'section': {
        drawSection(ctx, line.name, size, i === 0);
        const k = sectionKey(line.name);
        if (!shown.has(k) && sections[k]?.length) {
          shown.add(k);
          ctx.y += 2;
          drawNoteCards(ctx, sections[k], size * 0.88);
          ctx.y += 2;
        }
        break;
      }
      case 'heading': {
        // "##" through "####" — oversized bold lines, matching the chart.
        const hs = size * HEADING_SCALE[line.level];
        const lineH = hs * 1.4;
        ensure(ctx, lineH);
        style(ctx, hs, 'bold', INK);
        ctx.doc.text(safe(line.text), ctx.x, baseline(ctx.y + 2, hs));
        ctx.y += lineH + 2;
        break;
      }
      case 'chords':
        if (showChords) drawChordLine(ctx, line, chordSize);
        break;
      case 'lyrics':
        drawLyricLine(ctx, line, size, chordSize, showChords);
        break;
    }
  });

  endColumns(ctx);
}

/** Section-anchored note cards, keyed the same way ChordChart keys them. */
function groupSectionNotes(cards: NoteCard[] | undefined): Record<string, NoteCard[]> {
  const out: Record<string, NoteCard[]> = {};
  for (const card of cards ?? []) {
    if (card.section.trim()) (out[sectionKey(card.section)] ??= []).push(card);
  }
  return out;
}

/* ── Song block ────────────────────────────────────────────────────────── */

/**
 * How the printed key reads.
 *
 * With a capo on, the chart shows shapes rather than the sounding key, so the
 * label leads with what is fingered and names what it sounds in — the same
 * thing the capo hint says on screen.
 */
function keyLabel(song: PdfSong): string {
  if (!song.toKey) return '';
  if (song.capo && song.soundingKey && song.soundingKey !== song.toKey) {
    return `${song.toKey} shapes, sounds in ${song.soundingKey}`;
  }
  return song.fromKey && song.fromKey !== song.toKey
    ? `Key of ${song.toKey} (written in ${song.fromKey})`
    : `Key of ${song.toKey}`;
}

function drawSongHeader(ctx: Ctx, song: PdfSong) {
  const title = song.index ? `${song.index}. ${song.title}` : song.title;

  style(ctx, 16, 'bold', INK);
  for (const line of ctx.doc.splitTextToSize(safe(title), CONTENT_W) as string[]) {
    ctx.doc.text(line, MARGIN.left, baseline(ctx.y, 16));
    ctx.y += 16 * 1.25;
  }

  if (song.artist) {
    style(ctx, 10, 'normal', MUTED);
    ctx.doc.text(safe(song.artist), MARGIN.left, baseline(ctx.y, 10));
    ctx.y += 10 * 1.4;
  }

  const meta = [
    keyLabel(song),
    song.capo ? `Capo ${song.capo}` : '',
    song.timeSignature ?? '',
    song.tempo ? `${song.tempo} bpm` : '',
    song.feel ?? '',
    song.ccli ? `CCLI ${song.ccli}` : '',
  ].filter(Boolean);

  if (meta.length) {
    ctx.y += 2;
    style(ctx, 9.5, 'normal', MUTED);
    ctx.doc.text(safe(meta.join('   ·   ')), MARGIN.left, baseline(ctx.y, 9.5));
    ctx.y += 9.5 * 1.4;
  }

  ctx.y += 5;
  ctx.doc.setDrawColor(RULE);
  ctx.doc.setLineWidth(0.7);
  ctx.doc.line(MARGIN.left, ctx.y, MARGIN.left + CONTENT_W, ctx.y);
  ctx.y += 11;
}

/** Renders one song from the top of the current page down. */
function drawSong(ctx: Ctx, song: PdfSong) {
  const size = song.fontSize ?? 11;
  drawSongHeader(ctx, song);

  const general = (song.noteCards ?? []).filter((c) => !c.section.trim());
  if (general.length) {
    drawNoteCards(ctx, general, size * 0.9);
    ctx.y += 3;
  }

  if (song.content.trim()) {
    drawChart(ctx, song);
  } else {
    style(ctx, size, 'italic', MUTED);
    ctx.doc.text('No lyrics or chords yet.', MARGIN.left, baseline(ctx.y, size));
  }
}

/* ── Cover and footer ──────────────────────────────────────────────────── */

export interface Cover {
  title: string;
  subtitle?: string;
  notes?: string;
}

function drawCover(ctx: Ctx, cover: Cover, songs: PdfSong[]) {
  style(ctx, 24, 'bold', INK);
  for (const line of ctx.doc.splitTextToSize(safe(cover.title), CONTENT_W) as string[]) {
    ctx.doc.text(line, MARGIN.left, baseline(ctx.y, 24));
    ctx.y += 24 * 1.2;
  }

  if (cover.subtitle) {
    style(ctx, 11.5, 'normal', MUTED);
    ctx.doc.text(safe(cover.subtitle), MARGIN.left, baseline(ctx.y, 11.5));
    ctx.y += 11.5 * 1.5;
  }

  if (cover.notes?.trim()) {
    ctx.y += 4;
    style(ctx, 10, 'normal', MUTED);
    for (const line of ctx.doc.splitTextToSize(safe(cover.notes), CONTENT_W) as string[]) {
      ensure(ctx, 10 * 1.4);
      ctx.doc.text(line, MARGIN.left, baseline(ctx.y, 10));
      ctx.y += 10 * 1.4;
    }
  }

  ctx.y += 14;
  ctx.doc.setDrawColor(RULE);
  ctx.doc.setLineWidth(0.7);
  ctx.doc.line(MARGIN.left, ctx.y, MARGIN.left + CONTENT_W, ctx.y);
  ctx.y += 16;

  style(ctx, 9, 'bold', MUTED);
  ctx.doc.text('RUNNING ORDER', MARGIN.left, baseline(ctx.y, 9), { charSpace: 0.6 });
  ctx.y += 9 * 2;

  songs.forEach((song, i) => {
    const lineH = 12 * 1.9;
    ensure(ctx, lineH);
    style(ctx, 12, 'normal', INK);
    ctx.doc.text(safe(`${i + 1}.  ${song.title}`), MARGIN.left, baseline(ctx.y, 12));

    const right = [song.toKey ? `Key of ${song.toKey}` : 'No key', song.tempo ? `${song.tempo} bpm` : '']
      .filter(Boolean)
      .join('   ·   ');
    style(ctx, 9.5, 'normal', MUTED);
    ctx.doc.text(safe(right), MARGIN.left + CONTENT_W, baseline(ctx.y, 12), { align: 'right' });
    ctx.y += lineH;
  });
}

/** Stamped down the middle of every footer, so a sheet that gets separated
 *  from the rest still says where it came from. The version is written here by
 *  hand: it names the chart format someone is reading off the stand, which
 *  isn't the web app's own release number. */
const BRAND = 'Family Christian Fellowship - Chords v1.0';

/** Footer text size. A footer is for finding a sheet again in a pile of paper
 *  — set any larger it starts competing with the chart above it. */
const FOOTER_SIZE = 6.5;

const FOOTER_Y = PAGE_H - 22;

/** Gap kept either side of the brand, so nothing reads as one run of text. */
const FOOTER_GAP = 12;

/** `text` cut down to `width` with an ellipsis, or left alone if it fits. */
function clip(doc: jsPDF, text: string, width: number): string {
  if (width <= 0) return '';
  if (doc.getTextWidth(text) <= width) return text;
  let out = text;
  while (out && doc.getTextWidth(`${out}...`) > width) out = out.slice(0, -1);
  return out ? `${out}...` : '';
}

/** Stamps the title, the brand and "n / total" along the foot of every page. */
function drawFooters(doc: jsPDF, label: string) {
  const total = doc.getNumberOfPages();
  for (let page = 1; page <= total; page++) {
    doc.setPage(page);
    doc.setFont(FONT, 'normal');
    doc.setFontSize(FOOTER_SIZE);
    doc.setTextColor(MUTED);

    doc.text(safe(BRAND), PAGE_W / 2, FOOTER_Y, { align: 'center' });
    doc.text(`${page} / ${total}`, PAGE_W - MARGIN.right, FOOTER_Y, { align: 'right' });
    // The title is the one part of a footer that can be any length, so it is
    // what gives way — cut at the brand rather than running underneath it.
    const room = PAGE_W / 2 - doc.getTextWidth(BRAND) / 2 - FOOTER_GAP - MARGIN.left;
    doc.text(safe(clip(doc, label, room)), MARGIN.left, FOOTER_Y);
  }
}

/* ── Public API ────────────────────────────────────────────────────────── */

const newDoc = () => new jsPDF({ unit: 'pt', format: 'a4', compress: true });

/** A filename-safe slug, falling back to `fallback` when nothing survives. */
export function slug(text: string, fallback = 'chart'): string {
  const out = text
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .toLowerCase();
  return out || fallback;
}

/** One song as its own document. */
export function songPdf(song: PdfSong): jsPDF {
  const doc = newDoc();
  const ctx = newCtx(doc);
  drawSong(ctx, { ...song, index: undefined });
  drawFooters(doc, song.title);
  return doc;
}

/**
 * A whole setlist as one document: a running-order cover, then every song
 * starting on a page of its own and flowing onto as many as it needs.
 */
export function setlistPdf(cover: Cover, songs: PdfSong[]): jsPDF {
  const doc = newDoc();
  const ctx = newCtx(doc);

  drawCover(ctx, cover, songs);

  songs.forEach((song, i) => {
    newPage(ctx);
    drawSong(ctx, { ...song, index: i + 1 });
  });

  drawFooters(doc, cover.subtitle ? `${cover.title} · ${cover.subtitle}` : cover.title);
  return doc;
}

/** Downloads one song as its own PDF. */
export function downloadSongPdf(song: PdfSong) {
  songPdf(song).save(`${slug(song.title, 'song')}.pdf`);
}

/** Downloads a setlist as a single PDF, a song per page. */
export function downloadSetlistPdf(cover: Cover, songs: PdfSong[]) {
  setlistPdf(cover, songs).save(`${slug(cover.title, 'setlist')}.pdf`);
}

/* ── Printing ──────────────────────────────────────────────────────────── */

/** The frame the last print went through, kept alive until the next one: pull
 *  it out from under the viewer and the dialog goes with it. */
let printFrame: HTMLIFrameElement | null = null;

/**
 * Hands a document to the browser's print dialog.
 *
 * The page itself is never printed. What is on screen is a reading view — nav,
 * transpose controls, whatever width the window happens to be — and printing
 * it means print output that drifts from the downloaded file every time either
 * one changes. Printing the PDF instead makes them the same artifact by
 * construction: one layout, one typeface, one set of page breaks.
 *
 * The document loads in an offscreen frame rather than a new tab, which a popup
 * blocker would stop — the download is built asynchronously, so by the time
 * there is anything to show, the click that asked for it is long over.
 */
function printPdf(doc: jsPDF) {
  // Opens the dialog as soon as the viewer has the file; contentWindow.print()
  // below covers the viewers that ignore the open action.
  doc.autoPrint();

  const frame = document.createElement('iframe');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
  frame.src = doc.output('bloburl').toString();
  frame.onload = () => {
    try {
      frame.contentWindow?.print();
    } catch {
      // A viewer that won't be driven from script raises its own dialog.
    }
  };

  if (printFrame) {
    URL.revokeObjectURL(printFrame.src);
    printFrame.remove();
  }
  printFrame = frame;
  document.body.appendChild(frame);
}

/** Prints one song — the same document `downloadSongPdf` would have saved. */
export function printSongPdf(song: PdfSong) {
  printPdf(songPdf(song));
}

/** Prints a setlist — the same document `downloadSetlistPdf` would have saved. */
export function printSetlistPdf(cover: Cover, songs: PdfSong[]) {
  printPdf(setlistPdf(cover, songs));
}
