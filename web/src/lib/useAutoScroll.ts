import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Hands-free scrolling for playing through a setlist.
 *
 * The loop never fights the player: it drives the window one animation frame at
 * a time from wherever the page currently *is*, so a drag, a flick or a wheel
 * spin simply relocates it and scrolling carries on from the new spot. A finger
 * on the glass parks the loop outright — iOS ignores programmatic scrolling
 * mid-gesture and would only stutter — and it waits for the momentum fling to
 * settle before taking the wheel back.
 *
 * Position is accumulated in a float ref rather than read back from scrollY
 * each frame: at the slow end a frame is worth ~0.05px, and a browser that
 * rounds scroll offsets to whole pixels would swallow every step and sit still.
 */

export const MIN_SPEED = 1;
export const MAX_SPEED = 20;
export const DEFAULT_SPEED = 5;

/** Pixels per second at speed 1. Speed 20 ≈ 60px/s, a fast verse. */
const PX_PER_STEP = 3;

/** How long after a finger lifts we let momentum run before resuming. */
const SETTLE_MS = 550;
/** A wheel/trackpad gesture parks the loop for this long after its last event. */
const WHEEL_PAUSE_MS = 700;

/** A gap larger than this between our last commanded offset and the live one
 *  means the page moved under us — the user scrolled, so re-anchor to them. */
const DRIFT_PX = 1.5;

/** A backgrounded tab can hand back a huge delta; cap it so we never lurch. */
const MAX_FRAME_MS = 100;

const STORAGE_KEY = 'chordicord.autoscroll';

export const clampSpeed = (n: number) =>
  Math.round(Math.max(MIN_SPEED, Math.min(MAX_SPEED, n)));

function storedSpeed(): number {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? clampSpeed(Number(raw)) : DEFAULT_SPEED;
  } catch {
    return DEFAULT_SPEED;
  }
}

export interface AutoScroll {
  running: boolean;
  /** True while a gesture has the scroll parked. Running stays true — this is
   *  the "it'll pick up again in a moment" state, not a stop. */
  paused: boolean;
  /** 1–20; pixels per second is speed × 3. */
  speed: number;
  setSpeed: (n: number) => void;
  start: () => void;
  stop: () => void;
  toggle: () => void;
}

export function useAutoScroll(): AutoScroll {
  const [running, setRunning] = useState(false);
  const [paused, setPaused] = useState(false);
  const [speed, setSpeedState] = useState(storedSpeed);

  // Read through a ref so dragging the slider retimes the next frame instead of
  // tearing down and restarting the loop.
  const speedRef = useRef(speed);
  speedRef.current = speed;

  const targetRef = useRef(0);
  const lastSeenRef = useRef(0);
  const holdingRef = useRef(false);
  const settleUntilRef = useRef(0);
  const pausedRef = useRef(false);

  const setPausedOnce = (value: boolean) => {
    if (pausedRef.current === value) return;
    pausedRef.current = value;
    setPaused(value);
  };

  const setSpeed = useCallback((n: number) => {
    const next = clampSpeed(n);
    setSpeedState(next);
    try {
      localStorage.setItem(STORAGE_KEY, String(next));
    } catch {
      // storage unavailable — the speed still applies for this session
    }
  }, []);

  const start = useCallback(() => setRunning(true), []);
  const stop = useCallback(() => setRunning(false), []);
  const toggle = useCallback(() => setRunning((r) => !r), []);

  useEffect(() => {
    if (!running) {
      setPausedOnce(false);
      return;
    }

    targetRef.current = window.scrollY;
    lastSeenRef.current = window.scrollY;
    holdingRef.current = false;
    settleUntilRef.current = 0;

    const onTouchStart = () => {
      holdingRef.current = true;
      setPausedOnce(true);
    };
    const onTouchEnd = () => {
      holdingRef.current = false;
      settleUntilRef.current = performance.now() + SETTLE_MS;
    };
    const onWheel = () => {
      settleUntilRef.current = performance.now() + WHEEL_PAUSE_MS;
      setPausedOnce(true);
    };

    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchend', onTouchEnd, { passive: true });
    window.addEventListener('touchcancel', onTouchEnd, { passive: true });
    window.addEventListener('wheel', onWheel, { passive: true });

    let frame = 0;
    let last = performance.now();

    const step = (now: number) => {
      frame = requestAnimationFrame(step);
      const dt = Math.min(now - last, MAX_FRAME_MS) / 1000;
      last = now;

      const y = window.scrollY;
      const parked = holdingRef.current || now < settleUntilRef.current;

      if (parked) {
        // Stay anchored to wherever the gesture leaves the page.
        targetRef.current = y;
        lastSeenRef.current = y;
        setPausedOnce(true);
        return;
      }
      setPausedOnce(false);

      if (Math.abs(y - lastSeenRef.current) > DRIFT_PX) targetRef.current = y;

      const maxY = document.documentElement.scrollHeight - window.innerHeight;
      const next = targetRef.current + speedRef.current * PX_PER_STEP * dt;

      if (next >= maxY) {
        window.scrollTo(0, maxY);
        setRunning(false); // nothing left to scroll — the run is over
        return;
      }

      targetRef.current = next;
      window.scrollTo(0, next);
      lastSeenRef.current = window.scrollY;
    };

    frame = requestAnimationFrame(step);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchend', onTouchEnd);
      window.removeEventListener('touchcancel', onTouchEnd);
      window.removeEventListener('wheel', onWheel);
    };
  }, [running]);

  return { running, paused, speed, setSpeed, start, stop, toggle };
}
