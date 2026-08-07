import { describe, expect, it } from 'vitest';
import { capoKey, parseChord, signedSemitones, transposeChord, transposeChordToKey } from './chords';
import {
  hasChords, hasInlineChords, lyricRuns, parseSong, punctRuns, toAligned, toChordPro,
  transposeContent, transposeSong,
} from './chordpro';

/** A chord row of plain chords, the shape parseSong produces. */
const row = (...names: string[]) => ({
  type: 'chords',
  chords: names.map((text) => ({ text, note: false })),
});

describe('parseChord', () => {
  it('parses roots, suffixes and slash basses', () => {
    expect(parseChord('G')).toEqual({ root: 'G', suffix: '', bass: null });
    expect(parseChord('F#m7')).toEqual({ root: 'F#', suffix: 'm7', bass: null });
    expect(parseChord('Cmaj7#11')).toEqual({ root: 'C', suffix: 'maj7#11', bass: null });
    expect(parseChord('G/B')).toEqual({ root: 'G', suffix: '', bass: 'B' });
    expect(parseChord('Bbsus4/F')).toEqual({ root: 'Bb', suffix: 'sus4', bass: 'F' });
  });

  it('rejects lyric words that start with a note letter', () => {
    expect(parseChord('Grace')).toBeNull();
    expect(parseChord('Bad')).toBeNull();
    expect(parseChord('Every')).toBeNull();
  });

  it('unwraps an implied chord in parens', () => {
    expect(parseChord('(C)')).toEqual({ root: 'C', suffix: '', bass: null });
    expect(parseChord('(Bm7)')).toEqual({ root: 'B', suffix: 'm7', bass: null });
    expect(parseChord('(Am7/D)')).toEqual({ root: 'A', suffix: 'm7', bass: 'D' });
    expect(parseChord('(Grace)')).toBeNull();
    expect(parseChord('(you)')).toBeNull();
  });
});

describe('transposeChord', () => {
  it('shifts by semitones', () => {
    expect(transposeChord('C', 2, false)).toBe('D');
    expect(transposeChord('Am7', 3, false)).toBe('Cm7');
  });

  it('transposes the bass of a slash chord too', () => {
    expect(transposeChord('G/B', 2, false)).toBe('A/C#');
  });

  it('transposes an implied chord and keeps its parens', () => {
    expect(transposeChord('(C)', 2, false)).toBe('(D)');
    expect(transposeChord('(Am7/D)', 2, false)).toBe('(Bm7/E)');
  });

  it('wraps around the octave', () => {
    expect(transposeChord('B', 1, false)).toBe('C');
  });
});

describe('transposeChordToKey', () => {
  it('spells flat keys with flats', () => {
    // C -> Eb is +3. A# would be wrong here; Bb is how the key is written.
    expect(transposeChordToKey('G', 'C', 'Eb')).toBe('Bb');
    expect(transposeChordToKey('Am', 'C', 'Eb')).toBe('Cm');
  });

  it('spells sharp keys with sharps', () => {
    expect(transposeChordToKey('C', 'C', 'D')).toBe('D');
    expect(transposeChordToKey('A', 'C', 'D')).toBe('B');
    expect(transposeChordToKey('G', 'C', 'A')).toBe('E');
  });

  it('is a no-op when the key is unchanged', () => {
    expect(transposeChordToKey('F#m7b5', 'G', 'G')).toBe('F#m7b5');
  });

  it('round-trips back to the original key', () => {
    const original = 'Cmaj7';
    const moved = transposeChordToKey(original, 'C', 'F#');
    expect(transposeChordToKey(moved, 'F#', 'C')).toBe(original);
  });
});

describe('capoKey', () => {
  it('gives the shapes a capo\'d player fingers', () => {
    expect(capoKey('D', 2)).toBe('C');
    expect(capoKey('Eb', 1)).toBe('D');
    expect(capoKey('G', 0)).toBe('G');
  });
});

