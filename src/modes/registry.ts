/**
 * Mode registry: tab order. Each mode lives in src/modes/<id>/index.tsx and
 * exports `mode` (a ModeDefinition). Mode authors do NOT need to edit this file.
 */
import type { AnyModeDefinition } from '../studio/types';
import { mode as ramp } from './ramp';
import { mode as pulse } from './pulse';
import { mode as siren } from './siren';
import { mode as random } from './random';
import { mode as melody } from './melody';
import { mode as sequencer } from './sequencer';
import { mode as midi } from './midi';
import { mode as frequency } from './frequency';
import { mode as presets } from './presets';

export const MODES: readonly AnyModeDefinition[] = [ramp, pulse, siren, random, melody, sequencer, midi, frequency, presets];
