/** Safe localStorage JSON helpers (never throw; storage may be unavailable). */

/**
 * Version of the app's stored data. Bump it only when a change makes data
 * saved by an older build behave wrongly: on the next start every app key
 * ("tcs.*") stored under a lower version is removed, so the app starts from
 * its defaults.
 */
export const STORAGE_VERSION = 1;
const VERSION_KEY = 'tcs.storageVersion';
const APP_PREFIX = 'tcs.';

let versionChecked = false;

/** Clear the app's keys once if they were stored by an older version. Runs before the first read/write. */
export function ensureStorageVersion(): void {
  if (versionChecked) return;
  versionChecked = true;
  try {
    const ls = globalThis.localStorage;
    if (!ls) return;
    const stored = Number(ls.getItem(VERSION_KEY)); // missing -> 0
    if (Number.isFinite(stored) && stored >= STORAGE_VERSION) return;
    for (let i = ls.length - 1; i >= 0; i--) {
      const key = ls.key(i);
      if (key?.startsWith(APP_PREFIX)) ls.removeItem(key);
    }
    ls.setItem(VERSION_KEY, String(STORAGE_VERSION));
  } catch {
    /* storage unavailable: nothing to migrate */
  }
}

export function readJson<T>(key: string, fallback: T): T {
  ensureStorageVersion();
  try {
    const raw = globalThis.localStorage?.getItem(key);
    if (raw == null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function writeJson(key: string, value: unknown): void {
  ensureStorageVersion();
  try {
    globalThis.localStorage?.setItem(key, JSON.stringify(value));
  } catch {
    /* quota / private mode: ignore */
  }
}
