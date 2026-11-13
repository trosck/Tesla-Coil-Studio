/** Explorer toolbar actions: export / import user presets as JSON (same format as the Presets mode). */
import { downloadBlob, timestampedName } from '../../audio/export/renderWav';
import { parsePresetFile, presetKey, serializePresets } from '../../presets/io';
import { addUserPresets, getUserPresets } from '../../presets/storage';
import { normalizeModeParams } from '../../studio/params';
import type { AnyModeDefinition, ModeId } from '../../studio/types';

export interface ActionResult {
  kind: 'ok' | 'error';
  text: string;
}

const plural = (n: number) => `${n} preset${n === 1 ? '' : 's'}`;

export function exportUserPresets(): ActionResult {
  const user = getUserPresets();
  if (user.length === 0) return { kind: 'error', text: 'No saved presets to export yet.' };
  downloadBlob(serializePresets(user), timestampedName('tesla-coil-presets', 'json'), 'application/json');
  return { kind: 'ok', text: `Exported ${plural(user.length)}.` };
}

export async function importPresetFile(file: File, modes: readonly AnyModeDefinition[]): Promise<ActionResult> {
  const normalize = (mode: ModeId, params: unknown): unknown => {
    const def = modes.find((m) => m.id === mode);
    return def && def.providesPlayable !== false ? normalizeModeParams(def, params) : undefined;
  };
  try {
    const { presets, invalid } = parsePresetFile(await file.text(), normalize);
    const existing = new Set(getUserPresets().map(presetKey));
    const fresh = presets.filter((p) => {
      const k = presetKey(p);
      if (existing.has(k)) return false;
      existing.add(k);
      return true;
    });
    addUserPresets(fresh);
    const dupes = presets.length - fresh.length;
    const notes = [dupes > 0 && `${dupes} already present`, invalid > 0 && `${invalid} invalid skipped`].filter(Boolean).join(', ');
    return { kind: fresh.length > 0 || dupes > 0 ? 'ok' : 'error', text: `Imported ${plural(fresh.length)}${notes ? ` (${notes})` : ''}.` };
  } catch (e) {
    return { kind: 'error', text: `Import failed: ${e instanceof Error ? e.message : String(e)}` };
  }
}
