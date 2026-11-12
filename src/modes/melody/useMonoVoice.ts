import { useCallback, useEffect, useRef, useState } from 'react';
import type { AudioEngine } from '../../audio/engine';
import { midiToFreq } from '../../audio/music';

interface Hold {
  id: string;
  midi: number;
}

export interface MonoVoice {
  /** MIDI note sounding live right now (null = none). */
  sounding: number | null;
  /** Start (or re-pitch) the hold identified by `id` (a pointer or a key). Last pressed wins. */
  press: (id: string, midi: number) => void;
  /** End a hold; falls back to the previous still-held note, else silence. */
  release: (id: string) => void;
  /** MIDI note currently held by `id`, if any. */
  heldBy: (id: string) => number | null;
  releaseAll: () => void;
}

/** Monophonic live-note voice (last-note priority) on top of engine.noteOn/noteOff. */
export function useMonoVoice(engine: AudioEngine, gain: number): MonoVoice {
  const holds = useRef<Hold[]>([]);
  const [sounding, setSounding] = useState<number | null>(null);

  const press = useCallback(
    (id: string, midi: number) => {
      holds.current = [...holds.current.filter((h) => h.id !== id), { id, midi }];
      engine.noteOn(midiToFreq(midi), gain);
      setSounding(midi);
    },
    [engine, gain],
  );

  const release = useCallback(
    (id: string) => {
      const top = holds.current[holds.current.length - 1];
      holds.current = holds.current.filter((h) => h.id !== id);
      if (!top || top.id !== id) return;
      const next = holds.current[holds.current.length - 1];
      if (next) {
        engine.noteOn(midiToFreq(next.midi), gain);
        setSounding(next.midi);
      } else {
        engine.noteOff();
        setSounding(null);
      }
    },
    [engine, gain],
  );

  const heldBy = useCallback((id: string) => holds.current.find((h) => h.id === id)?.midi ?? null, []);

  const releaseAll = useCallback(() => {
    if (holds.current.length === 0) return;
    holds.current = [];
    engine.noteOff();
    setSounding(null);
  }, [engine]);

  useEffect(() => {
    window.addEventListener('blur', releaseAll);
    return () => window.removeEventListener('blur', releaseAll);
  }, [releaseAll]);

  // Never leave a live note hanging when the panel unmounts (tab switch).
  useEffect(() => () => engine.noteOff(), [engine]);

  return { sounding, press, release, heldBy, releaseAll };
}
