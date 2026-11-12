/** Mode params normalization + persistence (pure helpers, unit-testable). */
import { readJson, writeJson } from '../lib/persist';
import type { AnyModeDefinition, ModeId } from './types';

const KEY = 'tcs.modeParams.v1';

function isPlainObject(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

/** Default normalization: shallow-merge a stored object over defaultParams. */
export function normalizeModeParams(def: AnyModeDefinition, raw: unknown): unknown {
  if (def.normalizeParams) {
    try {
      return def.normalizeParams(raw);
    } catch {
      return def.defaultParams;
    }
  }
  if (raw === undefined) return def.defaultParams;
  if (isPlainObject(def.defaultParams)) {
    return isPlainObject(raw) ? { ...def.defaultParams, ...raw } : def.defaultParams;
  }
  return raw;
}

export type ParamsByMode = Partial<Record<ModeId, unknown>>;

export function loadParamsByMode(modes: readonly AnyModeDefinition[]): ParamsByMode {
  const stored = readJson<unknown>(KEY, {});
  const src = isPlainObject(stored) ? stored : {};
  const out: ParamsByMode = {};
  for (const m of modes) out[m.id] = normalizeModeParams(m, src[m.id]);
  return out;
}

export function saveParamsByMode(params: ParamsByMode): void {
  writeJson(KEY, params);
}
