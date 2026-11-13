/** Precise editor for the selected step: pitch, length, velocity, rest, mute, preview. */
import { midiToFreq, midiToNoteName, quantizeMidi, type Scale } from '../../audio/music';
import { Button, Field, Panel, SegmentedControl, Select, Slider, Toggle } from '../../components/ui';
import { useStudio } from '../../studio/StudioContext';
import { MIDI_MAX, MIDI_MIN, type SeqStep, type StepLength } from './build';
import { LENGTH_OPTIONS } from './Board';

const NOTE_OPTIONS = Array.from({ length: MIDI_MAX - MIDI_MIN + 1 }, (_, i) => {
  const m = MIDI_MAX - i;
  return { value: String(m), label: `${midiToNoteName(m)} · ${midiToFreq(m).toFixed(1)} Hz` };
});

export interface InspectorProps {
  index: number;
  step: SeqStep;
  steps: number;
  scale: Scale;
  onPatch: (patch: Partial<SeqStep>) => void;
  onSelect: (i: number) => void;
}

/** Next scale note above (dir 1) or below (dir -1) a MIDI note. */
function scaleStep(midi: number, dir: 1 | -1, scale: Scale): number {
  for (let m = midi + dir; m >= MIDI_MIN && m <= MIDI_MAX; m += dir) if (quantizeMidi(m, scale) === m) return m;
  return midi;
}

export function Inspector({ index, step, steps, scale, onPatch, onSelect }: InspectorProps) {
  const { engine } = useStudio();
  const setMidi = (m: number) => onPatch({ midi: Math.min(MIDI_MAX, Math.max(MIDI_MIN, m)) });
  const previewOn = () => engine.noteOn(midiToFreq(step.midi), Math.max(0.05, step.velocity));
  const previewOff = () => engine.noteOff();
  return (
    <Panel
      title={`Step ${index + 1}`}
      className="mode-sequencer__inspector"
      actions={
        <>
          <Button size="sm" variant="ghost" aria-label="Previous step" onClick={() => onSelect((index - 1 + steps) % steps)}>
            ‹
          </Button>
          <Button size="sm" variant="ghost" aria-label="Next step" onClick={() => onSelect((index + 1) % steps)}>
            ›
          </Button>
        </>
      }
    >
      <div className="mode-sequencer__insp">
        <Toggle checked={step.on} onChange={(on) => onPatch({ on })} label={step.on ? 'Note' : 'Rest'} />
        <Toggle checked={step.muted} onChange={(muted) => onPatch({ muted })} label="Muted" />
        <Select label="Pitch" value={String(step.midi)} options={NOTE_OPTIONS} onChange={(v) => setMidi(Number(v))} />
        <div className="mode-sequencer__pitch-btns" role="group" aria-label="Pitch nudge">
          <Button size="sm" onClick={() => setMidi(step.midi - 12)} title="Octave down">
            −Oct
          </Button>
          <Button size="sm" onClick={() => setMidi(scaleStep(step.midi, -1, scale))} title="Previous scale note">
            −Deg
          </Button>
          <Button size="sm" onClick={() => setMidi(step.midi - 1)} title="Semitone down">
            −1
          </Button>
          <Button size="sm" onClick={() => setMidi(step.midi + 1)} title="Semitone up">
            +1
          </Button>
          <Button size="sm" onClick={() => setMidi(scaleStep(step.midi, 1, scale))} title="Next scale note">
            +Deg
          </Button>
          <Button size="sm" onClick={() => setMidi(step.midi + 12)} title="Octave up">
            +Oct
          </Button>
        </div>
        <Field label="Length" hint={step.length === 1 ? 'Ties into the next step.' : 'Articulated (gap before the next step).'}>
          <SegmentedControl
            aria-label="Step length"
            value={String(step.length) as '0.5' | '1'}
            options={LENGTH_OPTIONS}
            onChange={(v) => onPatch({ length: Number(v) as StepLength })}
          />
        </Field>
        <Slider label="Velocity" value={Math.round(step.velocity * 100)} min={0} max={100} step={1} unit="%" onChange={(v) => onPatch({ velocity: v / 100 })} />
        <Button
          onPointerDown={previewOn}
          onPointerUp={previewOff}
          onPointerLeave={previewOff}
          onPointerCancel={previewOff}
          onKeyDown={(e) => {
            if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) previewOn();
          }}
          onKeyUp={(e) => {
            if (e.key === 'Enter' || e.key === ' ') previewOff();
          }}
        >
          Hold to preview {midiToNoteName(step.midi)}
        </Button>
      </div>
    </Panel>
  );
}
