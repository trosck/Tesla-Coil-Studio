import type { Waveform } from '../../audio/types';
import { usePlayback } from '../../studio/StudioContext';

export const WAVE_NAME: Record<Waveform, string> = { square: 'Square', sine: 'Sine', triangle: 'Triangle', sawtooth: 'Saw' };

const AMP_SEGMENTS = 24;

function fmtTime(s: number): string {
  const m = Math.floor(s / 60);
  const sec = s - m * 60;
  return `${m}:${sec.toFixed(1).padStart(4, '0')}`;
}

/** Top LCD line: "<mode> ▸ <name>", LOOP indicator, ● REC, status word. */
export function LcdHeadline({ mode, name }: { mode: string; name: string }) {
  const loop = usePlayback((s) => s.loop);
  const rec = usePlayback((s) => s.isRecording);
  const playing = usePlayback((s) => s.isPlaying);
  const paused = usePlayback((s) => s.isPaused);
  const sounding = usePlayback((s) => s.frequency > 0 && s.amplitude > 0.001);
  const word = paused ? 'PAUSED' : !playing ? 'SILENCE' : sounding ? 'ARC ON' : 'REST';
  return (
    <div className="lcd-line lcd-line--head">
      <span className="lcd-line__title">
        {mode} ▸ {name}
      </span>
      <span className={loop ? 'lcd-flag' : 'lcd-flag lcd-flag--off'}>LOOP</span>
      {rec && <span className="lcd-flag blink">● REC</span>}
      <span className="lcd-flag">{word}</span>
    </div>
  );
}

/** Big frequency readout + note + amplitude. */
export function FrequencyReadout() {
  const freq = usePlayback((s) => Math.round(s.frequency * 10) / 10);
  const note = usePlayback((s) => s.noteName);
  const cents = usePlayback((s) => Math.round(s.cents));
  const amp = usePlayback((s) => Math.round(Math.min(1, s.amplitude * s.masterVolume) * 100));
  const active = freq > 0;
  return (
    <div className="lcd-freq">
      <span className="lcd-freq__value">{active ? (freq >= 1000 ? freq.toFixed(0) : freq.toFixed(1)) : '---.-'}</span>
      <span className="lcd-freq__unit">Hz</span>
      {active && (
        <span className="lcd-freq__note">
          {note} {cents >= 0 ? '+' : ''}
          {cents}¢
        </span>
      )}
      <span className="lcd-freq__amp">AMP {amp}%</span>
    </div>
  );
}

/** 24-segment amplitude bar. */
export function AmplitudeMeter() {
  const level = usePlayback((s) => Math.min(1, s.amplitude * s.masterVolume));
  const lit = Math.round(level * AMP_SEGMENTS);
  return (
    <div className="lcd-meter" role="meter" aria-label="Output amplitude" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(level * 100)}>
      {Array.from({ length: AMP_SEGMENTS }, (_, i) => (
        <span key={i} className={i < lit ? 'lcd-meter__seg is-lit' : 'lcd-meter__seg'} />
      ))}
    </div>
  );
}

/** Bottom LCD line: BPM / WAVE / DUTY / TIME + position bar. */
export function TransportReadout() {
  const position = usePlayback((s) => Math.round(s.position * 10) / 10);
  const length = usePlayback((s) => s.length);
  const bpm = usePlayback((s) => s.bpm);
  const waveform = usePlayback((s) => s.waveform);
  const duty = usePlayback((s) => Math.round(s.duty * 100));
  const pct = length > 0 ? Math.min(100, (position / length) * 100) : 0;
  return (
    <>
      <div className="lcd-line lcd-line--stats">
        <span>BPM {bpm ? Math.round(bpm) : '—'}</span>
        <span>WAVE {WAVE_NAME[waveform].toUpperCase()}</span>
        <span className={waveform === 'square' ? undefined : 'lcd-flag--off'}>DUTY {duty}%</span>
        <span className="lcd-line__time">
          TIME {fmtTime(position)} / {length > 0 ? fmtTime(length) : '∞'}
        </span>
      </div>
      <div className="lcd-progress" role="progressbar" aria-label="Playback position" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)}>
        <div className="lcd-progress__fill" style={{ width: `${pct}%` }} />
      </div>
    </>
  );
}
