import { useEffect, useId, useState, type ButtonHTMLAttributes, type CSSProperties, type ReactNode } from 'react';
import { downloadBlob, timestampedName } from '../../audio/export/renderWav';
import type { Waveform } from '../../audio/types';
import { usePlayback, useStudio } from '../../studio/StudioContext';
import { InfoIcon } from '../shell/icons';
import { useNowShowing } from '../shell/nowShowing';
import { Button, Icon, SegmentedControl, type SegmentOption } from '../ui';
import { VisualizerPanel } from '../visualizer/VisualizerPanel';
import { openExport } from './exportStore';
import './transport.css';

const WAVEFORMS: readonly SegmentOption<Waveform>[] = [
  { value: 'square', label: 'Square', badge: 'Best', title: 'Square wave — strongest, clearest arcs on a Tesla coil' },
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

/** Chrome slider with an LCD value chip (MASTER VOLUME, DUTY CYCLE). */
function DeckSlider({ label, value, min, max, onChange, disabled, hint }: { label: string; value: number; min: number; max: number; onChange: (v: number) => void; disabled?: boolean; hint?: string }) {
  const id = useId();
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className="deck-slider">
      <div className="deck-slider__head">
        <label className="deck-label" htmlFor={id}>
          {label}
        </label>
        <span className={['lcd-chip', disabled && 'deck-slider__chip--off'].filter(Boolean).join(' ')} aria-hidden="true">
          {value}%
        </span>
      </div>
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
        aria-valuetext={`${value}%`}
        aria-describedby={hint ? `${id}-hint` : undefined}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      {hint && (
        <span id={`${id}-hint`} className="deck-slider__hint">
          {hint}
        </span>
      )}
    </div>
  );
}

/** Round gel transport key with its caption underneath. */
function DeckKey({ gel, icon, label, className, ...rest }: { gel: 'green' | 'blue'; icon: ReactNode; label: ReactNode } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" className={['deck-key', `deck-key--${gel}`, className].filter(Boolean).join(' ')} {...rest}>
      <span className={`gel gel-${gel} deck-key__gel`} aria-hidden="true">
        {icon}
      </span>
      <span className="deck-key__label">{label}</span>
    </button>
  );
}

/** Player deck: LCD + transport keys + master volume / waveform / duty, plus the first-tap balloon. */
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
  const playLabel = isPaused || needsResume ? 'RESUME' : isPlaying ? 'PLAYING' : 'PLAY';

  return (
    <section className="deck" aria-label="Player">
      <div className="chrome deck__body">
        <VisualizerPanel mode={sourceMode.label} name={name} />
        <div className="deck__controls">
          <div className="deck__buttons" role="group" aria-label="Playback controls">
            <div className="deck__keys">
              <DeckKey
                gel="green"
                className={['deck-key--main', isPlaying && !needsResume && 'deck-key--playing'].filter(Boolean).join(' ')}
                icon={<Icon name="play" />}
                label={playLabel}
                onClick={() => void (needsResume ? engine.ensureStarted() : play()).catch(() => undefined)}
                disabled={!canPlay || (isPlaying && !needsResume)}
                data-space="transport"
                title={activePlayable || isPaused ? 'Play (Space)' : 'This mode has nothing to play yet'}
              />
              <DeckKey gel="blue" icon={<Icon name="pause" />} label="PAUSE" onClick={pause} disabled={!isPlaying} data-space="transport" title="Pause (Space)" />
              <DeckKey gel="blue" icon={<Icon name="stop" />} label="STOP" onClick={stop} disabled={!isPlaying && !isPaused} title="Stop and rewind" />
            </div>
            <div className="deck__toggles">
              <Button className="deck-toggle" icon={<Icon name="loop" />} pressed={loop} onClick={() => engine.setLoop(!loop)} title={loop ? 'Loop on: repeats until STOP' : 'Loop off: plays once'}>
                <span className="deck-toggle__label">LOOP</span>
              </Button>
              <Button
                variant="danger"
                className="deck-toggle"
                icon={<Icon name="record" />}
                pressed={isRecording}
                onClick={() => void toggleRecord()}
                disabled={busy}
                title={isRecording ? 'Stop recording and download the WAV' : 'Record the live output to a WAV file'}
              >
                <span className="deck-toggle__label">
                  {isRecording ? (
                    <>
                      <span className="deck-long">REC </span>
                      <span className="deck-mono">{recLabel}</span>
                    </>
                  ) : (
                    <>
                      REC<span className="deck-long">ORD</span>
                    </>
                  )}
                </span>
              </Button>
              <Button className="deck-toggle" icon={<Icon name="download" />} onClick={openExport} disabled={!activePlayable} title="Render the current mode to a WAV file">
                <span className="deck-toggle__label">
                  <span className="deck-long">EXPORT </span>WAV
                </span>
              </Button>
            </div>
          </div>
          <DeckSlider label="MASTER VOLUME" value={Math.round(volume * 100)} min={0} max={100} onChange={(v) => engine.setMasterVolume(v / 100)} />
          <div className="deck-wave">
            <span className="deck-label" aria-hidden="true">
              WAVEFORM
            </span>
            <SegmentedControl aria-label="Waveform" value={waveform} options={WAVEFORMS} onChange={(w) => engine.setWaveform(w)} />
          </div>
          <DeckSlider
            label="DUTY CYCLE"
            value={Math.round(duty * 100)}
            min={1}
            max={99}
            disabled={waveform !== 'square'}
            hint={waveform === 'square' ? undefined : 'Applies to square wave'}
            onChange={(v) => engine.setDuty(v / 100)}
          />
        </div>
      </div>
      {audioStatus === 'uninitialized' && (
        <div className="balloon balloon--tail deck__tip" role="note">
          <InfoIcon />
          <p>
            <b>Tap PLAY to start sound</b> — browsers need one tap first. This app controls only the audio signal, not the coil&apos;s electrical power.
          </p>
        </div>
      )}
    </section>
  );
}
