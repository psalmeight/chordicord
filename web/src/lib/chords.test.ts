import { describe, expect, it } from 'vitest';
import { capoKey, parseChord, signedSemitones, transposeChord, transposeChordToKey } from './chords';
import { hasChords, parseSong, toChordPro, transposeContent, transposeSong } from './chordpro';

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
});

describe('transposeChord', () => {
  it('shifts by semitones', () => {
    expect(transposeChord('C', 2, false)).toBe('D');
    expect(transposeChord('Am7', 3, false)).toBe('Cm7');
  });

  it('transposes the bass of a slash chord too', () => {
    expect(transposeChord('G/B', 2, false)).toBe('A/C#');
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

  it('recognises chord-only lines', () => {
    expect(parseSong('| G | Em7 | C |').lines[0]).toEqual({
      type: 'chords',
      chords: ['G', 'Em7', 'C'],
    });
  });
});

describe('transposeSong', () => {
  const source = ['{Verse 1}', '| G | D |', '[G]Amazing [D/F#]grace'].join('\n');

  it('transposes every chord and leaves lyrics alone', () => {
    const out = toChordPro(transposeSong(parseSong(source), 'G', 'A'));
    expect(out).toBe(['{Verse 1}', 'A E', '[A]Amazing [E/G#]grace'].join('\n'));
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