describe('parseSong', () => {
  it('splits inline chords from lyrics', () => {
    const song = parseSong('[G]Amazing [C]grace');
    expect(song.lines[0]).toEqual({
      type: 'lyrics',
      pairs: [
        { chord: 'G', lyric: 'Amazing ' },
        { chord: 'C', lyric: 'grace' },
      ],
    });
  });

  it('keeps lyrics before the first chord', () => {
    const song = parseSong('How [G]sweet');
    expect(song.lines[0]).toEqual({
      type: 'lyrics',
      pairs: [
        { chord: '', lyric: 'How ' },
        { chord: 'G', lyric: 'sweet' },
      ],
    });
  });

  it('recognises section headers in both styles', () => {
    expect(parseSong('{Verse 1}').lines[0]).toEqual({ type: 'section', name: 'Verse 1' });
    expect(parseSong('Chorus:').lines[0]).toEqual({ type: 'section', name: 'Chorus' });
  });

  it('recognises chord-only lines, bars and all', () => {
    expect(parseSong('| G | Em7 | C |').lines[0]).toEqual(
      row('|', 'G', '|', 'Em7', '|', 'C', '|'),
    );
  });

  it('reads ## and ### as heading lines, and a single # as a comment', () => {
    expect(parseSong('## Final Chorus').lines[0]).toEqual({
      type: 'heading',
      text: 'Final Chorus',
      level: 2,
    });
    expect(parseSong('###quiet ending').lines[0]).toEqual({
      type: 'heading',
      text: 'quiet ending',
      level: 3,
    });
    expect(parseSong('# just a comment').lines).toEqual([]);
    expect(parseSong('##').lines).toEqual([]);
  });

  it('keeps headings out of chords, transposition and alignment', () => {
    expect(hasChords('## A B C')).toBe(false);
    expect(transposeContent('## A little while', 'G', 'A')).toBe('## A little while');
    expect(toAligned('## Big line')).toBe('## Big line');
    const song = parseSong('## Final Chorus');
    expect(parseSong(toChordPro(song)).lines).toEqual(song.lines);
  });
});

describe('parseSong with chords written above the lyric', () => {
  /** The two spellings of the same chart, plus its inline equivalent. */
  const bare = ['      G          C', 'Amazing grace how sweet'].join('\n');
  const bracketed = ['      [G]        [C]', 'Amazing grace how sweet'].join('\n');
  const inline = '[G]Amazing grace [C]how sweet';

  it('anchors each chord to the column it sits over', () => {
    //         col 6 ─┘          └─ col 17
    expect(parseSong(bare).lines).toEqual([
      {
        type: 'lyrics',
        pairs: [
          { chord: '', lyric: 'Amazin' },
          { chord: 'G', lyric: 'g grace how' },
          { chord: 'C', lyric: ' sweet' },
        ],
      },
    ]);
  });

  it('reads the bracketed spelling identically to the bare one', () => {
    expect(parseSong(bracketed).lines).toEqual(parseSong(bare).lines);
  });

  it('produces the same pairs the inline form would', () => {
    // "how" begins at column 14, which is where [C] sits in the inline form.
    const aligned = ['G             C', 'Amazing grace how sweet'].join('\n');
    expect(parseSong(aligned).lines).toEqual(parseSong(inline).lines);
  });

  it('keeps a bar chart standalone rather than eating the lyric under it', () => {
    const song = parseSong(['| G | C |', 'Amazing grace'].join('\n'));
    expect(song.lines).toEqual([
      row('|', 'G', '|', 'C', '|'),
      { type: 'lyrics', pairs: [{ chord: '', lyric: 'Amazing grace' }] },
    ]);
  });

  it('does not mistake a title line for chords over the lyric', () => {
    // "Amazing Grace" is two words that happen to start with note letters.
    const song = parseSong(['Amazing Grace', 'how sweet the sound'].join('\n'));
    expect(song.lines).toEqual([
      { type: 'lyrics', pairs: [{ chord: '', lyric: 'Amazing Grace' }] },
      { type: 'lyrics', pairs: [{ chord: '', lyric: 'how sweet the sound' }] },
    ]);
  });

  it('leaves a chord line alone when the next line is not a lyric', () => {
    expect(parseSong(['G  C', '', 'Amazing'].join('\n')).lines[0]).toEqual(row('G', 'C'));
    expect(parseSong(['G  C', '{Verse 1}'].join('\n')).lines[0]).toEqual(row('G', 'C'));
  });

  it('will not stack a chord line onto a lyric that already has inline chords', () => {
    const song = parseSong(['G  C', '[D]Amazing grace'].join('\n'));
    expect(song.lines[0]).toEqual(row('G', 'C'));
    expect(song.lines[1]).toEqual({ type: 'lyrics', pairs: [{ chord: 'D', lyric: 'Amazing grace' }] });
  });

  it('keeps a chord hanging past the end of the lyric', () => {
    const song = parseSong(['C        G', 'Amazing'].join('\n'));
    expect(song.lines[0]).toEqual({
      type: 'lyrics',
      pairs: [
        { chord: 'C', lyric: 'Amazing' },
        { chord: 'G', lyric: '' },
      ],
    });
  });

  it('lets a chart mix both notations', () => {
    const song = parseSong(['     C', 'Amazing grace', '[G]how sweet'].join('\n'));
    expect(song.lines).toEqual([
      {
        type: 'lyrics',
        pairs: [
          { chord: '', lyric: 'Amazi' },
          { chord: 'C', lyric: 'ng grace' },
        ],
      },
      { type: 'lyrics', pairs: [{ chord: 'G', lyric: 'how sweet' }] },
    ]);
  });

  it('counts anchored chords for hasChords', () => {
    expect(hasChords(bare)).toBe(true);
    expect(hasChords(bracketed)).toBe(true);
  });
});

