/**
 * User preset storage (localStorage). Observable so React can use
 * useSyncExternalStore(subscribePresets, getUserPresets).
 */
import { readJson, writeJson } from '../lib/persist';
import { isModeId, type ModeId } from '../studio/types';
import { BUILT_IN_PRESETS } from './builtIn';
import type { Preset } from './types';

const KEY = 'tcs.presets.v1';
const listeners = new Set<() => void>();
let cache: Preset[] | null = null;

function isPreset(x: unknown): x is Preset {
  if (!x || typeof x !== 'object') return false;
  const p = x as Record<string, unknown>;
  return typeof p.id === 'string' && typeof p.name === 'string' && isModeId(p.mode) && 'params' in p;
}

/** User presets (stable array reference until changed). */
export function getUserPresets(): Preset[] {
  if (cache === null) {
    const raw = readJson<unknown>(KEY, []);
    cache = Array.isArray(raw) ? raw.filter(isPreset).map((p) => ({ ...p, builtIn: false })) : [];
  }
  return cache;
}

function commit(next: Preset[]): void {
  cache = next;
  writeJson(KEY, next);
  for (const l of listeners) l();
}

export function subscribePresets(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function createPresetId(): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `user-${Date.now().toString(36)}-${rand}`;
}

/** Insert or replace (by id) a user preset. Returns the stored preset. */
export function saveUserPreset<P>(input: { id?: string; name: string; mode: ModeId; params: P; description?: string }): Preset<P> {
  const preset: Preset<P> = {
    id: input.id ?? createPresetId(),
    name: input.name.trim() || 'Untitled',
    mode: input.mode,
    params: JSON.parse(JSON.stringify(input.params)) as P,
    description: input.description,
    createdAt: Date.now(),
    builtIn: false,
  };
  const list = getUserPresets().filter((p) => p.id !== preset.id);
  commit([...list, preset as Preset]);
  return preset;
}

export function deleteUserPreset(id: string): void {
  commit(getUserPresets().filter((p) => p.id !== id));
}

export function getPreset(id: string): Preset | undefined {
  return BUILT_IN_PRESETS.find((p) => p.id === id) ?? getUserPresets().find((p) => p.id === id);
}

/** Built-ins first, then user presets; optionally filtered by mode. */
export function getAllPresets(mode?: ModeId): Preset[] {
  const all = [...BUILT_IN_PRESETS, ...getUserPresets()];
  return mode ? all.filter((p) => p.mode === mode) : all;
}

/** Testing hook: forget the in-memory cache. */
export function _resetPresetCache(): void {
  cache = null;
}
