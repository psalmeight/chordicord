import { toAligned } from './chordpro';

/**
 * A first v2 draft from a classic chart, in Ultimate Guitar's plain form —
 * shown until the song is first saved in the new editor, and never written
 * anywhere by itself.
 *
 *   [G]Amazing [C]grace   ->  chords laid out on the row above the lyric
 *   {Verse 1} / Verse 1:  ->  [###Verse 1]     (a v2 heading)
 *   ## Big / ### / ####   ->  [#Big] / [##] / [###]
 *   # a comment           ->  dropped (it never reached the chart either)
 *
 * The classic *marks* are left as typed — v2 reads them the same way.
 */
const BRACE_SECTION = /^\s*\{\s*(.+?)\s*\}\s*$/;
const COLON_SECTION = /^\s*([A-Za-z][A-Za-z0-9 '’\-]{0,30}):\s*$/;
const HEADING = /^\s*(##+)\s*(.+)$/;
const COMMENT = /^\s*#(?!#)/;

export function toV2Draft(content: string): string {
  return toAligned(content)
    .split('\n')
    .filter((line) => !COMMENT.test(line))
    .map((line) => {
      const section = BRACE_SECTION.exec(line) ?? COLON_SECTION.exec(line);
      if (section) return `[###${section[1]}]`;
      const heading = HEADING.exec(line);
      if (heading) return `[${'#'.repeat(heading[1].length - 1)}${heading[2]}]`;
      return line;
    })
    .join('\n');
}
