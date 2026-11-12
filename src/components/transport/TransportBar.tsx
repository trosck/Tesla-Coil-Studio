import { useEffect, useState } from 'react';
import { downloadBlob, timestampedName } from '../../audio/export/renderWav';
import type { Waveform } from '../../audio/types';
import { usePlayback, useStudio } from '../../studio/StudioContext';
import { Button, Icon, SegmentedControl, Slider, type SegmentOption } from '../ui';
import { ExportDialog } from './ExportDialog';
import './transport.css';

const WAVEFORMS: readonly SegmentOption<Waveform>[] = [
  { value: 'square', label: 'Square', badge: 'recommended', title: 'Square wave — strongest, clearest arcs on a Tesla coil' },
  { value: 'sine', label: 'Sine' },
  { value: 'triangle', label: 'Triangle' },
  { value: 'sawtooth', label: 'Saw' },
];

function isEditable(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'BUTTON' || el.isContentEditable;
}

export function TransportBar() {
  const { engine, activePlayable, play, pause, stop } = useStudio();
  const isPlaying = usePlayback((s) => s.isPlaying);
  const isPaused = usePlayback((s) => s.isPaused);
  const loop = usePlayback((s) => s.loop);
  const isRecording = usePlayback((s) => s.isRecording);
  const recSeconds = usePlayback((s) => Math.floor(s.recordingSeconds));
  const volume = usePlayback((s) => s.masterVolume);
  const waveform = usePlayback((s) => s.waveform);
  const duty = usePlayback((s) => s.duty);
  const [exportOpen, setExportOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const canPlay = activePlayable !== null || isPaused;

  const toggleRecord = async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (isRecording) {
        const blob = await engine.stopRecording();
        if (blob) downloadBlob(blob, timestampedName('tesla-coil-recording'));
      } else {
        await engine.startRecording();
      }
    } finally {
      setBusy(false);
    }
  };

  // Space = play/pause (ignored while typing or when a control has focus)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.repeat || isEditable(e.target)) return;
      e.preventDefault();
      if (engine.state.isPlaying) pause();
      else void play();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [engine, play, pause]);

  return (
    <section className="transport" aria-label="Transport">
      <div className="transport__buttons">
        <Button
          variant="primary"
          size="lg"
          icon={<Icon name="play" />}
          onClick={() => void play()}
          disabled={!canPlay || isPlaying}
          className={isPlaying ? 'transport__playing' : undefined}
          title={activePlayable ? 'Play (Space)' : 'This mode has nothing to play yet'}
        >
          {isPaused ? 'RESUME' : 'PLAY'}
        </Button>
        <Button size="lg" icon={<Icon name="pause" />} onClick={pause} disabled={!isPlaying}>
          PAUSE
        </Button>
        <Button size="lg" icon={<Icon name="stop" />} onClick={stop} disabled={!isPlaying && !isPaused}>
          STOP
        </Button>
        <Button size="lg" icon={<Icon name="loop" />} pressed={loop} onClick={() => engine.setLoop(!loop)}>
          LOOP
        </Button>
        <Button size="lg" variant="danger" icon={<Icon name="record" />} pressed={isRecording} onClick={() => void toggleRecord()} disabled={busy}>
          {isRecording ? `REC ${Math.floor(recSeconds / 60)}:${String(recSeconds % 60).padStart(2, '0')}` : 'RECORD'}
        </Button>
        <Button size="lg" icon={<Icon name="download" />} onClick={() => setExportOpen(true)} disabled={!activePlayable}>
          EXPORT WAV
        </Button>
      </div>
      <div className="transport__settings">
        <Slider className="transport__volume" label="Master volume" value={Math.round(volume * 100)} min={0} max={100} step={1} unit="%" onChange={(v) => engine.setMasterVolume(v / 100)} />
        <div className="ui-field transport__wave">
          <span className="ui-field__label" id="wf-label">
            Waveform
          </span>
          <SegmentedControl aria-label="Waveform" value={waveform} options={WAVEFORMS} onChange={(w) => engine.setWaveform(w)} />
        </div>
        <Slider
          className="transport__duty"
          label="Duty cycle"
          value={Math.round(duty * 100)}
          min={1}
          max={99}
          step={1}
          unit="%"
          disabled={waveform !== 'square'}
          hint={waveform === 'square' ? undefined : 'Applies to square wave'}
          onChange={(v) => engine.setDuty(v / 100)}
        />
      </div>
      {exportOpen && activePlayable && <ExportDialog playable={activePlayable} onClose={() => setExportOpen(false)} />}
    </section>
  );
}
