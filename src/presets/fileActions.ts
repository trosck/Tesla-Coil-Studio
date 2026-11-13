/**
 * Preset file actions shared by the Presets mode and the Explorer toolbar:
 * export the user's presets as JSON, import a presets file (skipping
 * duplicates). Pure parts live in io.ts.
 */
import { downloadBlob, timestampedName } from '../audio/export/renderWav';
import { normalizeModeParams } from '../studio/params';
import type { AnyModeDefinition, ModeId } from '../studio/types';
import { parsePresetFile, planImport, presetCount, presetKey, serializePresets, type PresetFileMessage } from './io';
import { addUserPresets, getUserPresets } from './storage';

export type { PresetFileMessage } from './io';

export function exportUserPresets(): PresetFileMessage {
  const user = getUserPresets();
  if (user.length === 0) return { kind: 'error', text: 'No saved presets to export yet.' };
  downloadBlob(serializePresets(user), timestampedName('tesla-coil-presets', 'json'), 'application/json');
  return { kind: 'ok', text: `Exported ${presetCount(user.length)}.` };
}

/** Import a presets file into My presets. `added` is how many new presets were stored. */
export async function importPresetFile(file: File, modes: readonly AnyModeDefinition[]): Promise<PresetFileMessage & { added: number }> {
  const normalize = (mode: ModeId, params: unknown): unknown => {
    const def = modes.find((m) => m.id === mode);
    return def && def.providesPlayable !== false ? normalizeModeParams(def, params) : undefined;
  };
  try {
    const parsed = parsePresetFile(await file.text(), normalize);
    const { fresh, message } = planImport(parsed, getUserPresets().map(presetKey));
    addUserPresets(fresh);
    return { ...message, added: fresh.length };
  } catch (e) {
    return { kind: 'error', text: `Import failed: ${e instanceof Error ? e.message : String(e)}`, added: 0 };
  }
}
