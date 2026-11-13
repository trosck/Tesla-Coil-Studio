import { useStudio } from '../../studio/StudioContext';
import type { AnyModeDefinition } from '../../studio/types';

/**
 * What PLAY / EXPORT use right now: the source mode and a display name
 * (the loaded preset's name while it belongs to the source mode, else the mode label).
 */
export function useNowShowing(): { sourceMode: AnyModeDefinition; name: string } {
  const { modes, sourceModeId, loadedPreset } = useStudio();
  const sourceMode = modes.find((m) => m.id === sourceModeId) ?? modes[0]!;
  const name = loadedPreset && loadedPreset.mode === sourceModeId ? loadedPreset.name : sourceMode.label;
  return { sourceMode, name };
}
