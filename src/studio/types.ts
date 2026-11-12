/**
 * The mode-panel contract. See ARCHITECTURE.md -> "How to implement a mode panel".
 */
import type { ComponentType } from 'react';
import type { Playable } from '../audio/types';

export const MODE_IDS = ['ramp', 'pulse', 'siren', 'random', 'melody', 'sequencer', 'midi', 'frequency', 'presets'] as const;
export type ModeId = (typeof MODE_IDS)[number];

export function isModeId(x: unknown): x is ModeId {
  return typeof x === 'string' && (MODE_IDS as readonly string[]).includes(x);
}

export type ParamsUpdate<P> = P | ((prev: P) => P);

/** Props every mode Panel receives from the app shell. */
export interface ModePanelProps<P> {
  /** Current params for this mode (persisted to localStorage, settable by presets). */
  params: P;
  /** Update params. Must stay JSON-serializable. */
  setParams: (next: ParamsUpdate<P>) => void;
  /**
   * Escape hatch for modes WITHOUT `build`: publish the Playable the transport
   * should play/export for this mode (e.g. MIDI data derived from a loaded file
   * that is not stored in params). Not persisted. Pass null to clear.
   */
  setPlayable: (p: Playable | null) => void;
}

export interface ModeDefinition<P> {
  id: ModeId;
  /** Tab label. */
  label: string;
  /** One-line description shown under the tab header. */
  description: string;
  /** Params used on first run / reset. Must be JSON-serializable. */
  defaultParams: P;
  /**
   * Validate / migrate params coming from localStorage or a preset. Receives
   * untrusted `unknown`. Default: shallow-merge objects over defaultParams.
   */
  normalizeParams?: (raw: unknown) => P;
  /**
   * Preferred: pure compile step params -> Playable (null = nothing to play).
   * Called by the shell whenever params change; the result is what PLAY and
   * EXPORT WAV use while this tab is the source mode.
   */
  build?: (params: P) => Playable | null;
  /**
   * How a params change reaches a running transport:
   * 'boundary' (default) = at the next loop/chunk boundary,
   * 'immediate' = re-cue now at the same position (good for steady tones).
   */
  liveUpdate?: 'boundary' | 'immediate';
  /**
   * false = selecting this tab does not change what the transport plays
   * (e.g. the Presets browser). Default true.
   */
  providesPlayable?: boolean;
  Panel: ComponentType<ModePanelProps<P>>;
}

/** Identity helper for type inference: `export const mode = defineMode({...})`. */
export function defineMode<P>(def: ModeDefinition<P>): ModeDefinition<P> {
  return def;
}

// Heterogeneous registry type (params type is erased at the registry level).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyModeDefinition = ModeDefinition<any>;
