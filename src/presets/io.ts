/**
 * Preset import / export (JSON files). Pure helpers, unit-tested in io.test.ts.
 *
 * File format:
 *   { "format": "tesla-coil-studio-presets", "version": 1, "exportedAt": ISO,
 *     "presets": [{ "name", "mode", "params", "description"?, "createdAt"? }] }
 * A bare array of such objects is accepted on import as well.
 */
import { isModeId, type ModeId } from '../studio/types';
import type { Preset } from './types';

export const PRESET_FILE_FORMAT = 'tesla-coil-studio-presets';
export const PRESET_FILE_VERSION = 1;
/** Refuse larger files (a preset is a few KB at most). */
export const MAX_IMPORT_BYTES = 2_000_000;
export const MAX_IMPORT_PRESETS = 500;
export const MAX_NAME_LENGTH = 80;
export const MAX_DESCRIPTION_LENGTH = 400;

export type PresetData = Omit<Preset, 'id' | 'builtIn'>;

export function serializePresets(presets: readonly Preset[], now = new Date()): string {
  return JSON.stringify(
    {
      format: PRESET_FILE_FORMAT,
      version: PRESET_FILE_VERSION,
      exportedAt: now.toISOString(),
      presets: presets.map((p) => {
        const out: PresetData = { name: p.name, mode: p.mode, params: p.params };
        if (p.description) out.description = p.description;
        if (p.createdAt) out.createdAt = p.createdAt;
        return out;
      }),
    },
    null,
    2,
  );
}

export interface ImportResult {
  presets: PresetData[];
  /** Entries that were not valid presets. */
  invalid: number;
}

/**
 * Parse and validate an exported presets file. `normalize(mode, params)`
 * returns the mode's normalized params, or undefined when the mode cannot
 * take presets. Throws an Error with a user-readable message when the file
 * itself is unusable.
 */
export function parsePresetFile(text: string, normalize: (mode: ModeId, params: unknown) => unknown): ImportResult {
  if (text.length > MAX_IMPORT_BYTES) throw new Error('File is too large to be a presets file.');
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('File is not valid JSON.');
  }
  let list: unknown;
  if (Array.isArray(data)) list = data;
  else if (data && typeof data === 'object') {
    const d = data as Record<string, unknown>;
    if (d.format !== PRESET_FILE_FORMAT) throw new Error('Not a Tesla Coil Studio presets file.');
    if (typeof d.version !== 'number' || d.version > PRESET_FILE_VERSION) throw new Error('This presets file was made by a newer version of the app.');
    list = d.presets;
  }
  if (!Array.isArray(list)) throw new Error('No presets found in the file.');

  const presets: PresetData[] = [];
  let invalid = 0;
  for (const item of list.slice(0, MAX_IMPORT_PRESETS)) {
    const p = validateEntry(item, normalize);
    if (p) presets.push(p);
    else invalid++;
  }
  invalid += Math.max(0, list.length - MAX_IMPORT_PRESETS);
  return { presets, invalid };
}

function validateEntry(item: unknown, normalize: (mode: ModeId, params: unknown) => unknown): PresetData | null {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
  const r = item as Record<string, unknown>;
  if (!isModeId(r.mode) || r.mode === 'presets') return null;
  if (typeof r.name !== 'string' || !r.name.trim()) return null;
  if (!('params' in r) || r.params === null || typeof r.params !== 'object') return null;
  const params = normalize(r.mode, r.params);
  if (params === undefined) return null;
  const out: PresetData = { name: r.name.trim().slice(0, MAX_NAME_LENGTH), mode: r.mode, params };
  if (typeof r.description === 'string' && r.description.trim()) out.description = r.description.trim().slice(0, MAX_DESCRIPTION_LENGTH);
  if (typeof r.createdAt === 'number' && Number.isFinite(r.createdAt) && r.createdAt > 0) out.createdAt = r.createdAt;
  return out;
}

/** Identity used to skip duplicates on import (same mode, name and params). */
export function presetKey(p: Pick<Preset, 'mode' | 'name' | 'params'>): string {
  return `${p.mode}\u0000${p.name.trim().toLowerCase()}\u0000${JSON.stringify(p.params)}`;
}