describe('implied chords in parens', () => {
  it('reads a bar row opening with an implied chord as chords', () => {
    expect(parseSong('(C) |Bm7 Bm/E Am7 Am7/D|').lines[0]).toEqual({
      type: 'chords',
      chords: [
        { text: '(C)', note: false },
        { text: '|', note: false },
        { text: 'Bm7', note: false },
        { text: 'Bm/E', note: false },
        { text: 'Am7', note: false },
        { text: 'Am7/D', note: false },
        { text: '|', note: false },
      ],
    });
  });

  it('anchors a bare row opening with an implied chord onto the lyric below', () => {
    const song = parseSong(['(C) Bsus4 B/D# E7', ' in    you'].join('\n'));
    expect(song.lines[0]).toEqual({
      type: 'lyrics',
      pairs: [
        { chord: '(C)', lyric: ' in ' },
        { chord: 'Bsus4', lyric: '   you' },
        { chord: 'B/D#', lyric: '' },
        { chord: 'E7', lyric: '' },
      ],
    });
  });

  it('still reads a parenthesised lyric line as lyrics', () => {
    expect(parseSong('(All) Good Days').lines[0].type).toBe('lyrics');
    expect(parseSong('(oh oh oh)').lines[0].type).toBe('lyrics');
  });

  it('transposes implied chords in content, keeping the parens', () => {
    expect(transposeContent('(C) |Bm7 Bm/E Am7 Am7/D|', 'D', 'E')).toBe(
      '(D) |C#m7 C#m/F# Bm7 Bm7/E|',
    );
  });
});

describe('bracketed bar phrases', () => {
  it('transposes every chord inside a bracketed bar line', () => {
    const song = transposeSong(parseSong('[|  D  |  G  | Em7 A |  A  |]'), 'D', 'E');
    expect(song.lines[0]).toEqual({
      type: 'chords',
      chords: [{ text: '|  E  |  A  | F#m7 B |  B  |', note: false }],
    });
  });

  it('transposes a bracketed bar phrase inline in a lyric', () => {
    const song = transposeSong(parseSong('kasing-kasing[| D  A |]  ko'), 'D', 'E');
    expect(song.lines[0]).toEqual({
      type: 'lyrics',
      pairs: [
        { chord: '', lyric: 'kasing-kasing' },
        { chord: '| E  B |', lyric: '  ko' },
      ],
    });
  });
});

