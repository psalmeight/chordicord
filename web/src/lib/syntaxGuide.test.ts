import { describe, expect, it } from 'vitest';
import { lyricRuns, parseSong } from '@/lib/chordpro';
import { RULES } from '@/components/ChartSyntaxGuide';

/**
 * The guide renders each example through the real ChordChart, so it can never
 * show output the renderer wouldn't produce. What it *can* do is show output
 * that misses the point — an example whose lines the parser folds together, or
 * one that quietly stops demonstrating its rule after a parser change. These
 * pin each example to the thing it's there to teach.
 */
const rule = (source: string) => {
  const found = RULES.find((r) => r.source === source);
  if (!found) throw new Error(`the guide no longer has the example: ${JSON.stringify(source)}`);
  return parseSong(found.source).lines;
};

const types = (source: string) => rule(source).map((l) => l.type);

describe('chart syntax guide', () => {
  it('shows something for every example but the comment', () => {
    for (const r of RULES) {
      const lines = parseSong(r.source).lines;
      if (r.hidden) expect(lines, r.source).toHaveLength(0);
      else expect(lines.length, r.source).toBeGreaterThan(0);
    }
  });

  it('hangs the chord row over the lyric it sits above', () => {
    const lines = rule('G                  C\nAmazing grace how sweet');
    // One rendered line, not two: the chords are anchored onto the lyric.
    expect(lines.map((l) => l.type)).toEqual(['lyrics']);
    expect(JSON.stringify(lines)).toMatch(/"chord":"G"/);
    expect(JSON.stringify(lines)).toMatch(/"chord":"C"/);
  });

  it('anchors inline chords to the syllable after them', () => {
    expect(types('[G]Amazing [C]grace')).toEqual(['lyrics']);
    expect(JSON.stringify(rule('[G]Amazing [C]grace'))).toMatch(/"chord":"G"/);
  });

  it('keeps a bar line as chords — bars and all — with its cue marked red', () => {
    const line = rule('| G | C | G | D |    *2x*')[0];
    expect(line.type).toBe('chords');
    // The caption promises the row is kept exactly as written, so the bars
    // have to survive: they used to be dropped by the tokenizer.
    const tokens = line.type === 'chords' ? line.chords : [];
    expect(tokens.map((t) => t.text).join(' ')).toBe('| G | C | G | D | 2x');
    expect(tokens.some((t) => t.note)).toBe(true);
  });

  it('marks a cue inside a lyric red', () => {
    const line = rule('Amazing *softly* grace')[0];
    expect(line.type).toBe('lyrics');
    const runs = lyricRuns(line.type === 'lyrics' ? line.pairs : []).flat();
    expect(runs.some((r) => r.note && r.text === 'softly')).toBe(true);
  });

  it('reads a section header', () => {
    expect(types('{Verse 1}')).toEqual(['section']);
  });

  it('sizes ## above ### above ####', () => {
    const lines = rule('## Big text\n### A size down\n#### Smaller again');
    expect(lines.map((l) => l.type)).toEqual(['heading', 'heading', 'heading']);
    expect(lines.map((l) => (l.type === 'heading' ? l.level : 0))).toEqual([2, 3, 4]);
  });

  it('renders the blink example as a blinking cue, not literal carets', () => {
    const line = rule('Amazing ^^watch me^^ grace')[0];
    expect(line.type).toBe('lyrics');
    const runs = lyricRuns(line.type === 'lyrics' ? line.pairs : []).flat();
    expect(runs.some((r) => r.blink && r.text === 'watch me')).toBe(true);
    expect(runs.map((r) => r.text).join('')).toBe('Amazing watch me grace');
  });
});
