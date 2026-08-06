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
 */

import { jsPDF } from 'jspdf';
import { lyricRuns, parseSong, transposeSong, type Line, type TextRun } from './chordpro';
import { sectionKey } from './noteColors';
import type { NoteCard } from '@/types';

/* ── Page geometry, in points ───────────────────────────────────────────── */

const PAGE_W = 595.28; // A4 portrait
const PAGE_H = 841.89;
const MARGIN = { top: 46, right: 40, bottom: 46, left: 40 };
const CONTENT_W = PAGE_W - MARGIN.left - MARGIN.right;
const PAGE_BOTTOM = PAGE_H - MARGIN.bottom;

/* ── Palette, tracking the on-screen theme ─────────────────────────────── */

const INK = '#141a22';
const MUTED = '#5d564e';
const RULE = '#dfd8cc';
const BLUE = '#2563eb'; // chords and section headers
const RED = '#c0392b'; // author's notes

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
}

/* ── Drawing context ───────────────────────────────────────────────────── */

interface Ctx {
  doc: jsPDF;
  /** Top of the next block. */
  y: number;
}

type Weight = 'normal' | 'bold' | 'italic' | 'bolditalic';

function style(ctx: Ctx, size: number, weight: Weight, color: string) {
  ctx.doc.setFont('helvetica', weight);
  ctx.doc.setFontSize(size);
  ctx.doc.setTextColor(color);
}

/** Width of `text` in the font that is currently set. */
const widthOf = (ctx: Ctx, text: string) => (text ? ctx.doc.getTextWidth(text) : 0);

/** Baseline for a line of `size` whose top sits at `top`. */
const baseline = (top: number, size: number) => top + size * 0.8;

function newPage(ctx: Ctx) {
  ctx.doc.addPage();
  ctx.y = MARGIN.top;
}

/** Starts a new page unless `height` still fits under the current one. */
function ensure(ctx: Ctx, height: number) {
  if (ctx.y > MARGIN.top && ctx.y + height > PAGE_BOTTOM) newPage(ctx);
}

/** Space left on the page below the cursor. */
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
  const textW = CONTENT_W - CARD_BAR - CARD_PAD_X * 2;

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
    ctx.doc.rect(MARGIN.left, ctx.y, CONTENT_W, h, 'F');
    ctx.doc.setFillColor(c.border);
    ctx.doc.rect(MARGIN.left, ctx.y, CARD_BAR, h, 'F');

    style(ctx, size, 'normal', c.fg);
    chunk.forEach((line, i) => {
      ctx.doc.text(line, MARGIN.left + CARD_BAR + CARD_PAD_X, baseline(ctx.y + CARD_PAD_Y + i * lineH, size));
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
  runs: TextRun[];
  width: number;
  chordWidth: number;
}

/** Gap kept to the right of a chord so neighbouring chords never touch. */
const CHORD_PAD = 5;
/** Gap between tokens on a bar-chart row. */
const TOKEN_GAP = 9;

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

  const push = (chord: string, chordNote: boolean, text: TextRun[]) => {
    style(ctx, chordSize, chordNote ? 'bolditalic' : 'bold', BLUE);
    const chordWidth = chord ? widthOf(ctx, chord) + CHORD_PAD : 0;
    cells.push({
      chord,
      chordNote,
      runs: text,
      chordWidth,
      width: Math.max(chordWidth, runsWidth(ctx, text, size)),
    });
  };

  line.pairs.forEach((pair, i) => {
    const text = runs[i];
    if (pair.chord) {
      push(pair.chord, !!pair.note, text);
      return;
    }
    // Words keep their trailing space, so the gap between them survives the
    // split and the line reads exactly as written.
    for (const run of text) {
      for (const word of run.text.match(/\S+\s*|\s+/g) ?? []) {
        push('', false, [{ text: word, note: run.note }]);
      }
    }
  });

  return cells;
}

