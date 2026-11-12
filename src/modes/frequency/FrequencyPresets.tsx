import { useState, useSyncExternalStore } from 'react';
import { Button, Panel } from '../../components/ui';
import { BUILT_IN_PRESETS } from '../../presets/builtIn';
import { deleteUserPreset, getUserPresets, saveUserPreset, subscribePresets } from '../../presets/storage';
import type { Preset } from '../../presets/types';
import { useStudio } from '../../studio/StudioContext';
import { normalizeFrequencyParams, type FrequencyParams } from './build';
import { formatHz } from './controls';

function summary(raw: unknown): string {
  const p = normalizeFrequencyParams(raw);
  if (p.subMode === 'sweep') return `Sweep ${formatHz(p.sweep.from)} → ${formatHz(p.sweep.to)} Hz · ${p.sweep.duration} s`;
  if (p.subMode === 'sequence') return `Sequence · ${p.steps.length} steps`;
  return `Steady ${formatHz(p.frequency)} Hz`;
}

/** Save / list / apply / delete frequency-mode presets (shared with the global preset library). */
export function FrequencyPresets({ params }: { params: FrequencyParams }) {
  const { loadPreset } = useStudio();
  const user = useSyncExternalStore(subscribePresets, getUserPresets, getUserPresets);
  const [name, setName] = useState('');
  const presets: Preset[] = [...BUILT_IN_PRESETS.filter((p) => p.mode === 'frequency'), ...user.filter((p) => p.mode === 'frequency')];

  const defaultName = () => {
    if (params.subMode === 'sweep') return `Sweep ${formatHz(params.sweep.from)}–${formatHz(params.sweep.to)} Hz`;
    if (params.subMode === 'sequence') return `Frequency sequence (${params.steps.length})`;
    return `${formatHz(params.frequency)} Hz`;
  };

  return (
    <Panel title="My frequencies" className="mode-frequency__presets">
      <form
        className="mode-frequency__preset-save"
        onSubmit={(e) => {
          e.preventDefault();
          saveUserPreset({ name: name.trim() || defaultName(), mode: 'frequency', params });
          setName('');
        }}
      >
        <input className="ui-input" placeholder={`Name (default: ${defaultName()})`} value={name} maxLength={60} onChange={(e) => setName(e.target.value)} aria-label="Preset name" />
        <Button type="submit" variant="primary">
          Save current
        </Button>
      </form>
      {presets.length === 0 ? (
        <p className="mode-frequency__tip">No saved frequencies yet.</p>
      ) : (
        <ul className="mode-frequency__preset-list" aria-label="Frequency presets">
          {presets.map((p) => (
            <li key={p.id} className="mode-frequency__preset">
              <div className="mode-frequency__preset-text">
                <span className="mode-frequency__preset-name">{p.name}</span>
                <span className="mode-frequency__preset-meta">
                  {summary(p.params)}
                  {p.builtIn && ' · built-in'}
                </span>
              </div>
              <div className="mode-frequency__preset-actions">
                <Button size="sm" onClick={() => loadPreset(p)}>
                  Apply
                </Button>
                {!p.builtIn && (
                  <Button size="sm" variant="ghost" onClick={() => deleteUserPreset(p.id)} aria-label={`Delete preset ${p.name}`}>
                    Delete
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
