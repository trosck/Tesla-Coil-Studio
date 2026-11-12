/** Open/close state of the Setup guide (shared by the header, the Presets tab and App). */
import { readJson, writeJson } from '../../lib/persist';
import { createStore } from '../../lib/store';

const SEEN_KEY = 'tcs.guideSeen.v1';

/** Auto-open on the first visit only (dismissal remembered in localStorage). */
export const guideStore = createStore({ open: !readJson<boolean>(SEEN_KEY, false) });

export function openGuide(): void {
  guideStore.setState({ open: true });
}

export function closeGuide(): void {
  writeJson(SEEN_KEY, true);
  guideStore.setState({ open: false });
}
