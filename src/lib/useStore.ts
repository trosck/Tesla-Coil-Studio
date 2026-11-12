import { useSyncExternalStore } from 'react';
import type { Store } from './store';

/**
 * Subscribe to a store, optionally selecting a slice. Return primitives (or
 * stable references) from the selector to avoid needless re-renders.
 */
export function useStore<T, S = T>(store: Store<T>, selector?: (s: T) => S): S {
  const get = () => (selector ? selector(store.getSnapshot()) : (store.getSnapshot() as unknown as S));
  return useSyncExternalStore(store.subscribe, get, get);
}
