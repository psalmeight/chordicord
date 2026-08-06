import { useState } from 'react';
import { hasChords, transposeContent } from '@/lib/chordpro';

/**
 * Changing a chart's key means one of two opposite things, and the dropdown
 * alone can't tell them apart: either the chart was mislabelled and only the
 * label should move, or the song is being rewritten and the chords should
 * follow. Guessing wrong corrupts the chart, so it's asked rather than
 * inferred — and only when `enabled` (an existing chart, where there's a
 * known key to convert from).
 *
 * `contentKey` is the key the content is actually written in — not the same
 * as the dropdown's value, which is just what it currently reads. They
 * diverge the moment someone picks a different key, and that gap is what the
 * offer is for. Seed it from the stored key on load via `setContentKey`.
 */
export function useKeyConvert({
  enabled,
  targetKey,
  content,
  setContent,
}: {
  enabled: boolean;
  /** The key the dropdown currently reads. */
  targetKey: string;
  content: string;
  setContent: (content: string) => void;
}) {
  const [contentKey, setContentKey] = useState('');
  // Set when a conversion has been applied but not yet saved, so it can be
  // taken back — the chart is the source of truth and this rewrites it.
  const [undo, setUndo] = useState<{ content: string; key: string } | null>(null);
  // Which target key the offer was waved off for, so it stops nagging.
  const [dismissed, setDismissed] = useState('');

  const offerConvert =
    enabled && contentKey !== '' && targetKey !== '' && targetKey !== contentKey &&
    dismissed !== targetKey && hasChords(content);

  const convertChart = () => {
    setUndo({ content, key: contentKey });
    setContent(transposeContent(content, contentKey, targetKey));
    setContentKey(targetKey);
  };

  // "It was always in this key" — the label was wrong, the chords were not.
  const relabelOnly = () => {
    setDismissed(targetKey);
    setContentKey(targetKey);
  };

  const undoConvert = () => {
    if (!undo) return;
    setContent(undo.content);
    setContentKey(undo.key);
    setUndo(null);
  };

  return { contentKey, setContentKey, offerConvert, undo, convertChart, relabelOnly, undoConvert };
}
