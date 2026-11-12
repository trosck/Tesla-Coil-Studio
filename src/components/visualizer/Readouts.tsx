import { usePlayback } from '../../studio/StudioContext';

function fmtTime(s: number): string {
  const m = Math.floor(s / 60);
  const sec = s - m * 60;
  return `${m}:${sec.toFixed(1).padStart(4, '0')}`;
}

export function FrequencyReadout() {
  const freq = usePlayback((s) => Math.round(s.frequency * 10) / 10);
  const note = usePlayback((s) => s.noteName);
  const cents = usePlayback((s) => Math.round(s.cents));
  const active = freq > 0;
  return (
    <div className="viz-freq" aria-live="off">
      <div className="viz-freq__value mono">
        {active ? freq.toFixed(1) : '----.-'}
        <span className="viz-freq__unit">Hz</span>
      </div>
      <div className="viz-freq__note mono">
        {active ? (
          <>
            <span className="viz-freq__name">{note}</span>
            <span className="viz-freq__cents">
              {cents >= 0 ? '+' : ''}
              {cents}¢
            </span>
          </>
        ) : (
          <span className="viz-freq__idle">silence</span>
        )}
      </div>
    </div>
  );
}

export function AmplitudeMeter() {
  const amp = usePlayback((s) => Math.round(s.amplitude * 100) / 100);
  const vol = usePlayback((s) => s.masterVolume);
  const level = Math.min(1, amp * vol);
  return (
    <div className="viz-meter" role="meter" aria-label="Output amplitude" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(level * 100)}>
      <div className="viz-meter__label">AMP</div>
      <div className="viz-meter__track">
        <div className="viz-meter__fill" style={{ transform: `scaleX(${level})` }} />
      </div>
      <div className="viz-meter__value mono">{Math.round(level * 100)}%</div>
    </div>
  );
}

export function TransportReadout() {
  const position = usePlayback((s) => Math.round(s.position * 10) / 10);
  const length = usePlayback((s) => s.length);
  const bpm = usePlayback((s) => s.bpm);
  const chunk = usePlayback((s) => s.chunkIndex);
  const playing = usePlayback((s) => s.isPlaying);
  const paused = usePlayback((s) => s.isPaused);
  const pct = length > 0 ? Math.min(100, (position / length) * 100) : 0;
  return (
    <div className="viz-transport">
      <div className="viz-stats">
        <div className="viz-stat">
          <span className="viz-stat__k">BPM</span>
          <span className="viz-stat__v mono">{bpm ? Math.round(bpm) : '—'}</span>
        </div>
        <div className="viz-stat">
          <span className="viz-stat__k">LOOP</span>
          <span className="viz-stat__v mono">{playing || paused ? chunk + 1 : '—'}</span>
        </div>
        <div className="viz-stat">
          <span className="viz-stat__k">TIME</span>
          <span className="viz-stat__v mono">
            {fmtTime(position)} / {fmtTime(length)}
          </span>
        </div>
      </div>
      <div className="viz-progress" role="progressbar" aria-label="Playback position" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)}>
        <div className="viz-progress__fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
