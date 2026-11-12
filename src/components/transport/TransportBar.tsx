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

const TEXT_INPUTS = new Set(['text', 'search', 'number', 'email', 'url', 'tel', 'password']);

/**
 * Should Space keep its native meaning for this target? True while typing and
 * on controls that Space activates (buttons, toggles, radios, piano keys...).
 * Exceptions: the transport's own PLAY / PAUSE buttons and the mode tabs,
 * where Space = play/pause. Modal dialogs always keep Space.
 */
function spaceBelongsToTarget(t: EventTarget | null): boolean {
  const el = t instanceof Element ? t : null;
  if (typeof document !== 'undefined' && document.querySelector('dialog[open]')) return true;
  if (!el || el === document.body || el === document.documentElement) return false;
  if (el.closest('[data-space="transport"]')) return false;
  if (el.getAttribute('role') === 'tab') return false;
  if (el instanceof HTMLElement && el.isContentEditable) return true;
  const tag = el.tagName;
  if (tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'BUTTON' || tag === 'SUMMARY' || tag === 'A') return true;
  if (tag === 'INPUT') {
    const type = (el as HTMLInputElement).type;
    return TEXT_INPUTS.has(type) || type === 'checkbox' || type === 'radio' || type === 'file' || type === 'button' || type === 'submit';
  }
  const role = el.getAttribute('role');
  return role === 'button' || role === 'radio' || role === 'switch' || role === 'checkbox' || role === 'option' || role === 'menuitem' || role === 'gridcell' || role === 'textbox';
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

  // Space = play/pause (not while typing or when Space activates the focused control)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.repeat || e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented || spaceBelongsToTarget(e.target)) return;
      e.preventDefault();
      if (engine.state.isPlaying) pause();
      else void play();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [engine, play, pause]);

  const audioStatus = usePlayback((s) => s.audioStatus);
  const audioLocked = audioStatus === 'uninitialized' || audioStatus === 'suspended' || audioStatus === 'interrupted';
  const recLabel = `${Math.floor(recSeconds / 60)}:${String(recSeconds % 60).padStart(2, '0')}`;

  return (
    <section className="transport" aria-label="Transport">
      <div className="transport__buttons" role="group" aria-label="Playback controls">
        <Button
          variant="primary"
          size="lg"
          icon={<Icon name="play" />}
          onClick={() => void play()}
          disabled={!canPlay || isPlaying}
          className={['transport__btn', isPlaying && 'transport__playing'].filter(Boolean).join(' ')}
          data-space="transport"
          title={activePlayable || isPaused ? 'Play (Space)' : 'This mode has nothing to play yet'}
        >
          <span className="transport__label">{isPaused ? 'RESUME' : isPlaying ? 'PLAYING' : 'PLAY'}</span>
        </Button>
        <Button size="lg" className="transport__btn" icon={<Icon name="pause" />} onClick={pause} disabled={!isPlaying} data-space="transport" title="Pause (Space)">
          <span className="transport__label">PAUSE</span>
        </Button>
        <Button size="lg" className="transport__btn" icon={<Icon name="stop" />} onClick={stop} disabled={!isPlaying && !isPaused} title="Stop and rewind">
          <span className="transport__label">STOP</span>
        </Button>
        <Button size="lg" className="transport__btn" icon={<Icon name="loop" />} pressed={loop} onClick={() => engine.setLoop(!loop)} title={loop ? 'Loop on: repeats until STOP' : 'Loop off: plays once'}>
          <span className="transport__label">LOOP</span>
        </Button>
        <Button
          size="lg"
          variant="danger"
          className="transport__btn"
          icon={<Icon name="record" />}
          pressed={isRecording}
          onClick={() => void toggleRecord()}
          disabled={busy}
          title={isRecording ? 'Stop recording and download the WAV' : 'Record the live output to a WAV file'}
        >
          <span className="transport__label">
            {isRecording ? (
              <>
                <span className="transport__long">REC </span>
                <span className="mono">{recLabel}</span>
              </>
            ) : (
              <>
                REC<span className="transport__long">ORD</span>
              </>
            )}
          </span>
        </Button>
        <Button size="lg" className="transport__btn" icon={<Icon name="download" />} onClick={() => setExportOpen(true)} disabled={!activePlayable} title="Render the current mode to a WAV file">
          <span className="transport__label">
            <span className="transport__long">EXPORT </span>WAV
          </span>
        </Button>
      </div>
      <p className="transport__note">
        <span className="transport__warn" aria-hidden="true">
          ⚠
        </span>
        {audioLocked ? (
          <span>
            <strong>Tap PLAY or “Enable audio” to start sound</strong> — browsers need one tap first. This app controls only the audio signal, not the coil&apos;s electrical power.
          </span>
        ) : (
          <span>This app controls only the audio signal, not the coil&apos;s electrical power.</span>
        )}
      </p>
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
