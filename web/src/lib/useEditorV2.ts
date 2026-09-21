import { useCallback, useEffect, useState } from 'react';

/**
 * Whether this device has opted into the v2 chart — the experimental
 * Ultimate-Guitar-style editor and view. Per device, like the chart size:
 * it's a way of working, not a property of the song.
 *
 * One value shared by every subscriber, not one per hook: the song page
 * flips the switch and the chart guide in the header has to follow it.
 */

const STORAGE_KEY = 'chordicord.editorV2';

function stored(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

let current = stored();
const listeners = new Set<(on: boolean) => void>();

function setEditorV2(next: boolean) {
  current = next;
  try {
    localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
  } catch {
    // storage unavailable — the choice still holds for this page
  }
  listeners.forEach((l) => l(next));
}

export function useEditorV2(): [boolean, (on: boolean) => void] {
  const [on, setOn] = useState(current);
  useEffect(() => {
    listeners.add(setOn);
    return () => {
      listeners.delete(setOn);
    };
  }, []);
  const set = useCallback((next: boolean) => setEditorV2(next), []);
  return [on, set];
}
