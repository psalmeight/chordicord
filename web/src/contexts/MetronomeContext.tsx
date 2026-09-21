import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useMetronomeEngine } from '@/lib/useMetronomeEngine';
import MetronomeWidget from '@/components/MetronomeWidget';

export const MIN_BPM = 30;
export const MAX_BPM = 300;
const STORAGE_KEY = 'chordicord.metronome';

interface Stored {
  bpm: number;
  beatsPerBar: number;
}

interface MetronomeContextValue {
  bpm: number;
  setBpm: (n: number) => void;
  /** Nudge from the current tempo — safe from a hold-to-repeat timer. */
  stepBpm: (delta: number) => void;
  beatsPerBar: number;
  setBeatsPerBar: (n: number) => void;
  playing: boolean;
  currentBeat: number;
  tick: number;
  start: () => void;
  stop: () => void;
  toggle: () => void;
  open: boolean;
  setOpen: (v: boolean) => void;
  /** Set the tempo, reveal the widget, and start it — for a page's "use this
   *  song's tempo" button. */
  playAt: (bpm: number, beatsPerBar?: number) => void;
  /** True while a song editor is on screen. The metronome button hides (and
   *  stops, so nothing keeps clicking with no way to reach it) and the chart
   *  guide's button moves up out of the editor's action bar. */
  editing: boolean;
  setEditing: (v: boolean) => void;
}

const MetronomeContext = createContext<MetronomeContextValue | null>(null);

const clampBpm = (n: number) => Math.round(Math.max(MIN_BPM, Math.min(MAX_BPM, n)));

function load(): Stored {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<Stored>;
      return { bpm: clampBpm(p.bpm ?? 100), beatsPerBar: p.beatsPerBar ?? 4 };
    }
  } catch {
    // ignore malformed storage
  }
  return { bpm: 100, beatsPerBar: 4 };
}

export function MetronomeProvider({ children }: { children: ReactNode }) {
  const initial = useMemo(load, []);
  const [bpm, setBpmState] = useState(initial.bpm);
  const [beatsPerBar, setBeatsPerBar] = useState(initial.beatsPerBar);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);

  const engine = useMetronomeEngine(bpm, beatsPerBar);

  // Hidden means unreachable, so a running metronome stops with the button.
  const { playing, stop } = engine;
  useEffect(() => {
    if (editing && playing) stop();
  }, [editing, playing, stop]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ bpm, beatsPerBar }));
    } catch {
      // storage full or unavailable — the metronome still works this session
    }
  }, [bpm, beatsPerBar]);

  const setBpm = useCallback((n: number) => setBpmState(clampBpm(n)), []);
  const stepBpm = useCallback((delta: number) => setBpmState((b) => clampBpm(b + delta)), []);

  const playAt = useCallback(
    (nextBpm: number, nextBeats?: number) => {
      setBpmState(clampBpm(nextBpm));
      if (nextBeats) setBeatsPerBar(nextBeats);
      setOpen(true);
      engine.start();
    },
    [engine],
  );

  const value: MetronomeContextValue = {
    bpm,
    setBpm,
    stepBpm,
    beatsPerBar,
    setBeatsPerBar,
    playing: engine.playing,
    currentBeat: engine.currentBeat,
    tick: engine.tick,
    start: engine.start,
    stop: engine.stop,
    toggle: engine.toggle,
    open,
    setOpen,
    playAt,
    editing,
    setEditing,
  };

  return (
    <MetronomeContext.Provider value={value}>
      {children}
      <MetronomeWidget />
    </MetronomeContext.Provider>
  );
}

export function useMetronome(): MetronomeContextValue {
  const ctx = useContext(MetronomeContext);
  if (!ctx) throw new Error('useMetronome must be used within a MetronomeProvider');
  return ctx;
}
