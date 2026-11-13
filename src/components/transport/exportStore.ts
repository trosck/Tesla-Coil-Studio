/** Open/close state of the Export WAV dialog (opened from the player dock, desktop icon and task pane). */
import { createStore } from '../../lib/store';

export const exportStore = createStore({ open: false });

export function openExport(): void {
  exportStore.setState({ open: true });
}

export function closeExport(): void {
  exportStore.setState({ open: false });
}
