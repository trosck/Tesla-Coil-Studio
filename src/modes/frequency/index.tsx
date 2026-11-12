/**
 * Frequency mode — minimal working version (steady test tone). A later agent
 * expands it; keep the contract (defineMode + build).
 */
import { freqToNearestNote } from '../../audio/music';
import { Button, Slider } from '../../components/ui';
import { useStudio } from '../../studio/StudioContext';
import { defineMode, type ModePanelProps } from '../../studio/types';
import { FREQ_MAX, FREQ_MIN, buildFrequencySequence, defaultFrequencyParams, normalizeFrequencyParams, type FrequencyParams } from './build';
import './frequency.css';

const QUICK = [50, 110, 220, 440, 880, 1000];

function FrequencyPanel({ params, setParams }: ModePanelProps<FrequencyParams>) {
  const { engine } = useStudio();
  const note = freqToNearestNote(params.frequency);
  return (
    <div className="mode-frequency">
      <Slider
        label="Frequency"
        value={params.frequency}
        min={20}
        max={FREQ_MAX}
        step={0.1}
        precision={1}
        scale="log"
        unit="Hz"
        onChange={(frequency) => setParams((p) => ({ ...p, frequency: Math.max(FREQ_MIN, frequency) }))}
        hint={note ? `Nearest note ${note.name} (${note.cents >= 0 ? '+' : ''}${note.cents.toFixed(0)}¢)` : undefined}
      />
      <div className="mode-frequency__quick" role="group" aria-label="Quick frequencies">
        {QUICK.map((f) => (
          <Button key={f} size="sm" pressed={params.frequency === f} onClick={() => setParams((p) => ({ ...p, frequency: f }))}>
            {f} Hz
          </Button>
        ))}
      </div>
      <Slider label="Level" value={Math.round(params.gain * 100)} min={0} max={100} step={1} unit="%" onChange={(g) => setParams((p) => ({ ...p, gain: g / 100 }))} />
      <div className="mode-frequency__hold">
        <Button
          variant="primary"
          onPointerDown={() => engine.noteOn(params.frequency, params.gain)}
          onPointerUp={() => engine.noteOff()}
          onPointerLeave={() => engine.noteOff()}
          onPointerCancel={() => engine.noteOff()}
          onKeyDown={(e) => {
            if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) engine.noteOn(params.frequency, params.gain);
          }}
          onKeyUp={(e) => {
            if (e.key === 'Enter' || e.key === ' ') engine.noteOff();
          }}
        >
          Hold to test
        </Button>
        <span className="mode-frequency__tip">Or press PLAY for a continuous tone (exportable).</span>
      </div>
    </div>
  );
}

export const mode = defineMode<FrequencyParams>({
  id: 'frequency',
  label: 'Frequency',
  description: 'Steady test tone at an exact frequency.',
  defaultParams: defaultFrequencyParams,
  normalizeParams: normalizeFrequencyParams,
  build: buildFrequencySequence,
  liveUpdate: 'immediate',
  Panel: FrequencyPanel,
});
