import { describe, expect, it } from 'vitest';
import { normalizeModeParams } from './params';
import { defineMode, type AnyModeDefinition } from './types';

const Panel = () => null;

describe('normalizeModeParams', () => {
  const plain: AnyModeDefinition = defineMode({ id: 'ramp', label: 'R', description: '', defaultParams: { a: 1, b: 2 }, Panel });
  it('shallow-merges stored objects over defaults', () => {
    expect(normalizeModeParams(plain, { b: 5 })).toEqual({ a: 1, b: 5 });
    expect(normalizeModeParams(plain, undefined)).toEqual({ a: 1, b: 2 });
    expect(normalizeModeParams(plain, 'garbage')).toEqual({ a: 1, b: 2 });
  });
  it('uses the mode normalizer and falls back to defaults if it throws', () => {
    const custom: AnyModeDefinition = {
      ...plain,
      normalizeParams: (raw: unknown) => {
        if (raw === 'boom') throw new Error('x');
        return { a: 9, b: 9 };
      },
    };
    expect(normalizeModeParams(custom, {})).toEqual({ a: 9, b: 9 });
    expect(normalizeModeParams(custom, 'boom')).toEqual({ a: 1, b: 2 });
  });
});
