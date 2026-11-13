import { useEffect, useId, useState, type ButtonHTMLAttributes, type CSSProperties } from 'react';
import { downloadBlob, timestampedName } from '../../audio/export/renderWav';
import type { Waveform } from '../../audio/types';
import { usePlayback, useStudio } from '../../studio/StudioContext';
import { InfoIcon } from '../shell/icons';
import { useNowShowing } from '../shell/nowShowing';
import { Button, Icon, SegmentedControl, type IconName, type SegmentOption } from '../ui';
import { VisualizerPanel } from '../visualizer/VisualizerPanel';
import { openExport } from './exportStore';
import './transport.css';

const WAVEFORMS: readonly SegmentOption<Waveform>[] = [
  { value: 'square', label: 'SQ★', ariaLabel: 'Square (best)', title: 'Square wave — best: strongest, clearest arcs on a Tesla coil' },
  { value: 'sine', label: 'SIN', ariaLabel: 'Sine', title: 'Sine wave' },
  { value: 'triangle', label: 'TRI', ariaLabel: 'Triangle', title: 'Triangle wave' },
  { value: 'sawtooth', label: 'SAW', ariaLabel: 'Saw', title: 'Sawtooth wave' },
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

/** Dock settings row: fixed-width label, chrome slider, LCD value chip (VOL, DUTY). */
function DockSlider({ label, name, value, min, max, onChange, disabled, hint }: { label: string; name: string; value: number; min: number; max: number; onChange: (v: number) => void; disabled?: boolean; hint?: string }) {
  const id = useId();
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className="dock-row">
      <label className="dock-label" htmlFor={id}>
        {label}
      </label>
      <div className="dock-slider">
        <input
          id={id}
          className="ui-range"
          type="range"
          min={min}
          max={max}
          step={1}
          value={value}
          disabled={disabled}
          style={{ '--pct': `${pct}%` } as CSSProperties}
          aria-label={name}
          aria-valuetext={`${value}%`}
          aria-describedby={hint ? `${id}-hint` : undefined}
          onChange={(e) => onChange(Number(e.target.value))}
        />
        {hint && (
          <span id={`${id}-hint`} className="dock-slider__hint">
            {hint}
          </span>
        )}
      </div>
      <span className={['lcd-chip', 'dock-chip', disabled && 'dock-chip--off'].filter(Boolean).join(' ')} aria-hidden="true">
        {value}%
      </span>
    </div>
  );
}

/** Round gel transport key (icon only; the name lives in aria-label / title). */
function DockKey({ gel, icon, className, ...rest }: { gel: 'green' | 'blue'; icon: IconName } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" className={['gel', `gel-${gel}`, 'dock-key', className].filter(Boolean).join(' ')} {...rest}>
      <Icon name={icon} />
    </button>
  );
}

/** Player dock pinned to the bottom of the window: LCD strip + transport keys + toggles + volume / waveform / duty, plus the first-tap balloon. */
export function TransportBar() {
  const { engine, activePlayable, play, pause, stop } = useStudio();
  const { sourceMode, name } = useNowShowing();
  const isPlaying = usePlayback((s) => s.isPlaying);
  const isPaused = usePlayback((s) => s.isPaused);
  const loop = usePlayback((s) => s.loop);
  const isRecording = usePlayback((s) => s.isRecording);
  const recSeconds = usePlayback((s) => Math.floor(s.recordingSeconds));
  const volume = usePlayback((s) => s.masterVolume);
  const waveform = usePlayback((s) => s.waveform);
  const duty = usePlayback((s) => s.duty);
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
  // Still "playing" but the browser/system paused the AudioContext (or it failed): PLAY resumes/retries it.
  const needsResume = isPlaying && (audioStatus === 'suspended' || audioStatus === 'interrupted' || audioStatus === 'error');
  const recLabel = `${Math.floor(recSeconds / 60)}:${String(recSeconds % 60).padStart(2, '0')}`;
  const playLabel = isPaused || needsResume ? 'Resume' : isPlaying ? 'Playing' : 'Play';

  return (
    <section className="chrome dock" aria-label="Player">
      <VisualizerPanel mode={sourceMode.label} name={name} />
      <div className="dock__keys" role="group" aria-label="Playback controls">
        <DockKey
          gel="green"
          className={['dock-key--main', isPlaying && !needsResume && 'dock-key--playing'].filter(Boolean).join(' ')}
          icon="play"
          aria-label={playLabel}
          onClick={() => void (needsResume ? engine.ensureStarted() : play()).catch(() => undefined)}
          disabled={!canPlay || (isPlaying && !needsResume)}
          data-space="transport"
          title={activePlayable || isPaused ? 'Play (Space)' : 'This mode has nothing to play yet'}
        />
        <DockKey gel="blue" icon="pause" aria-label="Pause" onClick={pause} disabled={!isPlaying} data-space="transport" title="Pause (Space)" />
        <DockKey gel="blue" icon="stop" aria-label="Stop" onClick={stop} disabled={!isPlaying && !isPaused} title="Stop and rewind" />
        {audioStatus === 'uninitialized' && (
          <div className="balloon balloon--tail-bottom dock__tip" role="note">
            <InfoIcon />
            <p>
              <b>Tap PLAY to start sound</b> — browsers need one tap first. This app controls only the audio signal, not the coil&apos;s electrical power.
            </p>
          </div>
        )}
      </div>
      <div className="dock__toggles" role="group" aria-label="Loop, record and export">
        <Button size="sm" className="dock-toggle" pressed={loop} onClick={() => engine.setLoop(!loop)} title={loop ? 'Loop on: repeats until STOP' : 'Loop off: plays once'}>
          LOOP
        </Button>
        <Button
          variant="danger"
          size="sm"
          className="dock-toggle"
          pressed={isRecording}
          onClick={() => void toggleRecord()}
          disabled={busy}
          aria-label={isRecording ? undefined : 'Record'}
          title={isRecording ? 'Stop recording and download the WAV' : 'Record the live output to a WAV file'}
        >
          {isRecording ? (
            <>
              REC <span className="dock-mono">{recLabel}</span>
            </>
          ) : (
            'REC'
          )}
        </Button>
        <Button size="sm" className="dock-toggle" onClick={openExport} disabled={!activePlayable} title="Render the current mode to a WAV file">
          EXPORT WAV
        </Button>
      </div>
      <div className="dock__settings">
        <DockSlider label="VOL" name="Master volume" value={Math.round(volume * 100)} min={0} max={100} onChange={(v) => engine.setMasterVolume(v / 100)} />
        <div className="dock-row">
          <span className="dock-label" aria-hidden="true">
            WAVE
          </span>
          <SegmentedControl aria-label="Waveform" className="dock-wave" value={waveform} options={WAVEFORMS} onChange={(w) => engine.setWaveform(w)} />
        </div>
        <DockSlider
          label="DUTY"
          name="Duty cycle"
          value={Math.round(duty * 100)}
          min={1}
          max={99}
          disabled={waveform !== 'square'}
          hint={waveform === 'square' ? undefined : 'Square wave only'}
          onChange={(v) => engine.setDuty(v / 100)}
        />
      </div>
    </section>
  );
}
