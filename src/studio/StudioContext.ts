import { createContext, useContext } from 'react';
import type { AudioEngine, PlaybackState, PlayOptions } from '../audio/engine';
import type { Playable } from '../audio/types';
import { useStore } from '../lib/useStore';
import type { Preset } from '../presets/types';
import type { AnyModeDefinition, ModeId, ParamsUpdate } from './types';

export interface LoadPresetOptions {
  /** Start playing the preset from the beginning (call from a click handler). */
  play?: boolean;
  /**
   * true (default): switch to the preset's mode tab for editing.
   * false: stay on the current tab; the preset's mode only becomes the source mode (audition).
   */
  open?: boolean;
}

/** The preset most recently loaded (its params may have been edited since). */
export interface LoadedPreset {
  id: string;
  mode: ModeId;
  name: string;
}

export interface StudioApi {
  engine: AudioEngine;
  modes: readonly AnyModeDefinition[];
  activeModeId: ModeId;
  setActiveMode: (id: ModeId) => void;
  /** The mode whose Playable the transport uses (active tab unless it has providesPlayable: false). */
  sourceModeId: ModeId;
  /** Last preset loaded via loadPreset (null until one is loaded). */
  loadedPreset: LoadedPreset | null;
  /** Playable compiled from the source mode (what PLAY / EXPORT use). */
  activePlayable: Playable | null;
  getParams: <P = unknown>(id: ModeId) => P;
  setModeParams: <P = unknown>(id: ModeId, next: ParamsUpdate<P>) => void;
  /** Reset a mode's params to its defaultParams. */
  resetModeParams: (id: ModeId) => void;
  /**
   * Load a preset: normalizes a copy of its params into its mode and switches
   * to that tab (or, with open: false, only makes it the source mode). If the
   * transport is playing it restarts with the preset; `play: true` always starts it.
   */
  loadPreset: (preset: Preset, opts?: LoadPresetOptions) => void;
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
