import { Button, NumberInput } from '../../components/ui';
import { usePlayback } from '../../studio/StudioContext';
import { DURATION_MAX, DURATION_MIN, FREQ_MAX, FREQ_MIN, GAP_MAX, MAX_STEPS, type FrequencyStep } from './build';
import { HoldButton, noteLabel } from './controls';

let idCounter = 0;
function newStepId(): string {
  idCounter += 1;
  return `s${Date.now().toString(36)}${idCounter.toString(36)}`;
}

export interface StepListProps {
  steps: FrequencyStep[];
  gain: number;
  /** Frequency used for a new row when the list is empty. */
  frequency: number;
  onChange: (steps: FrequencyStep[]) => void;
}

/** Editable list of frequency steps: Hz + duration + gap; add / remove / reorder. */
export function StepList({ steps, gain, frequency, onChange }: StepListProps) {
  const playing = usePlayback((s) => (s.isPlaying ? s.step : -1));
  const patch = (i: number, p: Partial<FrequencyStep>) => onChange(steps.map((s, j) => (j === i ? { ...s, ...p } : s)));
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= steps.length) return;
    const next = [...steps];
    [next[i], next[j]] = [next[j]!, next[i]!];
    onChange(next);
  };
  const add = (f: number) => {
    const last = steps[steps.length - 1];
    onChange([...steps, { id: newStepId(), frequency: f, duration: last?.duration ?? 0.5, gap: last?.gap ?? 0.1 }]);
  };
  const total = steps.reduce((t, s) => t + s.duration + s.gap, 0);
  const full = steps.length >= MAX_STEPS;

  return (
    <div className="mode-frequency__steps">
      {steps.length > 0 && (
        <div className="mode-frequency__steps-head" aria-hidden="true">
          <span>#</span>
          <span>Frequency</span>
          <span>Duration</span>
          <span>Gap</span>
          <span />
        </div>
      )}
      <ol className="mode-frequency__step-list" aria-label="Frequency steps">
        {steps.map((s, i) => (
          <li key={s.id} className={playing === i ? 'mode-frequency__step is-playing' : 'mode-frequency__step'}>
            <span className="mode-frequency__step-index">{i + 1}</span>
            <span className="mode-frequency__step-freq">
              <NumberInput value={s.frequency} onChange={(frequency) => patch(i, { frequency })} min={FREQ_MIN} max={FREQ_MAX} step={0.01} precision={2} unit="Hz" aria-label={`Step ${i + 1} frequency`} />
              <span className="mode-frequency__step-note">{noteLabel(s.frequency)}</span>
            </span>
            <NumberInput value={s.duration} onChange={(duration) => patch(i, { duration })} min={DURATION_MIN} max={DURATION_MAX} step={0.01} precision={2} unit="s" className="mode-frequency__step-dur" aria-label={`Step ${i + 1} duration`} />
            <NumberInput value={s.gap} onChange={(gap) => patch(i, { gap })} min={0} max={GAP_MAX} step={0.01} precision={2} unit="s" className="mode-frequency__step-gap" aria-label={`Step ${i + 1} gap`} />
            <span className="mode-frequency__step-actions">
              <HoldButton size="sm" variant="play" frequency={s.frequency} gain={gain} title="Hold to test this step" aria-label={`Hold to test step ${i + 1}`}>
                ▶
              </HoldButton>
              <Button size="sm" variant="ghost" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Move step ${i + 1} up`}>
                ↑
              </Button>
              <Button size="sm" variant="ghost" onClick={() => move(i, 1)} disabled={i === steps.length - 1} aria-label={`Move step ${i + 1} down`}>
                ↓
              </Button>
              <Button size="sm" variant="ghost" onClick={() => onChange([...steps.slice(0, i), { ...s, id: newStepId() }, ...steps.slice(i)])} disabled={full} aria-label={`Duplicate step ${i + 1}`} title="Duplicate">
                ⧉
              </Button>
              <Button size="sm" variant="ghost" onClick={() => onChange(steps.filter((_, j) => j !== i))} aria-label={`Remove step ${i + 1}`} title="Remove">
                ✕
              </Button>
            </span>
          </li>
        ))}
      </ol>
      {steps.length === 0 && <p className="mode-frequency__tip">No steps — add one to build a sequence.</p>}
      <div className="mode-frequency__steps-foot">
        <Button size="sm" onClick={() => add(steps[steps.length - 1]?.frequency ?? frequency)} disabled={full}>
          + Add step
        </Button>
        <Button size="sm" onClick={() => add(frequency)} disabled={full} title="Add a step at the main frequency">
          + Add {Math.round(frequency * 100) / 100} Hz
        </Button>
        <Button size="sm" variant="ghost" onClick={() => onChange([])} disabled={steps.length === 0}>
          Clear
        </Button>
        <span className="mode-frequency__tip">
          {steps.length} steps · {total.toFixed(2)} s per pass · gap 0 = legato
        </span>
      </div>
    </div>
  );
}
