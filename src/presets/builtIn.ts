/**
 * Built-in presets (read-only, shipped with the app). A later agent fills this
 * list; ids must be unique and stable (prefix "builtin-").
 */
import type { Preset } from './types';

export const BUILT_IN_PRESETS: readonly Preset[] = [
  {
    id: 'builtin-test-a4',
    name: 'Test tone A4 (440 Hz)',
    mode: 'frequency',
    params: { frequency: 440, gain: 0.8 },
    builtIn: true,
    description: 'Steady square wave for checking the coil and Bluetooth link.',
  },
  {
    id: 'builtin-test-low',
    name: 'Low buzz (120 Hz)',
    mode: 'frequency',
    params: { frequency: 120, gain: 0.8 },
    builtIn: true,
  },
];
