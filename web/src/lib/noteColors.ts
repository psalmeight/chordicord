import type { NoteCard } from '@/types';

/** A note colour maps to a tinted callout: light fill, saturated left border,
 *  legible text, and a solid swatch for the picker. Chakra colour tokens. */
export interface NoteColor {
  key: string;
  label: string;
  bg: string;
  border: string;
  fg: string;
  swatch: string;
}

export const NOTE_COLORS: NoteColor[] = [
  { key: 'amber', label: 'Amber', bg: 'yellow.50', border: 'yellow.400', fg: 'yellow.900', swatch: 'yellow.400' },
  { key: 'red', label: 'Red', bg: 'red.50', border: 'red.400', fg: 'red.800', swatch: 'red.500' },
  { key: 'green', label: 'Green', bg: 'green.50', border: 'green.500', fg: 'green.800', swatch: 'green.500' },
  { key: 'blue', label: 'Blue', bg: 'blue.50', border: 'blue.400', fg: 'blue.800', swatch: 'blue.500' },
  { key: 'gray', label: 'Gray', bg: 'gray.100', border: 'gray.400', fg: 'gray.800', swatch: 'gray.500' },
];

/** Falls back to the first colour for an unknown/empty key. */
export function noteColor(key: string): NoteColor {
  return NOTE_COLORS.find((c) => c.key === key) ?? NOTE_COLORS[0];
}

/** Section names compare case-insensitively and trimmed, so a note anchored to
 *  "Chorus" still lands when the chart writes "chorus " or "{ Chorus }". */
export const sectionKey = (name: string) => name.trim().toLowerCase();

export interface GroupedNotes {
  general: NoteCard[];
  bySection: Record<string, NoteCard[]>;
}

/** Splits cards into the general (top) list and a section-keyed lookup. */
export function groupNotes(cards: NoteCard[] | undefined): GroupedNotes {
  const out: GroupedNotes = { general: [], bySection: {} };
  for (const card of cards ?? []) {
    if (!card.section.trim()) {
      out.general.push(card);
    } else {
      (out.bySection[sectionKey(card.section)] ??= []).push(card);
    }
  }
  return out;
}