describe('notes written *like this*', () => {
  const runsOf = (src: string) => {
    const line = parseSong(src).lines[0];
    if (line.type !== 'lyrics') throw new Error('expected a lyric line');
    return lyricRuns(line.pairs).flat();
  };

  it('marks a note inside a lyric and drops the asterisks', () => {
    expect(runsOf('Amazing *softly* grace')).toEqual([
      { text: 'Amazing ', note: false },
      { text: 'softly', note: true },
      { text: ' grace', note: false },
    ]);
  });

  it('closes a note that straddles a chord', () => {
    expect(runsOf('[G]hold *this [C]whole* bar')).toEqual([
      { text: 'hold ', note: false },
      { text: 'this ', note: true },
      { text: 'whole', note: true },
      { text: ' bar', note: false },
    ]);
  });

  it('leaves a lone asterisk as ordinary text', () => {
    expect(runsOf('a * b')).toEqual([{ text: 'a * b', note: false }]);
  });

  it('sits on a chord row without stopping it being one', () => {
    const song = parseSong(['G      *hold*      C', 'Amazing grace how sweet'].join('\n'));
    expect(song.lines[0]).toEqual({
      type: 'lyrics',
      pairs: [
        { chord: 'G', lyric: 'Amazing' },
        { chord: 'hold', lyric: ' grace how s', note: true },
        { chord: 'C', lyric: 'weet' },
      ],
    });
  });

  it('anchors a row of nothing but notes to the lyric below it', () => {
    const song = parseSong(['     *softly*', 'Amazing grace'].join('\n'));
    expect(song.lines[0]).toEqual({
      type: 'lyrics',
      pairs: [
        { chord: '', lyric: 'Amazi' },
        { chord: 'softly', lyric: 'ng grace', note: true },
      ],
    });
  });

  it('stands on its own line when no lyric follows', () => {
    expect(parseSong(['*Repeat 2x*', '', '{Chorus}'].join('\n')).lines[0]).toEqual({
      type: 'chords',
      chords: [{ text: 'Repeat 2x', note: true }],
    });
  });

  it('rides along on a bar chart', () => {
    expect(parseSong('| G | C |  *2x*').lines[0]).toEqual({
      type: 'chords',
      chords: [
        { text: '|', note: false },
        { text: 'G', note: false },
        { text: '|', note: false },
        { text: 'C', note: false },
        { text: '|', note: false },
        { text: '2x', note: true },
      ],
    });
  });

  it('is not counted as a chord', () => {
    expect(hasChords('*Repeat 2x*')).toBe(false);
    expect(hasChords(['*softly*', 'Amazing grace'].join('\n'))).toBe(false);
    expect(hasChords(['G  *softly*', 'Amazing grace'].join('\n'))).toBe(true);
  });

  it('is never transposed, even when it reads like a chord', () => {
    expect(transposeContent(['G  *capo 2, A shapes*', 'Amazing grace'].join('\n'), 'G', 'Bb')).toBe(
      ['Bb *capo 2, A shapes*', 'Amazing grace'].join('\n'),
    );
    expect(transposeContent('| G | C |  *hold the D*', 'G', 'Bb')).toBe('| Bb | Eb |  *hold the D*');
    expect(transposeContent('[G]Amazing *stay on G* grace', 'G', 'Bb')).toBe(
      '[Bb]Amazing *stay on G* grace',
    );
  });

  it('holds its column when a chord beside it is transposed', () => {
    const src = ['G     *hold*     C', 'Amazing grace how sweet'].join('\n');
    expect(transposeContent(src, 'G', 'Bb').split('\n')[0]).toBe('Bb    *hold*     Eb');
  });

  it('survives a round trip through toChordPro', () => {
    const song = parseSong(['G      *hold*', 'Amazing grace'].join('\n'));
    expect(parseSong(toChordPro(song)).lines).toEqual(song.lines);
  });
});

