import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

class MemoryStorage {
  private m = new Map<string, string>();
  get length() {
    return this.m.size;
  }
  key(i: number) {
    return [...this.m.keys()][i] ?? null;
  }
  getItem(k: string) {
    return this.m.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, String(v));
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
}

let ls: MemoryStorage;

beforeEach(() => {
  vi.resetModules();
  ls = new MemoryStorage();
  vi.stubGlobal('localStorage', ls);
});
afterEach(() => vi.unstubAllGlobals());

describe('storage versioning', () => {
  it('clears app keys stored without a version, keeps foreign keys', async () => {
    ls.setItem('tcs.modeParams.v1', '{"gate":0.5}');
    ls.setItem('other.app', 'x');
    const { readJson, STORAGE_VERSION } = await import('./persist');
    expect(readJson('tcs.modeParams.v1', null)).toBeNull();
    expect(ls.getItem('other.app')).toBe('x');
    expect(ls.getItem('tcs.storageVersion')).toBe(String(STORAGE_VERSION));
  });

  it('clears app keys from an older version', async () => {
    ls.setItem('tcs.storageVersion', '0');
    ls.setItem('tcs.presets.v1', '[]');
    const { readJson } = await import('./persist');
    expect(readJson('tcs.presets.v1', 'none')).toBe('none');
  });

  it('keeps data stored under the current version', async () => {
    const { STORAGE_VERSION } = await import('./persist');
    vi.resetModules();
    ls.setItem('tcs.storageVersion', String(STORAGE_VERSION));
    ls.setItem('tcs.presets.v1', '[1]');
    const { readJson, writeJson } = await import('./persist');
    expect(readJson('tcs.presets.v1', [])).toEqual([1]);
    writeJson('tcs.presets.v1', [2]);
    expect(readJson('tcs.presets.v1', [])).toEqual([2]);
  });
});
