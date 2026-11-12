import { createContext, useContext } from 'react';
import type { AudioEngine, PlaybackState, PlayOptions } from '../audio/engine';
import type { Playable } from '../audio/types';
import { useStore } from '../lib/useStore';
import type { Preset } from '../presets/types';
import type { AnyModeDefinition, ModeId, ParamsUpdate } from './types';

export interface StudioApi {
  engine: AudioEngine;
  modes: readonly AnyModeDefinition[];
  activeModeId: ModeId;
  setActiveMode: (id: ModeId) => void;
  /** The mode whose Playable the transport uses (active tab unless it has providesPlayable: false). */
  sourceModeId: ModeId;
  /** Playable compiled from the source mode (what PLAY / EXPORT use). */
  activePlayable: Playable | null;
  getParams: <P = unknown>(id: ModeId) => P;
  setModeParams: <P = unknown>(id: ModeId, next: ParamsUpdate<P>) => void;
  /** Reset a mode's params to its defaultParams. */
  resetModeParams: (id: ModeId) => void;
  /** Load a preset: normalizes its params into its mode and switches to that tab. */
  loadPreset: (preset: Preset) => void;
  /** Transport: play/resume the activePlayable. */
  play: () => Promise<void>;
  pause: () => void;
  stop: () => void;
  /** Play an ad-hoc Playable (preview) through the transport. */
  playPlayable: (p: Playable, opts?: PlayOptions) => Promise<void>;
}

export const StudioContext = createContext<StudioApi | null>(null);

/** Internal (used by ModeHost): lets a mode publish its Playable. */
export const PublishContext = createContext<((id: ModeId, p: Playable | null) => void) | null>(null);

export function useStudio(): StudioApi {
  const ctx = useContext(StudioContext);
  if (!ctx) throw new Error('useStudio() must be used inside <StudioProvider>');
  return ctx;
}

/** Subscribe to (a slice of) the engine's playback state. */
export function usePlayback<S>(selector: (s: PlaybackState) => S): S {
  const { engine } = useStudio();
  return useStore(engine.store, selector);
}