describe('toAligned', () => {
  it('lifts inline chords onto their own line at the right columns', () => {
    expect(toAligned('[G]Amazing grace [C]how sweet')).toBe(
      ['G             C', 'Amazing grace how sweet'].join('\n'),
    );
  });

  it('indents past lyrics that come before the first chord', () => {
    expect(toAligned('How [G]sweet')).toBe(['    G', 'How sweet'].join('\n'));
  });

  it('leaves bar charts, headers, comments and plain lyrics untouched', () => {
    const src = ['# Capo 2', '{Verse 1}', '| G | C |', 'Amazing grace'].join('\n');
    expect(toAligned(src)).toBe(src);
  });

  it('round-trips: the aligned chart parses to the pairs it came from', () => {
    const src = '[Am7]Once was [D/F#]lost but [G]now am found';
    expect(parseSong(toAligned(src)).lines).toEqual(parseSong(src).lines);
  });

  it('nudges right rather than overlapping when a chord outgrows its slot', () => {
    // "Cmaj7#11" is wider than the syllable under it, so "D" cannot start at
    // its own column — one space is the most it can give up.
    expect(toAligned('[Cmaj7#11]Oh [D]no')).toBe(['Cmaj7#11 D', 'Oh no'].join('\n'));
  });

  it('falls back to brackets when a bare row would not read back as chords', () => {
    // N.C. is not a chord parseChord accepts, so a bare row would be read as
    // a lyric on the way back in.
    const out = toAligned('[N.C.]Silent [G]night');
    expect(out).toBe(['[N.C.] [G]', 'Silent night'].join('\n'));
    expect(parseSong(out).lines).toEqual(parseSong('[N.C.]Silent [G]night').lines);
  });

  it('is idempotent', () => {
    const once = toAligned('[G]Amazing grace [C]how sweet');
    expect(toAligned(once)).toBe(once);
  });
});

describe('hasInlineChords', () => {
  it('spots charts that still have something to convert', () => {
    expect(hasInlineChords('[G]Amazing grace')).toBe(true);
    expect(hasInlineChords(['G', 'Amazing grace'].join('\n'))).toBe(false);
    expect(hasInlineChords('| G | C |')).toBe(false);
    expect(hasInlineChords('Amazing grace')).toBe(false);
  });
});

describe('heading levels', () => {
  const level = (s: string) => {
    const line = parseSong(s).lines[0];
    return line.type === 'heading' ? line.level : null;
  };

  it('steps ## down to ####', () => {
    expect(level('## Biggest')).toBe(2);
    expect(level('### Middle')).toBe(3);
    expect(level('#### Smallest')).toBe(4);
  });

  it('bottoms out rather than shrinking away to nothing', () => {
    expect(level('##### deeper')).toBe(4);
    expect(level('######## deeper still')).toBe(4);
  });

  it('still reads a single # as a comment', () => {
    expect(parseSong('# not a heading').lines).toEqual([]);
  });

  it('writes each level back out at its own depth', () => {
    const source = ['## Two', '### Three', '#### Four'].join('\n');
    expect(toChordPro(parseSong(source))).toBe(source);
  });
});

/** The rendered runs of a one-line lyric, the way ChordChart resolves them. */
const runsOf = (source: string) => {
  const line = parseSong(source).lines[0];
  return lyricRuns(line?.type === 'lyrics' ? line.pairs : []).flat();
};

