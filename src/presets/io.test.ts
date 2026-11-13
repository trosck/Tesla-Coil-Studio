import { describe, expect, it } from 'vitest';
import type { ModeId } from '../studio/types';
import { PRESET_FILE_FORMAT, parsePresetFile, planImport, presetKey, serializePresets } from './io';
import type { Preset } from './types';

const normalize = (mode: ModeId, params: unknown) => (mode === 'midi' ? undefined : { ...(params as object), ok: true });

const sample: Preset[] = [
  { id: 'user-1', name: 'Mine', mode: 'siren', params: { minFreq: 300 }, description: 'desc', createdAt: 5 },
  { id: 'user-2', name: 'Tone', mode: 'frequency', params: { frequency: 220 } },
];

describe('preset files', () => {
  it('round-trips through serialize / parse (ids dropped, params normalized)', () => {
    const text = serializePresets(sample, new Date(0));
    const parsed = JSON.parse(text) as { format: string; presets: unknown[] };
    expect(parsed.format).toBe(PRESET_FILE_FORMAT);
    const r = parsePresetFile(text, normalize);
    expect(r.invalid).toBe(0);
    expect(r.presets).toEqual([
      { name: 'Mine', mode: 'siren', params: { minFreq: 300, ok: true }, description: 'desc', createdAt: 5 },
      { name: 'Tone', mode: 'frequency', params: { frequency: 220, ok: true } },
    ]);
  });

  it('accepts a bare array and skips invalid entries', () => {
    const r = parsePresetFile(
      JSON.stringify([
        { name: 'ok', mode: 'pulse', params: {} },
        { name: '', mode: 'pulse', params: {} },
        { name: 'bad mode', mode: 'laser', params: {} },
        { name: 'presets tab', mode: 'presets', params: {} },
        { name: 'no params', mode: 'pulse' },
        { name: 'rejected by mode', mode: 'midi', params: {} },
        42,
      ]),
      normalize,
    );
    expect(r.presets.map((p) => p.name)).toEqual(['ok']);
    expect(r.invalid).toBe(6);
  });

  it('rejects unusable files with readable errors', () => {
    expect(() => parsePresetFile('not json', normalize)).toThrow(/JSON/);
    expect(() => parsePresetFile('{"format":"other","presets":[]}', normalize)).toThrow(/Not a Tesla Coil Studio/);
    expect(() => parsePresetFile(`{"format":"${PRESET_FILE_FORMAT}","version":99,"presets":[]}`, normalize)).toThrow(/newer/);
    expect(() => parsePresetFile('"text"', normalize)).toThrow(/No presets/);
  });

  it('presetKey identifies duplicates regardless of case/whitespace in the name', () => {
    expect(presetKey({ mode: 'siren', name: ' Mine ', params: { a: 1 } })).toBe(presetKey({ mode: 'siren', name: 'mine', params: { a: 1 } }));
    expect(presetKey({ mode: 'siren', name: 'mine', params: { a: 1 } })).not.toBe(presetKey({ mode: 'siren', name: 'mine', params: { a: 2 } }));
  });
});

describe('planImport', () => {
  const a = { name: 'A', mode: 'siren' as const, params: { x: 1 } };
  const b = { name: 'B', mode: 'pulse' as const, params: {} };

  it('skips existing and repeated presets and summarizes', () => {
    const r = planImport({ presets: [a, b, { ...b, name: ' b ' }], invalid: 2 }, [presetKey(a)]);
    expect(r.fresh).toEqual([b]);
    expect(r.message).toEqual({ kind: 'ok', text: 'Imported 1 preset (2 already present, 2 invalid skipped).' });
  });

  it('reports an error when nothing usable was found', () => {
    expect(planImport({ presets: [], invalid: 3 }, []).message).toEqual({ kind: 'error', text: 'Imported 0 presets (3 invalid skipped).' });
  });

  it('counts all-duplicate imports as ok', () => {
    expect(planImport({ presets: [a], invalid: 0 }, [presetKey(a)]).message).toEqual({ kind: 'ok', text: 'Imported 0 presets (1 already present).' });
  });
});
