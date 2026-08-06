import { describe, expect, it } from 'vitest';
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

  it('survives a note card longer than a page', () => {
    const doc = songPdf(
      song({ noteCards: [{ color: 'amber', text: 'word '.repeat(4000), section: '' }] }),
    );
    expect(doc.getNumberOfPages()).toBeGreaterThan(1);
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