function drawCellRow(ctx: Ctx, row: Cell[], size: number, chordSize: number, showChords: boolean) {
  const hasChord = showChords && row.some((c) => c.chord);
  const chordH = hasChord ? chordSize * 1.25 : 0;
  const lyricH = size * 1.3;

  ensure(ctx, chordH + lyricH);

  let x = MARGIN.left;
  for (const cell of row) {
    if (hasChord && cell.chord) {
      style(ctx, chordSize, cell.chordNote ? 'bolditalic' : 'bold', cell.chordNote ? RED : BLUE);
      ctx.doc.text(safe(cell.chord), x, baseline(ctx.y, chordSize));
    }
    let lx = x;
    for (const run of cell.runs) {
      style(ctx, size, run.note ? 'bolditalic' : 'normal', run.note ? RED : INK);
      ctx.doc.text(safe(run.text), lx, baseline(ctx.y + chordH, size));
      lx += widthOf(ctx, run.text);
    }
    x += cell.width;
  }

  ctx.y += chordH + lyricH;
}

function drawLyricLine(ctx: Ctx, line: Extract<Line, { type: 'lyrics' }>, size: number, chordSize: number, showChords: boolean) {
  const cells = lyricCells(ctx, line, size, chordSize);
  if (!cells.length) {
    ctx.y += size * 1.3;
    return;
  }

  let row: Cell[] = [];
  let rowW = 0;
  for (const cell of cells) {
    if (row.length && rowW + cell.width > CONTENT_W) {
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
  let x = MARGIN.left;
  ensure(ctx, lineH);

  for (const token of line.chords) {
    style(ctx, chordSize, token.note ? 'bolditalic' : 'bold', token.note ? RED : BLUE);
    const w = widthOf(ctx, token.text);
    if (x > MARGIN.left && x + w > MARGIN.left + CONTENT_W) {
      ctx.y += lineH;
      ensure(ctx, lineH);
      x = MARGIN.left;
      style(ctx, chordSize, token.note ? 'bolditalic' : 'bold', token.note ? RED : BLUE);
    }
    ctx.doc.text(safe(token.text), x, baseline(ctx.y, chordSize));
    x += w + TOKEN_GAP;
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
  ctx.doc.text(safe(name.toUpperCase()), MARGIN.left, baseline(ctx.y, s), { charSpace: 0.6 });
  ctx.y += lineH;
}

function drawChart(ctx: Ctx, song: PdfSong) {
  const size = song.fontSize ?? 11;
  const chordSize = size * 0.94;
  const showChords = song.showChords !== false;
  const parsed = transposeSong(parseSong(song.content), song.fromKey, song.toKey);
  const sections = groupSectionNotes(song.noteCards);
  const shown = new Set<string>();

  parsed.lines.forEach((line, i) => {
    switch (line.type) {
      case 'blank':
        ctx.y += size * 0.7;
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
        // "## text" / "### text" — oversized bold lines, matching the chart.
        const hs = size * (line.level === 2 ? 1.5 : 1.25);
        const lineH = hs * 1.4;
        ensure(ctx, lineH);
        style(ctx, hs, 'bold', INK);
        ctx.doc.text(safe(line.text), MARGIN.left, baseline(ctx.y + 2, hs));
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

interface Cover {
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

/** Stamps "label — n / total" along the foot of every page. */
function drawFooters(doc: jsPDF, label: string) {
  const total = doc.getNumberOfPages();
  for (let page = 1; page <= total; page++) {
    doc.setPage(page);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(MUTED);
    doc.text(safe(label), MARGIN.left, PAGE_H - 22);
    doc.text(`${page} / ${total}`, PAGE_W - MARGIN.right, PAGE_H - 22, { align: 'right' });
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
  const ctx: Ctx = { doc, y: MARGIN.top };
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
  const ctx: Ctx = { doc, y: MARGIN.top };

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