describe('^^blinking cues^^', () => {
  it('marks a cue in a lyric as blinking, without the carets', () => {
    expect(runsOf('Amazing ^^watch me^^ grace')).toEqual([
      { text: 'Amazing ', note: false },
      { text: 'watch me', note: true, blink: true },
      { text: ' grace', note: false },
    ]);
  });

  it('marks one on a chord row, and is never taken for a chord', () => {
    const line = parseSong('G      ^^watch^^      C').lines[0];
    expect(line).toEqual({
      type: 'chords',
      chords: [
        { text: 'G', note: false },
        { text: 'watch', note: true, blink: true },
        { text: 'C', note: false },
      ],
    });
    expect(hasChords('^^watch^^')).toBe(false);
  });

  it('anchors over a lyric like a note does', () => {
    const song = parseSong(['^^loud^^', 'Amazing grace'].join('\n'));
    expect(song.lines).toEqual([
      {
        type: 'lyrics',
        pairs: [{ chord: 'loud', lyric: 'Amazing grace', note: true, blink: true }],
      },
    ]);
  });

  it('survives a round trip through the writer', () => {
    for (const source of ['| G | ^^2x^^ |', '## ^^Watch^^']) {
      expect(toChordPro(parseSong(source))).toBe(source);
    }
  });

  it('keeps its words out of a transposition', () => {
    // "G" inside the cue is prose, not a chord to move.
    expect(transposeContent('[C]Amazing ^^G is next^^ grace', 'C', 'D')).toBe(
      '[D]Amazing ^^G is next^^ grace',
    );
  });

  it('leaves a lone or unclosed caret as literal text', () => {
    const runs = runsOf('2^4 and ^^never closed');
    expect(runs.map((r) => r.text).join('')).toBe('2^4 and ^^never closed');
    expect(runs.some((r) => r.blink)).toBe(false);
  });
});

describe('punctRuns', () => {
  const shape = (text: string) =>
    punctRuns(text).map((r) => (r.punct ? `<${r.text}>` : r.text)).join('');

  it('marks off bars, dashes and brackets', () => {
    expect(shape('| G | C |')).toBe('<|> G <|> C <|>');
    expect(shape('(C)')).toBe('<(>C<)>');
    expect(shape('G - C')).toBe('G <-> C');
  });

  it('leaves text with nothing structural in it as one run', () => {
    expect(punctRuns('Amazing grace')).toEqual([{ text: 'Amazing grace', punct: false }]);
    expect(punctRuns('Em7')).toEqual([{ text: 'Em7', punct: false }]);
  });

  it('keeps a slash bass intact — it names the chord, it is not scaffolding', () => {
    expect(punctRuns('E/G#')).toEqual([{ text: 'E/G#', punct: false }]);
  });

  it('runs of punctuation stay together, and every character survives', () => {
    for (const s of ['| G | C |', '(C)', 'Ama-zing (oh)', '|| A ||', '']) {
      expect(punctRuns(s).map((r) => r.text).join('')).toBe(s);
    }
    expect(punctRuns('|| A ||')[0]).toEqual({ text: '||', punct: true });
  });
});

describe('transposeSong', () => {
  const source = ['{Verse 1}', '| G | D |', '[G]Amazing [D/F#]grace'].join('\n');

  it('transposes every chord and leaves lyrics and bars alone', () => {
    const out = toChordPro(transposeSong(parseSong(source), 'G', 'A'));
    expect(out).toBe(['{Verse 1}', '| A | E |', '[A]Amazing [E/G#]grace'].join('\n'));
  });

  it('round-trips through an arbitrary key without drift', () => {
    const parsed = parseSong(source);
    const there = transposeSong(parsed, 'G', 'Bb');
    const back = transposeSong(there, 'Bb', 'G');
    expect(toChordPro(back)).toBe(toChordPro(parsed));
  });
});

describe('signedSemitones', () => {
  it('takes the shortest path rather than always going up', () => {
    // The pitch shifter would make +11 sound absurd; -1 is the same key.
    expect(signedSemitones('C', 'B')).toBe(-1);
    expect(signedSemitones('C', 'Bb')).toBe(-2);
    expect(signedSemitones('G', 'F')).toBe(-2);
  });

  it('keeps upward moves upward', () => {
    expect(signedSemitones('C', 'D')).toBe(2);
    expect(signedSemitones('C', 'F')).toBe(5);
    expect(signedSemitones('C', 'C')).toBe(0);
  });

  it('resolves the tritone consistently upward', () => {
    expect(signedSemitones('C', 'F#')).toBe(6);
  });

  it('ignores minor-key suffixes', () => {
    expect(signedSemitones('Am', 'Gm')).toBe(-2);
  });
});

