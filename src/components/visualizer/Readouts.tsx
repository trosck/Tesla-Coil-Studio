import type { Waveform } from '../../audio/types';
import { usePlayback } from '../../studio/StudioContext';

export const WAVE_NAME: Record<Waveform, string> = { square: 'Square', sine: 'Sine', triangle: 'Triangle', sawtooth: 'Saw' };

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

/** Big frequency readout. */
export function FrequencyReadout() {
  const freq = usePlayback((s) => Math.round(s.frequency * 10) / 10);
  const active = freq > 0;
  return (
    <div className="lcd-freq">
      <span className="lcd-freq__value">{active ? (freq >= 1000 ? freq.toFixed(0) : freq.toFixed(1)) : '---.-'}</span>
      <span className="lcd-freq__unit">Hz</span>
    </div>
  );
}

/** Stacked step / time readout (right edge of the dock LCD). */
export function TransportReadout() {
  const step = usePlayback((s) => (s.isPlaying ? s.step : -1));
  const position = usePlayback((s) => Math.round(s.position * 10) / 10);
  const length = usePlayback((s) => s.length);
  return (
    <div className="lcd-readout">
      <span>STEP {step >= 0 ? String(step + 1).padStart(2, '0') : '--'}</span>
      <span>
        {fmtTime(position)}
        <span className="lcd-readout__len"> / {length > 0 ? fmtTime(length) : '∞'}</span>
      </span>
    </div>
  );
}
