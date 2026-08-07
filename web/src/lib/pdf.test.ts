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

  it('shrinks the body rather than dropping a column', () => {
    // Lines too wide for half a page at the size that was asked for. The chart
    // is set smaller so the song still prints in the two columns it's laid out
    // in — a chorded line can't be folded in half without moving chords off
    // their syllables, so the size is what gives.
    const wide = numbered(60, 'of a chart with a lyric far too long to fit inside half a page');
    const doc = songPdf(song({ content: wide, columns: 2 }));

    const drawn = tags(doc, 1);
    expect(new Set(drawn.map((t) => t.x)).size).toBe(2);
    // Every line is still one line: shrunk to fit, never wrapped.
    expect(drawn.map((t) => t.text.trim())).toEqual(Array.from({ length: 60 }, (_, i) => `Z${i}`));
    expect(doc.getNumberOfPages()).toBe(1);
  });

  it('gives up the second column only when no readable size fits', () => {
    const absurd = numbered(4, 'of a chart '.repeat(20));
    const doc = songPdf(song({ content: absurd, columns: 2 }));
    expect(new Set(tags(doc, 1).map((t) => t.x)).size).toBe(1);
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

describe('footers', () => {
  const BRAND = 'Family Christian Fellowship - Chords v1.0';
  /** Everything stamped in the footer band, below the bottom margin. */
  const feet = (doc: jsPDF, page: number) => placed(doc, page).filter((t) => t.y < 30);

  it('stamps the brand and the page number on every page', () => {
    const doc = songPdf(song({ content: longContent }));
    const total = doc.getNumberOfPages();
    expect(total).toBeGreaterThan(1);
    for (let page = 1; page <= total; page++) {
      const texts = feet(doc, page).map((t) => t.text);
      expect(texts).toContain(BRAND);
      expect(texts).toContain(`${page} / ${total}`);
    }
  });

  it('cuts a long title short of the brand instead of running under it', () => {
    const doc = songPdf(song({ title: 'A Title Far Too Long To Sit Beside Anything Else At All' }));
    const brand = feet(doc, 1).find((t) => t.text === BRAND)!;
    const title = feet(doc, 1).find((t) => t.text.startsWith('A Title'))!;

    expect(title.text.endsWith('...')).toBe(true);
    // drawFooters leaves the footer's own font set, so this measures the title
    // in the face it was actually drawn in.
    expect(title.x + doc.getTextWidth(title.text)).toBeLessThanOrEqual(brand.x);
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
