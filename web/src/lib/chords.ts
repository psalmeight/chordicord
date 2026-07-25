/**
 * Chord parsing and transposition.
 *
 * Design rule: chords are stored exactly as written, in the song's own key.
 * Transposition is always a pure function of (stored text, from-key, to-key)
 * computed at render time. Nothing transposed is ever written back, so the
 * source of truth can't drift and any key can be reached from any other.
 */

const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLAT_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

/** Semitone offset of each natural note from C. */
const NATURALS: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/**
 * Keys conventionally spelled with flats. Everything else gets sharps.
 * This is why transposing C→Eb yields "Bb" and not "A#".
 */
const FLAT_KEYS = new Set(['F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb', 'Cb', 'Dm', 'Gm', 'Cm', 'Fm', 'Bbm', 'Ebm']);

export const KEYS = [
  'C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B',
  'Am', 'Bbm', 'Bm', 'Cm', 'C#m', 'Dm', 'Ebm', 'Em', 'Fm', 'F#m', 'Gm', 'G#m',
];

export interface ParsedChord {
  root: string;      // "C#", "Bb"
  suffix: string;    // "m7", "sus4", "maj7#11"
  bass: string | null; // slash-chord bass note
}

/**
 * Matches a chord token: root, then any suffix, then an optional /bass.
 * The suffix is deliberately permissive — real charts contain things like
 * Cmaj7#11, Aadd9, F#m7b5 — but the root and bass are strict so that words
 * in lyrics don't get mistaken for chords.
 */
const CHORD_RE = /^([A-G][#b]?)((?:[^/\s]|\/(?![A-G][#b]?(?:$|[\s/])))*)(?:\/([A-G][#b]?))?$/;

/**
 * Suffixes that are real chord qualities. Guards against lyric words like
 * "Bad" or "Ache".
 *
 * The whole suffix must be a run of chord atoms, not merely start with one:
 * anchoring only the first character let "Amazing" through as A-minor, which
 * is survivable while transposition is render-time but corrupts the chart the
 * moment a key conversion writes it back.
 */
const SUFFIX_ATOM = '(?:maj|Maj|MAJ|min|Min|sus|add|dim|aug|alt|no|m|M|°|ø|\\+|-|\\d+|#|b|\\(|\\)|,|\\^)';
const VALID_SUFFIX_RE = new RegExp(`^${SUFFIX_ATOM}*$`);

export function parseChord(token: string): ParsedChord | null {
  const match = CHORD_RE.exec(token.trim());
  if (!match) return null;

  const [, root, suffix = '', bass] = match;
  if (!VALID_SUFFIX_RE.test(suffix)) return null;

  return { root, suffix, bass: bass ?? null };
}

/** Pitch class 0-11 for a note name, or null if unparseable. */
export function noteToPitch(note: string): number | null {
  const natural = NATURALS[note[0]?.toUpperCase()];
  if (natural === undefined) return null;

  let pitch = natural;
  for (const accidental of note.slice(1)) {
    if (accidental === '#') pitch += 1;
    else if (accidental === 'b') pitch -= 1;
    else return null;
  }
  return ((pitch % 12) + 12) % 12;
}

function pitchToNote(pitch: number, preferFlats: boolean): string {
  const names = preferFlats ? FLAT_NAMES : SHARP_NAMES;
  return names[((pitch % 12) + 12) % 12];
}

/** Semitone distance to get from one key to another, normalised to 0-11. */
export function semitonesBetween(fromKey: string, toKey: string): number {
  const from = noteToPitch(stripMinor(fromKey));
  const to = noteToPitch(stripMinor(toKey));
  if (from === null || to === null) return 0;
  return (((to - from) % 12) + 12) % 12;
}

function stripMinor(key: string): string {
  return key.replace(/m(in)?$/, '');
}

/**
 * The same interval as semitonesBetween, but as the shortest signed path
 * (-5..+6) rather than always upward.
 *
 * Chart transposition doesn't care — C→B and C→+11 spell identically. This
 * mattered when the reference track was pitched from the chart's key; the
 * player now carries its own offset, so nothing in the app calls this. Kept
 * as a tested utility for whenever an interval needs a direction.
 */
export function signedSemitones(fromKey: string, toKey: string): number {
  const up = semitonesBetween(fromKey, toKey);
  return up > 6 ? up - 12 : up;
}

/** True if the target key is conventionally written with flats. */
export function keyPrefersFlats(key: string): boolean {
  return FLAT_KEYS.has(key) || FLAT_KEYS.has(stripMinor(key));
}

/**
 * Transpose a single chord token by `semitones`. Returns the token unchanged
 * if it doesn't parse as a chord, so odd markings pass through untouched.
 */
export function transposeChord(token: string, semitones: number, preferFlats: boolean): string {
  const parsed = parseChord(token);
  if (!parsed) return token;

  const rootPitch = noteToPitch(parsed.root);
  if (rootPitch === null) return token;

  let out = pitchToNote(rootPitch + semitones, preferFlats) + parsed.suffix;

  if (parsed.bass) {
    const bassPitch = noteToPitch(parsed.bass);
    out += '/' + (bassPitch === null ? parsed.bass : pitchToNote(bassPitch + semitones, preferFlats));
  }
  return out;
}

/** Transpose a chord from one key to another. */
export function transposeChordToKey(token: string, fromKey: string, toKey: string): string {
  if (fromKey === toKey) return token;
  return transposeChord(token, semitonesBetween(fromKey, toKey), keyPrefersFlats(toKey));
}

/**
 * The key you'd write a chart in for a capo'd guitar: the shapes the player
 * actually fingers. Capo 2 in D means playing C shapes.
 */
export function capoKey(key: string, capo: number): string {
  if (!capo) return key;
  const minor = /m(in)?$/.test(key);
  const pitch = noteToPitch(stripMinor(key));
  if (pitch === null) return key;
  const shaped = pitchToNote(pitch - capo, keyPrefersFlats(key));
  return minor ? shaped + 'm' : shaped;
}

/** All 12 keys reachable from a starting key, labelled with their offset. */
export function keyOptions(fromKey: string): Array<{ key: string; semitones: number; label: string }> {
  const minor = /m(in)?$/.test(fromKey);
  const base = noteToPitch(stripMinor(fromKey));
  if (base === null) return [];

  return Array.from({ length: 12 }, (_, semitones) => {
    const pitch = base + semitones;
    // Spell each candidate the way that key is normally written.
    const sharp = pitchToNote(pitch, false) + (minor ? 'm' : '');
    const flat = pitchToNote(pitch, true) + (minor ? 'm' : '');
    const key = keyPrefersFlats(flat) ? flat : sharp;
    const offset = semitones > 6 ? semitones - 12 : semitones;
    // Same convention as signedSemitones, kept inline here because the loop
    // already has the raw offset.
    return {
      key,
      semitones,
      label: offset === 0 ? key : `${key} (${offset > 0 ? '+' : ''}${offset})`,
    };
  });
}
