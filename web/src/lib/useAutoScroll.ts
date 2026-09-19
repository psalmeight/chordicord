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
 *
 * That rounding is also why a plain scrollTo looks juddery when slow: at 3px/s
 * the page can only move in whole-pixel ticks three times a second, and the
 * eye reads that cadence as stutter. So each frame splits the position in two —
 * the whole pixels go to the real scroll, and the remainder is applied as a
 * translateY on the content wrapper, which browsers render at sub-pixel
 * precision. The content is promoted to its own layer while running so the
 * compositor slides it rather than repainting a page of text every frame; the
 * cost is text a hair softer in motion, which clears the moment it stops.
 */

/** Speed is a one-decimal number: whole steps were too coarse at the slow end
 *  (1 → 2 doubles the pace) — 0.1 lets a slow ballad be dialled in exactly. */
export const SPEED_STEP = 0.1;
export const MIN_SPEED = SPEED_STEP;
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

/** The element that carries the sub-pixel remainder. Layout tags its content
 *  wrapper with this id. Anything position:fixed must live *outside* it — a
 *  transformed ancestor becomes the containing block for fixed descendants,
 *  which is why AutoScrollWidget portals itself to the body. */
export const AUTOSCROLL_CONTENT_ID = 'autoscroll-content';

/** Snaps to the 0.1 grid. Rounds in tenths and divides back (never multiplies
 *  by 0.1), so 0.2 + 0.1 comes out as 0.3 and not 0.30000000000000004. */
export const clampSpeed = (n: number) =>
  Math.round(Math.max(MIN_SPEED, Math.min(MAX_SPEED, n)) * 10) / 10;

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
  /** 0.1–20 in 0.1 steps; pixels per second is speed × 3. */
  speed: number;
  setSpeed: (n: number) => void;
  /** Nudge by a delta from the *current* speed — safe to call from a
   *  hold-to-repeat timer, where a captured value would go stale. */
  stepSpeed: (delta: number) => void;
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

  const persist = (next: number) => {
    try {
      localStorage.setItem(STORAGE_KEY, String(next));
    } catch {
      // storage unavailable — the speed still applies for this session
    }
  };

  const setSpeed = useCallback((n: number) => {
    const next = clampSpeed(n);
    setSpeedState(next);
    persist(next);
  }, []);

  const stepSpeed = useCallback((delta: number) => {
    setSpeedState((s) => {
      const next = clampSpeed(s + delta);
      persist(next);
      return next;
    });
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

    // Missing only if Layout isn't mounted (never, in practice); then the loop
    // degrades to whole-pixel scrolling rather than doing nothing.
    const content = document.getElementById(AUTOSCROLL_CONTENT_ID);
    const setRemainder = (frac: number) => {
      if (!content) return;
      content.style.transform = frac > 0 ? `translate3d(0, ${-frac}px, 0)` : '';
    };
    if (content) content.style.willChange = 'transform';

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
        // Stay anchored to wherever the gesture leaves the page, with no
        // leftover fraction under the user's own scrolling.
        targetRef.current = y;
        lastSeenRef.current = y;
        setRemainder(0);
        setPausedOnce(true);
        return;
      }
      setPausedOnce(false);

      if (Math.abs(y - lastSeenRef.current) > DRIFT_PX) targetRef.current = y;

      const maxY = document.documentElement.scrollHeight - window.innerHeight;
      const next = targetRef.current + speedRef.current * PX_PER_STEP * dt;

      if (next >= maxY) {
        window.scrollTo(0, maxY);
        setRemainder(0);
        setRunning(false); // nothing left to scroll — the run is over
        return;
      }

      // Whole pixels scroll for real; the fraction rides on the transform.
      targetRef.current = next;
      const whole = Math.floor(next);
      window.scrollTo(0, whole);
      setRemainder(next - whole);
      lastSeenRef.current = window.scrollY;
    };

    frame = requestAnimationFrame(step);

    return () => {
      cancelAnimationFrame(frame);
      setRemainder(0);
      if (content) content.style.willChange = '';
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchend', onTouchEnd);
      window.removeEventListener('touchcancel', onTouchEnd);
      window.removeEventListener('wheel', onWheel);
    };
  }, [running]);

  return { running, paused, speed, setSpeed, stepSpeed, start, stop, toggle };
}
