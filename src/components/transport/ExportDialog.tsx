import { useEffect, useRef, useState } from 'react';
import { MAX_EXPORT_SECONDS, downloadBlob, renderWav, timestampedName } from '../../audio/export/renderWav';
import type { Playable } from '../../audio/types';
import { useStudio } from '../../studio/StudioContext';
import { Button, Icon, NumberField, SegmentedControl, Slider } from '../ui';

type Mode = 'loops' | 'duration';

export function ExportDialog({ playable, onClose }: { playable: Playable; onClose: () => void }) {
  const { engine } = useStudio();
  const ref = useRef<HTMLDialogElement>(null);
  const [mode, setMode] = useState<Mode>('loops');
  const [loops, setLoops] = useState(4);
  const [duration, setDuration] = useState(30);
  const [volume, setVolume] = useState(() => Math.round(engine.state.masterVolume * 100));
  const [channels, setChannels] = useState<'mono' | 'stereo'>('mono');
  const [rendering, setRendering] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const d = ref.current;
    // No close() in cleanup: it would fire onClose (StrictMode double-mount). Unmount removes it.
    if (d && !d.open) d.showModal();
  }, []);

  const doExport = () => {
    setRendering(true);
    setError(null);
    // let the UI paint "Rendering…" before the synchronous render
    setTimeout(() => {
      try {
        const st = engine.state;
        const wav = renderWav(playable, {
          loops: mode === 'loops' ? loops : undefined,
          durationSeconds: mode === 'duration' ? duration : undefined,
          volume: volume / 100,
          stereo: channels === 'stereo',
          waveform: st.waveform,
          duty: st.duty,
        });
        downloadBlob(wav, timestampedName(playable.label ?? 'tesla-coil'));
        onClose();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setRendering(false);
      }
    }, 30);
  };

  return (
    <dialog ref={ref} className="export" aria-labelledby="export-title" onCancel={onClose} onClose={onClose}>
      <header className="export__head">
        <h2 id="export-title">Export WAV</h2>
        <Button variant="ghost" size="sm" aria-label="Close" icon={<Icon name="close" />} onClick={onClose} />
      </header>
      <div className="export__body">
        <SegmentedControl
          aria-label="Export length"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'loops', label: 'Number of loops' },
            { value: 'duration', label: 'Duration' },
          ]}
        />
        {mode === 'loops' ? (
          <NumberField label="Loops" value={loops} min={1} max={999} step={1} onChange={setLoops} hint={`Capped at ${MAX_EXPORT_SECONDS / 60} minutes`} />
        ) : (
          <NumberField label="Duration" value={duration} min={0.5} max={MAX_EXPORT_SECONDS} step={0.5} precision={1} unit="s" onChange={setDuration} />
        )}
        <Slider label="Volume" value={volume} min={0} max={100} step={1} unit="%" onChange={setVolume} />
        <div className="ui-field">
          <span className="ui-field__label">Channels</span>
          <SegmentedControl
            aria-label="Channels"
            value={channels}
            onChange={setChannels}
            options={[
              { value: 'mono', label: 'Mono' },
              { value: 'stereo', label: 'Stereo' },
            ]}
          />
        </div>
        <p className="export__fixed mono">44.1 kHz · 16-bit PCM · uses current waveform &amp; duty</p>
        {error && <p className="export__error">{error}</p>}
      </div>
      <footer className="export__foot">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="primary" icon={<Icon name="download" />} onClick={doExport} disabled={rendering}>
          {rendering ? 'Rendering…' : 'Export'}
        </Button>
      </footer>
    </dialog>
  );
}
