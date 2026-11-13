import { useRef, useState, useSyncExternalStore } from 'react';
import { BUILT_IN_PRESETS } from '../../presets/builtIn';
import { getUserPresets, subscribePresets } from '../../presets/storage';
import { ModeHost } from '../../studio/ModeHost';
import { usePlayback, useStudio } from '../../studio/StudioContext';
import { WAVE_NAME } from '../visualizer/Readouts';
import { PxFolder, PxSave } from './icons';
import { exportUserPresets, importPresetFile, type ActionResult } from './presetFileActions';
import { SavePresetDialog } from './SavePresetDialog';
import { panelId, tabId } from './TaskPane';

/** White explorer area: preset toolbar + address bar, the active mode editor, XP status bar. */
export function Explorer() {
  const { modes, activeModeId, sourceModeId } = useStudio();
  const user = useSyncExternalStore(subscribePresets, getUserPresets, getUserPresets);
  const sampleRate = usePlayback((s) => s.sampleRate);
  const waveform = usePlayback((s) => s.waveform);
  const duty = usePlayback((s) => Math.round(s.duty * 100));
  const [saveOpen, setSaveOpen] = useState(false);
  const [message, setMessage] = useState<ActionResult | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const active = modes.find((m) => m.id === activeModeId) ?? modes[0]!;
  const sourceLabel = modes.find((m) => m.id === sourceModeId)?.label ?? sourceModeId;
  const objects = activeModeId === 'presets' ? BUILT_IN_PRESETS.length + user.length : [...BUILT_IN_PRESETS, ...user].filter((p) => p.mode === activeModeId).length;
  const objText = activeModeId === 'presets' ? `${objects} object${objects === 1 ? '' : 's'}` : `${objects} preset${objects === 1 ? '' : 's'}`;
  const rate = sampleRate ? `${(sampleRate / 1000).toFixed(1)} kHz` : '44.1 kHz';

  return (
    <main className="explorer">
      <div className="explorer__bar">
        <div className="explorer__tools" role="group" aria-label="Presets">
          <button type="button" className="flat" onClick={() => setSaveOpen(true)} aria-haspopup="dialog" title={`Save the current ${sourceLabel} settings as a preset`}>
            <PxSave />
            Save current…
          </button>
          <button type="button" className="flat" onClick={() => fileRef.current?.click()} title="Import presets from a JSON file">
            <PxFolder arrow="up" />
            Import
          </button>
          <button
            type="button"
            className="flat"
            onClick={() => setMessage(exportUserPresets())}
            disabled={user.length === 0}
            title={user.length ? 'Download My presets as a JSON file' : 'No saved presets to export yet'}
          >
            <PxFolder arrow="down" />
            Export
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) void importPresetFile(f, modes).then(setMessage);
            }}
          />
        </div>
        <div className="explorer__address" aria-hidden="true">
          <span className="explorer__address-label">Address</span>
          <span className="explorer__address-field">
            <PxFolder size={16} />
            <span className="explorer__address-text">C:\Coil Studio\Presets\{activeModeId === 'presets' ? '' : active.label}</span>
          </span>
          <span className="gel gel-green explorer__go">Go</span>
        </div>
      </div>

      <div id={panelId(active.id)} role="tabpanel" aria-labelledby={tabId(active.id)} className="explorer__content" key={active.id}>
        <ModeHost mode={active} />
      </div>

      <div className="statusbar">
        <span className="statusbar__cell">{objText}</span>
        <span className="statusbar__cell">
          PLAY / EXPORT use: <b>{sourceLabel}</b>
        </span>
        <span className="statusbar__cell">{rate} · mono</span>
        <span className="statusbar__cell">
          {WAVE_NAME[waveform]}
          {waveform === 'square' && ` · ${duty}% duty`}
        </span>
        <span className={`statusbar__cell statusbar__msg${message?.kind === 'error' ? ' statusbar__msg--error' : ''}`} role="status">
          {message?.text}
        </span>
      </div>

      {saveOpen && <SavePresetDialog onClose={() => setSaveOpen(false)} onSaved={(p) => setMessage({ kind: 'ok', text: `Saved “${p.name}” to My presets.` })} />}
    </main>
  );
}
