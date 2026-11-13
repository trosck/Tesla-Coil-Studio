/** Open/close state of the Setup guide (opened from the menu bar, task pane, desktop icon and Presets mode; rendered by App). */
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
