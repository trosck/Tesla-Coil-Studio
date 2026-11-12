import type { ModeId } from '../studio/types';

export interface Preset<P = unknown> {
  id: string;
  name: string;
  mode: ModeId;
  /** The mode's params object (JSON). Passed through the mode's normalizeParams on load. */
  params: P;
  builtIn?: boolean;
  description?: string;
  /** ms since epoch (user presets). */
  createdAt?: number;
}
