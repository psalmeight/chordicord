/**
 * Chord parsing and transposition.
 *
 * Design rule: chords are stored exactly as written, in the song's own key.
 * Transposition is always a pure function of (stored text, from-key, to-key)
 * computed at render time. Nothing transposed is ever written back, so the
 * source of truth can't drift and any key can be reached from any other.
 */

/**
 * The one spelling every accidental gets, whatever key it lands in.
 *
 * Strict notation would pick sharps or flats from the key signature — Db in
 * Ab, D# in E. These charts are read off a music stand, not engraved, and
 * players call those chords C# and Eb wherever they turn up. One spelling also
 * means one name per pitch: the same chord never reads two ways across a set
 * because two songs were written in different keys.
 */
const NOTE_NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B'];

/** Semitone offset of each natural note from C. */
const NATURALS: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** The same twelve, major and minor. Anything else still parses — a song saved
 *  as "Ab" before this settled reads fine — it just isn't offered. */
export const KEYS = [
  'C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B',
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

/** An optional/implied chord written "(C)". The wrap is notation, not part of
 *  the chord, so parsing sees the inside and transposing puts it back. */
const PAREN_WRAP_RE = /^\((.+)\)$/;

export function parseChord(token: string): ParsedChord | null {
  const trimmed = token.trim();
  const paren = PAREN_WRAP_RE.exec(trimmed);
  const match = CHORD_RE.exec(paren ? paren[1] : trimmed);
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

function pitchToNote(pitch: number): string {
  return NOTE_NAMES[((pitch % 12) + 12) % 12];
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

/**
 * A key respelled the app's way, so a song stored as "Ab" or "D#" reads back
 * as "G#" or "Eb". Anything that doesn't parse as a key is left alone.
 */
export function normalizeKey(key: string): string {
  if (!key) return key;
  const pitch = noteToPitch(stripMinor(key));
  if (pitch === null) return key;
  return pitchToNote(pitch) + (/m(in)?$/.test(key) ? 'm' : '');
}

/**
 * Transpose a single chord token by `semitones`. Returns the token unchanged
 * if it doesn't parse as a chord, so odd markings pass through untouched.
 */
export function transposeChord(token: string, semitones: number): string {
  // "(C)" transposes as C and keeps its parens — parseChord unwraps them, so
  // rebuilding from its parts below would silently drop the notation.
  const paren = PAREN_WRAP_RE.exec(token.trim());
  if (paren) return `(${transposeChord(paren[1], semitones)})`;

  const parsed = parseChord(token);
  if (!parsed) return token;

  const rootPitch = noteToPitch(parsed.root);
  if (rootPitch === null) return token;

  let out = pitchToNote(rootPitch + semitones) + parsed.suffix;

  if (parsed.bass) {
    const bassPitch = noteToPitch(parsed.bass);
    out += '/' + (bassPitch === null ? parsed.bass : pitchToNote(bassPitch + semitones));
  }
  return out;
}

/** Transpose a chord from one key to another. */
export function transposeChordToKey(token: string, fromKey: string, toKey: string): string {
  if (fromKey === toKey) return token;
  return transposeChord(token, semitonesBetween(fromKey, toKey));
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
  const shaped = pitchToNote(pitch - capo);
  return minor ? shaped + 'm' : shaped;
}

/** All 12 keys reachable from a starting key, labelled with their offset. */
export function keyOptions(fromKey: string): Array<{ key: string; semitones: number; label: string }> {
  const minor = /m(in)?$/.test(fromKey);
  const base = noteToPitch(stripMinor(fromKey));
  if (base === null) return [];

  return Array.from({ length: 12 }, (_, semitones) => {
    const key = pitchToNote(base + semitones) + (minor ? 'm' : '');
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
