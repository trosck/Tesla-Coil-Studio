/** Short human-readable facts about a preset's params (card chips). Pure. */
import { NOTE_NAMES_SHARP, SCALES, midiToNoteName, type ScaleId } from '../../audio/music';
import type { Preset } from '../../presets/types';
import { normalizeFrequencyParams } from '../frequency/build';
import { normalizeMelodyParams } from '../melody/build';
import { PULSE_PATTERNS, normalizePulseParams } from '../pulse/build';
import { normalizeRampParams } from '../ramp/build';
import { normalizeRandomParams } from '../random/build';
import { SLOT_NAMES, normalizeSequencerParams, playOrder } from '../sequencer/build';
import { normalizeSirenParams } from '../siren/build';

export function fmtHz(f: number): string {
  if (f >= 1000) return `${parseFloat((f / 1000).toFixed(2))} kHz`;
  return `${parseFloat(f.toFixed(f < 100 ? 1 : 0))} Hz`;
}

function fmtSec(s: number): string {
  return `${parseFloat(s.toFixed(2))} s`;
}

/** e.g. "A minor", "C pentatonic", "chromatic". */
function scaleName(id: ScaleId, root: number): string {
  if (id === 'chromatic') return 'chromatic';
  const shape = SCALES[id].label.replace(/^[A-G]#? /, '').replace(/ \(.*\)$/, '').toLowerCase();
  return `${NOTE_NAMES_SHARP[((root % 12) + 12) % 12]} ${shape}`;
}

const DIRECTION_LABEL = { alternate: 'up / down', rise: 'rising', fall: 'falling' } as const;

export function summarizePreset(p: Pick<Preset, 'mode' | 'params'>): string[] {
  switch (p.mode) {
    case 'ramp': {
      const r = normalizeRampParams(p.params);
      return [`${fmtHz(r.startFreq)} → ${fmtHz(r.endFreq)}`, fmtSec(r.duration), r.upDown ? 'up & down' : r.curve, ...(r.steps > 1 ? [`${r.steps} steps`] : [])];
    }
    case 'pulse': {
      const r = normalizePulseParams(p.params);
      const pattern = r.pattern === 'custom' ? 'custom pattern' : (PULSE_PATTERNS.find((x) => x.id === r.pattern)?.label.toLowerCase() ?? r.pattern);
      return [`${Math.round(r.bpm)} BPM`, fmtHz(r.frequency), `${Math.round(r.pulseMs)} ms`, pattern];
    }
    case 'siren': {
      const r = normalizeSirenParams(p.params);
      const lo = Math.min(r.minFreq, r.maxFreq);
      const hi = Math.max(r.minFreq, r.maxFreq);
      return [`${fmtHz(lo)} – ${fmtHz(hi)}`, DIRECTION_LABEL[r.direction], `${fmtSec(r.cycleSeconds)} cycle`];
    }
    case 'random': {
      const r = normalizeRandomParams(p.params);
      const scale = r.scale === 'free' ? 'free pitch' : scaleName(r.scale, r.root);
      return [`${fmtHz(Math.min(r.minFreq, r.maxFreq))} – ${fmtHz(Math.max(r.minFreq, r.maxFreq))}`, scale, `${Math.round(r.bpm)} BPM`, `${Math.round(r.randomness * 100)}% random`];
    }
    case 'melody': {
      const r = normalizeMelodyParams(p.params);
      const pitched = r.notes.flatMap((n) => (n.midi === null ? [] : [n.midi]));
      const range = pitched.length ? `${midiToNoteName(Math.min(...pitched))}–${midiToNoteName(Math.max(...pitched))}` : 'no notes';
      return [`${pitched.length} notes`, range, `${Math.round(r.bpm)} BPM`];
    }
    case 'sequencer': {
      const r = normalizeSequencerParams(p.params);
      const order = playOrder(r);
      return [`${Math.round(r.bpm)} BPM`, order.length > 1 ? `chain ${order.map((i) => SLOT_NAMES[i]).join('→')}` : `pattern ${SLOT_NAMES[order[0]!]}`, scaleName(r.scale, r.root)];
    }
    case 'frequency': {
      const r = normalizeFrequencyParams(p.params);
      if (r.subMode === 'sweep') return [`${fmtHz(r.sweep.from)} → ${fmtHz(r.sweep.to)}`, fmtSec(r.sweep.duration), 'sweep'];
      if (r.subMode === 'sequence') return [`${r.steps.length} steps`, 'step sequence'];
      return [fmtHz(r.frequency), 'steady tone'];
    }
    case 'midi':
      return ['conversion settings'];
    default:
      return [];
  }
}
