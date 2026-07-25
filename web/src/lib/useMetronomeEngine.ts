import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * A sample-accurate metronome built on the Web Audio clock.
 *
 * setInterval alone drifts and stutters under load, so ticks are *scheduled*
 * ahead of time against AudioContext.currentTime (the "two clocks" pattern):
 * a coarse timer wakes often enough to queue the next fraction of a second of
 * clicks, and the audio hardware plays them at exactly the right moment.
 *
 * bpm and beatsPerBar are read through refs so changing tempo mid-play retimes
 * the next beat without tearing down the scheduler or restarting the bar.
 */

// How far ahead to queue clicks, and how often to wake and do the queuing.
const SCHEDULE_AHEAD = 0.12; // seconds
const LOOKAHEAD = 25; // ms

export interface MetronomeEngine {
  playing: boolean;
  /** 0-based beat within the bar that's currently sounding, or -1 when stopped. */
  currentBeat: number;
  /** Monotonic counter bumped on every beat, so a flash can fire even when the
   *  bar is a single beat (currentBeat alone wouldn't change). */
  tick: number;
  start: () => void;
  stop: () => void;
  toggle: () => void;
}

export function useMetronomeEngine(bpm: number, beatsPerBar: number): MetronomeEngine {
  const [playing, setPlaying] = useState(false);
  const [currentBeat, setCurrentBeat] = useState(-1);
  const [tick, setTick] = useState(0);

  const ctxRef = useRef<AudioContext | null>(null);
  const bpmRef = useRef(bpm);
  const beatsRef = useRef(beatsPerBar);
  bpmRef.current = bpm;
  beatsRef.current = beatsPerBar;

  const nextNoteTimeRef = useRef(0);
  const beatRef = useRef(0);

  const click = useCallback((beat: number, time: number) => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    // Downbeat is higher and louder so the top of the bar is audible.
    const accent = beat === 0;
    osc.frequency.value = accent ? 1600 : 1000;
    const peak = accent ? 0.5 : 0.32;
    gain.gain.setValueAtTime(peak, time);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.03);
    osc.start(time);
    osc.stop(time + 0.03);
  }, []);

  useEffect(() => {
    if (!playing) return;
    const ctx = ctxRef.current;
    if (!ctx) return;

    beatRef.current = 0;
    nextNoteTimeRef.current = ctx.currentTime + 0.1;

    const timer = window.setInterval(() => {
      while (nextNoteTimeRef.current < ctx.currentTime + SCHEDULE_AHEAD) {
        const beat = beatRef.current;
        const time = nextNoteTimeRef.current;
        click(beat, time);

        // Light the beat indicator when the click actually sounds, not when
        // it's queued — the two can be up to SCHEDULE_AHEAD apart.
        const delay = Math.max(0, (time - ctx.currentTime) * 1000);
        window.setTimeout(() => {
          setCurrentBeat(beat);
          setTick((t) => t + 1);
        }, delay);

        nextNoteTimeRef.current += 60 / bpmRef.current;
        beatRef.current = (beat + 1) % Math.max(1, beatsRef.current);
      }
    }, LOOKAHEAD);

    return () => {
      window.clearInterval(timer);
      setCurrentBeat(-1);
    };
  }, [playing, click]);

  const start = useCallback(() => {
    // Created on the gesture that starts playback so it isn't left suspended.
    ctxRef.current ??= new AudioContext();
    void ctxRef.current.resume();
    setPlaying(true);
  }, []);

  const stop = useCallback(() => setPlaying(false), []);
  const toggle = useCallback(() => setPlaying((p) => !p), []);

  return { playing, currentBeat, tick, start, stop, toggle };
}