describe('transposeContent', () => {
  it('rewrites inline chords and leaves lyrics alone', () => {
    expect(transposeContent('[G]Amazing [C]grace how [D7]sweet', 'G', 'A')).toBe(
      '[A]Amazing [D]grace how [E7]sweet',
    );
  });

  it('preserves bar lines and column spacing on chord-only lines', () => {
    expect(transposeContent('| G | Em7 | C  D |', 'G', 'Bb')).toBe('| Bb | Gm7 | Eb  F |');
  });

  it('leaves comments and section headers untouched', () => {
    const src = '# Capo 2 on the record\n{Verse 1}\nChorus:\n[G]Grace';
    expect(transposeContent(src, 'G', 'A')).toBe('# Capo 2 on the record\n{Verse 1}\nChorus:\n[A]Grace');
  });

  it('is a no-op when the key is unknown or unchanged', () => {
    expect(transposeContent('[G]Grace', '', 'A')).toBe('[G]Grace');
    expect(transposeContent('[G]Grace', 'G', '')).toBe('[G]Grace');
    expect(transposeContent('[G]Grace', 'G', 'G')).toBe('[G]Grace');
  });

  it('round-trips back to the original key', () => {
    const src = '{Verse}\n| G | C/E |\n[Am7]Once was [D/F#]lost';
    expect(transposeContent(transposeContent(src, 'G', 'Eb'), 'Eb', 'G')).toBe(src);
  });

  it('transposes slash-chord basses with the root', () => {
    expect(transposeContent('[D/F#]lost', 'G', 'A')).toBe('[E/G#]lost');
  });

  it('holds anchored chords on their columns when the one before them widens', () => {
    // G -> Bb is a character longer, so a token-wise rewrite would push Eb to
    // column 15 and re-point it at "ow" instead of "how".
    const src = ['G             C', 'Amazing grace how sweet'].join('\n');
    const out = transposeContent(src, 'G', 'Bb');
    expect(out.split('\n')[0]).toBe(`Bb${' '.repeat(12)}Eb`);
    expect(parseSong(out).lines[0]).toMatchObject({
      pairs: [
        { chord: 'Bb', lyric: 'Amazing grace ' },
        { chord: 'Eb', lyric: 'how sweet' },
      ],
    });
  });

  it('respaces the bracketed spelling too', () => {
    expect(transposeContent(['[G]      [C]', 'Amazing grace'].join('\n'), 'G', 'A')).toBe(
      ['[A]      [D]', 'Amazing grace'].join('\n'),
    );
  });

  it('nudges a chord right rather than colliding when there is no room', () => {
    // C sits at column 2, but Bb already fills 0-1 — one space is all it can
    // give up, so the chart stays readable even though the column shifts.
    expect(transposeContent('G C', 'G', 'Bb')).toBe('Bb Eb');
  });
});

describe('hasChords', () => {
  it('distinguishes charts with chords from bare lyrics', () => {
    expect(hasChords('[G]Amazing grace')).toBe(true);
    expect(hasChords('| G | C |')).toBe(true);
    expect(hasChords('Amazing grace how sweet the sound')).toBe(false);
    expect(hasChords('')).toBe(false);
  });
});

describe('suffix validation', () => {
  it('accepts real chord qualities', () => {
    for (const c of ['C', 'Cm', 'Cmaj7', 'Cm7b5', 'Csus4', 'Cadd9', 'CmMaj7', 'C6', 'C7#9', 'Cdim7', 'C+', 'Calt']) {
      expect(parseChord(c), c).not.toBeNull();
    }
  });

  it('rejects words that merely start like a chord', () => {
    for (const w of ['Amazing', 'Alleluia', 'Grace', 'Bad', 'Endless', 'Alive', 'Are', 'Above']) {
      expect(parseChord(w), w).toBeNull();
    }
  });

  it('does not rewrite a capitalised title line', () => {
    expect(transposeContent('Amazing Grace', 'G', 'A')).toBe('Amazing Grace');
  });
});
