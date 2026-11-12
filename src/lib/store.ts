/**
 * Tiny observable store compatible with React's useSyncExternalStore.
 * Snapshots are immutable: setState always produces a new object.
 */
export interface Store<T> {
  getSnapshot(): T;
  subscribe(listener: () => void): () => void;
  setState(patch: Partial<T> | ((prev: T) => Partial<T>)): void;
}

export function createStore<T extends object>(initial: T): Store<T> {
  let state = initial;
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setState(patch) {
      const p = typeof patch === 'function' ? patch(state) : patch;
      let changed = false;
      for (const k in p) {
        if (!Object.is(p[k], state[k])) {
          changed = true;
          break;
        }
      }
      if (!changed) return;
      state = { ...state, ...p };
      for (const l of listeners) l();
    },
  };
}
