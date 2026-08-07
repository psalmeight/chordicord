import { describe, expect, it } from 'vitest';
import type { jsPDF } from 'jspdf';
import { setlistPdf, slug, songPdf, type PdfSong } from './pdf';

const song = (over: Partial<PdfSong> = {}): PdfSong => ({
  title: 'Amazing Grace',
  fromKey: 'G',
  toKey: 'G',
  content: '{Verse 1}\n   G        C\nAmazing grace how sweet\n',
  ...over,
});

/** A chart long enough to need a second page whatever the exact line metrics. */
const longContent = Array.from(
  { length: 60 },
  (_, i) => `   D     A\nLine ${i} of a very long chart`,
).join('\n');

/**
 * Where each string was drawn on a page, read back out of the content stream.
 *
 * Coordinates are PDF's own — y counts up from the foot of the page — so a
 * *smaller* y is further down the sheet.
 */
function placed(doc: jsPDF, page: number): Array<{ x: number; y: number; text: string }> {
  const content = (doc as unknown as { internal: { pages: Array<string | string[]> } }).internal.pages[page];
  const raw = Array.isArray(content) ? content.join('\n') : String(content);
  return [...raw.matchAll(/([\d.]+) ([\d.]+) Td\s*\((.*?)\) Tj/g)].map((m) => ({
    x: Number(m[1]),
    y: Number(m[2]),
    text: m[3],
  }));
}

/** A chart of `count` narrow lines, each tagged so it can be found again. */
const numbered = (count: number, lyric = 'of a chart') =>
  Array.from({ length: count }, (_, i) => `   D     A\nZ${i} ${lyric}`).join('\n');

/** The tags from `numbered`, in the order they were drawn. */
const tags = (doc: jsPDF, page: number) => placed(doc, page).filter((t) => /^Z\d/.test(t.text));

describe('songPdf', () => {
  it('fits a short chart on one page', () => {
    expect(songPdf(song()).getNumberOfPages()).toBe(1);
  });

  it('flows a long chart onto further pages', () => {
    expect(songPdf(song({ content: longContent })).getNumberOfPages()).toBeGreaterThan(1);
  });

  it('renders a song with no chart at all', () => {
    expect(songPdf(song({ content: '' })).getNumberOfPages()).toBe(1);
  });

  it('sets the page in a monospace face', () => {
    const doc = songPdf(song());
    expect(doc.getFont().fontName).toBe('courier');
    // What monospace is actually for: every character advances the same width,
    // so a chart prints on the grid it was typed on.
    expect(doc.getTextWidth('MMMM')).toBe(doc.getTextWidth('ilil'));
  });

  it('survives a note card longer than a page', () => {
    const doc = songPdf(
      song({ noteCards: [{ color: 'amber', text: 'word '.repeat(4000), section: '' }] }),
    );
    expect(doc.getNumberOfPages()).toBeGreaterThan(1);
  });

});

describe('songPdf in two columns', () => {
  it('fills the first column to the foot of the page before starting the second', () => {
    const doc = songPdf(song({ content: numbered(40), columns: 2 }));
    const drawn = tags(doc, 1);
    expect(drawn.map((t) => t.text.trim())).toEqual(Array.from({ length: 40 }, (_, i) => `Z${i}`));

    // Two columns, and the tags are in reading order: everything in the left
    // one, top to bottom, and only then the right.
    const [left, right] = [...new Set(drawn.map((t) => t.x))].sort((a, b) => a - b);
    expect(right).toBeGreaterThan(left);
    const split = drawn.findIndex((t) => t.x === right);
    expect(drawn.slice(0, split).every((t) => t.x === left)).toBe(true);
    expect(drawn.slice(split).every((t) => t.x === right)).toBe(true);

    // The break is at the bottom of the page, not halfway down it: the left
    // column runs into the lower quarter, and the right one starts back level
    // with where the left began.
    const lastLeft = drawn[split - 1];
    expect(lastLeft.y).toBeLessThan(841.89 / 4);
    expect(drawn[split].y).toBe(drawn[0].y);
  });

  it('gets a chart onto one page that would take two', () => {
    expect(songPdf(song({ content: numbered(40), columns: 1 })).getNumberOfPages()).toBe(2);
    expect(songPdf(song({ content: numbered(40), columns: 2 })).getNumberOfPages()).toBe(1);
  });

  it('carries on down the next page once both columns are full', () => {
    const doc = songPdf(song({ content: numbered(140), columns: 2 }));
    expect(doc.getNumberOfPages()).toBeGreaterThan(1);
    const second = tags(doc, 2);
    // A fresh page starts back at the top margin, above where the columns on
    // the first page could start — that one had a header over them.
    expect(second[0].y).toBeGreaterThan(tags(doc, 1)[0].y);
    expect(new Set(second.map((t) => t.x)).size).toBe(2);
  });

  it('falls back to one column when the lines are too wide to fit two', () => {
    // A chorded line can't be folded in half without moving chords off their
    // syllables, so a chart this wide prints full width instead.
    const wide = numbered(20, 'of a chart with a lyric far too long to fit inside half a page');
    const doc = songPdf(song({ content: wide, columns: 2 }));
    expect(new Set(tags(doc, 1).map((t) => t.x)).size).toBe(1);
    expect(doc.getNumberOfPages()).toBe(songPdf(song({ content: wide, columns: 1 })).getNumberOfPages());
  });
});

describe('setlistPdf', () => {
  const cover = { title: 'Sunday Morning', subtitle: '3 August 2026' };

  it('starts every song on a page of its own, after the running order', () => {
    const songs = [song(), song({ title: 'Cornerstone' }), song({ title: 'Build My Life' })];
    expect(setlistPdf(cover, songs).getNumberOfPages()).toBe(songs.length + 1);
  });

  it('lets a long song take extra pages without moving the next one', () => {
    const short = setlistPdf(cover, [song(), song()]).getNumberOfPages();
    const long = setlistPdf(cover, [song({ content: longContent }), song()]).getNumberOfPages();
    expect(long).toBeGreaterThan(short);
  });

  it('handles an empty setlist', () => {
    expect(setlistPdf(cover, []).getNumberOfPages()).toBe(1);
  });
});

describe('slug', () => {
  it('makes a filename out of a title', () => {
    expect(slug('Amazing Grace (My Chains Are Gone)')).toBe('amazing-grace-my-chains-are-gone');
  });

  it('falls back when nothing usable survives', () => {
    expect(slug('«»', 'song')).toBe('song');
  });
});
