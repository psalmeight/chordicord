import { useCallback, useEffect, useState } from 'react';

/**
 * The reader's chart size, in px — one setting for every song and setlist,
 * changed from the header and remembered on the device. A phone is set up
 * once and stays set; nobody re-tunes it song by song at a music stand.
 *
 * The default is larger on a phone: a chart never soft-wraps, so on a wide
 * screen 15px leaves room to spare, but at arm's length on a handset it reads
 * small. Below the tablet breakpoint the chart is a single column anyway, so
 * the extra size only costs a little sideways scroll on the longest lines.
 *
 * One value shared by every subscriber, not one per hook: the header changes
 * it and the chart on the page has to follow at once.
 */

export const MIN_CHART_FONT = 11;
export const MAX_CHART_FONT = 28;

const DESKTOP_DEFAULT = 15;
const PHONE_DEFAULT = 18;
/** Matches Chakra's `md` breakpoint, where Layout's two-column charts give way to one. */
const PHONE_QUERY = '(max-width: 767px)';

const STORAGE_KEY = 'chordicord.chartFontSize';

const clamp = (n: number) => Math.round(Math.max(MIN_CHART_FONT, Math.min(MAX_CHART_FONT, n)));

function defaultSize(): number {
  try {
    return window.matchMedia(PHONE_QUERY).matches ? PHONE_DEFAULT : DESKTOP_DEFAULT;
  } catch {
    return DESKTOP_DEFAULT;
  }
}

function stored(): number {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const n = raw ? Number(raw) : NaN;
    return Number.isFinite(n) ? clamp(n) : defaultSize();
  } catch {
    return defaultSize();
  }
}

let current = stored();
const listeners = new Set<(size: number) => void>();

function setChartFontSize(next: number) {
  current = clamp(next);
  try {
    localStorage.setItem(STORAGE_KEY, String(current));
  } catch {
    // storage unavailable — the size still holds for this session
  }
  listeners.forEach((l) => l(current));
}

export function useChartFontSize(): [number, (delta: number) => void] {
  const [size, setSize] = useState(current);
  useEffect(() => {
    listeners.add(setSize);
    return () => {
      listeners.delete(setSize);
    };
  }, []);
  const step = useCallback((delta: number) => setChartFontSize(current + delta), []);
  return [size, step];
}
