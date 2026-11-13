import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { useBackdropClose } from '../../lib/useBackdropClose';
import { MAX_DESCRIPTION_LENGTH, MAX_NAME_LENGTH } from '../../presets/io';
import { saveUserPreset } from '../../presets/storage';
import type { Preset } from '../../presets/types';
import { useStudio } from '../../studio/StudioContext';
import { Button, Icon } from '../ui';
import { CloseGlyph } from './icons';
import './shell.css';

/** "Save current…" from the explorer toolbar: stores the source mode's params as a user preset. */
export function SavePresetDialog({ onClose, onSaved }: { onClose: () => void; onSaved: (p: Preset) => void }) {
  const { modes, sourceModeId, getParams } = useStudio();
  const ref = useRef<HTMLDialogElement>(null);
  const backdrop = useBackdropClose(onClose);
  const ids = useId();
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const mode = modes.find((m) => m.id === sourceModeId);
  const label = mode?.label ?? sourceModeId;
  const fallbackName = `My ${label.toLowerCase()} preset`;

  useEffect(() => {
    const d = ref.current;
    // No close() in cleanup (StrictMode double-mount would fire onClose). Unmount removes it.
    if (d && !d.open) d.showModal();
  }, []);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const p = saveUserPreset({ name: name.trim() || fallbackName, mode: sourceModeId, params: getParams(sourceModeId), description: desc });
    onSaved(p);
    onClose();
  };

  return (
    <dialog ref={ref} className="xp-dialog win" aria-labelledby={`${ids}-title`} onCancel={onClose} onClose={onClose} {...backdrop}>
      <div className="titlebar xp-dialog__title">
        <span id={`${ids}-title`} className="xp-dialog__title-text">
          Save current settings
        </span>
        <button type="button" className="wbtn x" aria-label="Close" onClick={onClose}>
          <CloseGlyph />
        </button>
      </div>
      <form onSubmit={submit}>
        <div className="xp-dialog__body">
          <p className="xp-dialog__intro">
            Saves the current <b>{label}</b> settings (what PLAY and EXPORT use) to <b>My presets</b>.
            {sourceModeId === 'midi' && ' MIDI presets keep the conversion settings only, not the MIDI file.'}
          </p>
          <div className="ui-field">
            <label className="ui-field__label" htmlFor={`${ids}-name`}>
              Name
            </label>
            <input id={`${ids}-name`} className="ui-input" placeholder={fallbackName} value={name} maxLength={MAX_NAME_LENGTH} onChange={(e) => setName(e.target.value)} autoFocus />
          </div>
          <div className="ui-field">
            <label className="ui-field__label" htmlFor={`${ids}-desc`}>
              Description <span className="xp-dialog__optional">(optional)</span>
            </label>
            <textarea id={`${ids}-desc`} className="ui-input xp-dialog__textarea" rows={2} value={desc} maxLength={MAX_DESCRIPTION_LENGTH} onChange={(e) => setDesc(e.target.value)} />
          </div>
        </div>
        <footer className="xp-dialog__foot">
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" icon={<Icon name="save" />}>
            Save preset
          </Button>
        </footer>
      </form>
    </dialog>
  );
}
