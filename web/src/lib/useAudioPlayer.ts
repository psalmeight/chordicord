import { useCallback, useEffect, useRef, useState } from 'react';
import { PitchShifter } from 'soundtouchjs';

/**
 * Plays a reference track with independent pitch control.
 *
 * The naive approach — AudioBufferSourceNode.playbackRate — shifts pitch and
 * tempo together, so transposing up a tone would also speed the song up. That's
 * useless for playing along. SoundTouch runs a time-domain stretch (WSOLA) so
 * pitch moves while tempo stays put.
 *
 * The whole file is decoded into memory up front. That's the tradeoff for
 * arbitrary pitch shifting: the algorithm needs random access to the samples,
 * so there's no streaming — expect a few seconds of load on a long track.
 */

export type PlayerStatus = 'idle' | 'loading' | 'ready' | 'error';

interface Player {
  status: PlayerStatus;
  error: string;
  playing: boolean;
  /** Seconds. */
  position: number;
  duration: number;
  toggle: () => void;
  seek: (fraction: number) => void;
  stop: () => void;
}

export function useAudioPlayer(url: string | null, semitones: number): Player {
  const contextRef = useRef<AudioContext | null>(null);
  const shifterRef = useRef<PitchShifter | null>(null);
  const bufferRef = useRef<AudioBuffer | null>(null);

  const [status, setStatus] = useState<PlayerStatus>('idle');
  const [error, setError] = useState('');
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);

  // Read inside the shifter's setup without making it a dependency — the value
  // is applied imperatively by the effect below whenever it changes.
  const semitonesRef = useRef(semitones);
  semitonesRef.current = semitones;

  const teardown = useCallback(() => {
    if (shifterRef.current) {
      shifterRef.current.off();
      shifterRef.current.disconnect();
      shifterRef.current = null;
    }
    setPlaying(false);
    setPosition(0);
  }, []);

  // Load and decode whenever the source changes.
  useEffect(() => {
    let cancelled = false;
    teardown();
    bufferRef.current = null;

    if (!url) {
      setStatus('idle');
      return;
    }

    setStatus('loading');
    setError('');

    (async () => {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Could not fetch the track (${res.status})`);
        const bytes = await res.arrayBuffer();

        // Created lazily: constructing an AudioContext before a user gesture
        // leaves it suspended on mobile Safari.
        contextRef.current ??= new AudioContext();
        const buffer = await contextRef.current.decodeAudioData(bytes);
        if (cancelled) return;

        bufferRef.current = buffer;
        setDuration(buffer.duration);
        setStatus('ready');
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Could not load the track');
        setStatus('error');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [url, teardown]);

  // Pitch is live-adjustable, so a key change mid-playback doesn't restart the
  // song — the shifter just starts producing shifted output.
  useEffect(() => {
    if (shifterRef.current) shifterRef.current.pitchSemitones = semitones;
  }, [semitones]);

  useEffect(() => teardown, [teardown]);

  const ensureShifter = useCallback(() => {
    if (shifterRef.current || !bufferRef.current || !contextRef.current) return shifterRef.current;

    const shifter = new PitchShifter(contextRef.current, bufferRef.current, 4096, () => {
      // Reaching the end leaves the node connected but idle; drop it so the
      // next play starts from the top rather than from silence.
      teardown();
    });
    shifter.tempo = 1;
    shifter.pitchSemitones = semitonesRef.current;
    shifter.on('play', (detail) => setPosition(detail.timePlayed));
    shifterRef.current = shifter;
    return shifter;
  }, [teardown]);

  const toggle = useCallback(() => {
    const context = contextRef.current;
    if (!context || status !== 'ready') return;

    // Playback is connect/disconnect rather than start/stop: the shifter's
    // processing node has no transport of its own, and disconnecting leaves
    // its read position intact so resuming continues where it left off.
    if (playing) {
      shifterRef.current?.disconnect();
      setPlaying(false);
      return;
    }

    const shifter = ensureShifter();
    if (!shifter) return;
    void context.resume();
    shifter.connect(context.destination);
    setPlaying(true);
  }, [ensureShifter, playing, status]);

  const seek = useCallback((fraction: number) => {
    const shifter = shifterRef.current;
    if (!shifter) return;
    const clamped = Math.min(1, Math.max(0, fraction));
    shifter.percentagePlayed = clamped;
    setPosition(clamped * shifter.duration);
  }, []);

  const stop = useCallback(() => {
    teardown();
  }, [teardown]);

  return { status, error, playing, position, duration, toggle, seek, stop };
}

export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${String(secs).padStart(2, '0')}`;
}
