import { useEffect, useRef, useState } from 'react';

/** How long the form has to sit still before it's saved. */
export const AUTOSAVE_DELAY_MS = 1500;

/**
 * Saves a form on its own, a beat and a half after the last keystroke.
 *
 * `snapshot` is the form serialised (JSON.stringify of everything that
 * saves); the hook compares it to what was last saved, so an edit that is
 * typed and then undone saves nothing. `enabled` gates the whole thing: it
 * is false until the form has loaded, and the snapshot at the moment it
 * turns true is taken as already saved — loading a song is not an edit.
 *
 * One save runs at a time. Edits made while one is in flight are picked up
 * by the next, which is scheduled as soon as the first lands.
 *
 * `save` resolves to true when it saved, false when it declined (a blank
 * title, say) — a decline is not an error, but nothing is marked saved.
 */
export function useAutosave({
  snapshot,
  enabled,
  save,
  delay = AUTOSAVE_DELAY_MS,
}: {
  snapshot: string;
  enabled: boolean;
  save: () => Promise<boolean>;
  delay?: number;
}) {
  const savedRef = useRef<string | null>(null);
  const inFlightRef = useRef(false);
  const saveRef = useRef(save);
  saveRef.current = save;
  const snapshotRef = useRef(snapshot);
  snapshotRef.current = snapshot;
  // Bumped when a save lands with newer edits still pending, so the effect
  // re-runs and schedules the next save.
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!enabled) {
      savedRef.current = null;
      return;
    }
    if (savedRef.current === null) {
      savedRef.current = snapshot;
      return;
    }
    if (snapshot === savedRef.current || inFlightRef.current) return;

    const timer = setTimeout(async () => {
      const attempted = snapshotRef.current;
      // Checked again now, not only when scheduled: a manual Save in the
      // meantime (markSaved) leaves nothing to do.
      if (attempted === savedRef.current) return;
      inFlightRef.current = true;
      try {
        if (await saveRef.current()) savedRef.current = attempted;
      } finally {
        inFlightRef.current = false;
        // Anything typed during the save is still unsaved; nudge the effect
        // so it schedules the next one. A no-op if nothing changed.
        if (snapshotRef.current !== savedRef.current) setTick((t) => t + 1);
      }
    }, delay);
    return () => clearTimeout(timer);
  }, [snapshot, enabled, delay, tick]);

  /** Marks the current snapshot as saved — for a manual Save button, so the
   *  autosave doesn't repeat what the button just did. */
  const markSaved = () => {
    savedRef.current = snapshotRef.current;
  };

  return { markSaved };
}
