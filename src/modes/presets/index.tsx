/**
 * STUB — "Presets" browser. Minimal working list so the preset contract is
 * exercised end to end (load = switch tab + set params; save = snapshot the
 * source mode's params). A later agent replaces the UI.
 */
import { useState, useSyncExternalStore } from 'react';
import { ModeStub } from '../../components/ModeStub';
import { Button } from '../../components/ui';
import { BUILT_IN_PRESETS } from '../../presets/builtIn';
import { deleteUserPreset, getUserPresets, saveUserPreset, subscribePresets } from '../../presets/storage';
import type { Preset } from '../../presets/types';
import { useStudio } from '../../studio/StudioContext';
import { defineMode, type ModePanelProps } from '../../studio/types';
import './presets.css';

export type PresetsParams = Record<string, never>;

function PresetRow({ preset, onLoad, onDelete }: { preset: Preset; onLoad: () => void; onDelete?: () => void }) {
  return (
    <li className="mode-presets__row">
      <div>
        <div className="mode-presets__name">{preset.name}</div>
        <div className="mode-presets__meta">{preset.mode}</div>
      </div>
      <div className="mode-presets__actions">
        <Button size="sm" variant="primary" onClick={onLoad}>
          Load
        </Button>
        {onDelete && (
          <Button size="sm" variant="ghost" onClick={onDelete}>
            Delete
          </Button>
        )}
      </div>
    </li>
  );
}

function PresetsPanel(_props: ModePanelProps<PresetsParams>) {
  const { loadPreset, sourceModeId, getParams, modes } = useStudio();
  const user = useSyncExternalStore(subscribePresets, getUserPresets, getUserPresets);
  const [name, setName] = useState('');
  const sourceLabel = modes.find((m) => m.id === sourceModeId)?.label ?? sourceModeId;
  return (
    <ModeStub title="Presets">
      <div className="mode-presets">
        <form
          className="mode-presets__save"
          onSubmit={(e) => {
            e.preventDefault();
            saveUserPreset({ name: name || `${sourceLabel} preset`, mode: sourceModeId, params: getParams(sourceModeId) });
            setName('');
          }}
        >
          <input className="ui-input" placeholder={`Save current ${sourceLabel} settings as…`} value={name} onChange={(e) => setName(e.target.value)} aria-label="Preset name" />
          <Button type="submit">Save</Button>
        </form>
        <ul className="mode-presets__list" aria-label="Presets">
          {BUILT_IN_PRESETS.map((p) => (
            <PresetRow key={p.id} preset={p} onLoad={() => loadPreset(p)} />
          ))}
          {user.map((p) => (
            <PresetRow key={p.id} preset={p} onLoad={() => loadPreset(p)} onDelete={() => deleteUserPreset(p.id)} />
          ))}
        </ul>
      </div>
    </ModeStub>
  );
}

export const mode = defineMode<PresetsParams>({
  id: 'presets',
  label: 'Presets',
  description: 'Load built-in presets or save your own.',
  defaultParams: {},
  providesPlayable: false,
  Panel: PresetsPanel,
});
