import { useState } from 'react';
import { NOTE_NAMES_SHARP, freqToNearestNote, midiToFreq } from '../../audio/music';
import { Button, NumberField, Panel, Select } from '../../components/ui';
import { FREQ_MAX, FREQ_MIN } from './build';
import { formatHz } from './controls';

const NOTE_OPTIONS = NOTE_NAMES_SHARP.map((n, i) => ({ value: String(i), label: n }));
const OCTAVE_OPTIONS = Array.from({ length: 10 }, (_, i) => ({ value: String(i - 1), label: String(i - 1) }));

/** Hz -> nearest note (name, octave, MIDI, cents) and note + octave -> Hz. */
export function Converter({ frequency, onApply }: { frequency: number; onApply: (f: number) => void }) {
  const [hz, setHz] = useState(frequency);
  const [pc, setPc] = useState('9');
  const [octave, setOctave] = useState('4');

  const near = freqToNearestNote(hz);
  const octOf = near ? Math.floor(near.midi / 12) - 1 : 0;
  const pitchName = near ? NOTE_NAMES_SHARP[((near.midi % 12) + 12) % 12] : '';
  const midi = (Number(octave) + 1) * 12 + Number(pc);
  const noteHz = midiToFreq(midi);
  const noteHzOk = noteHz >= FREQ_MIN && noteHz <= FREQ_MAX;

  return (
    <Panel title="Frequency ↔ note" className="mode-frequency__converter">
      <div className="mode-frequency__conv-grid">
        <div className="mode-frequency__conv-col">
          <div className="mode-frequency__conv-input">
            <NumberField label="Frequency" value={hz} onChange={setHz} min={FREQ_MIN} max={FREQ_MAX} step={0.01} precision={2} unit="Hz" />
            <Button size="sm" onClick={() => setHz(frequency)} title="Copy the current frequency into the converter">
              Use current
            </Button>
          </div>
          {near ? (
            <dl className="mode-frequency__conv-out">
              <div>
                <dt>Note</dt>
                <dd>{pitchName}</dd>
              </div>
              <div>
                <dt>Octave</dt>
                <dd>{octOf}</dd>
              </div>
              <div>
                <dt>MIDI</dt>
                <dd>{near.midi}</dd>
              </div>
              <div>
                <dt>Cents</dt>
                <dd className={Math.abs(near.cents) > 10 ? 'is-off' : 'is-on'}>
                  {near.cents >= 0 ? '+' : ''}
                  {near.cents.toFixed(1)}
                </dd>
              </div>
              <div>
                <dt>{near.name} exact</dt>
                <dd>{formatHz(near.freq)} Hz</dd>
              </div>
            </dl>
          ) : (
            <p className="mode-frequency__tip">Enter a frequency above 0 Hz.</p>
          )}
          <div className="mode-frequency__conv-actions">
            <Button size="sm" variant="primary" onClick={() => onApply(hz)}>
              Apply {formatHz(hz)} Hz
            </Button>
            {near && near.freq >= FREQ_MIN && near.freq <= FREQ_MAX && (
              <Button size="sm" onClick={() => onApply(Math.round(near.freq * 100) / 100)} title="Apply the in-tune frequency of the nearest note">
                Apply {near.name} ({formatHz(near.freq)} Hz)
              </Button>
            )}
          </div>
        </div>
        <div className="mode-frequency__conv-col">
          <div className="mode-frequency__conv-note">
            <Select label="Note" value={pc} options={NOTE_OPTIONS} onChange={setPc} />
            <Select label="Octave" value={octave} options={OCTAVE_OPTIONS} onChange={setOctave} />
          </div>
          <div className="mode-frequency__conv-result">
            <span className="mode-frequency__conv-result-hz lcd-chip">{formatHz(noteHz)} Hz</span>
            <span className="mode-frequency__tip">MIDI {midi} · A4 = 440 Hz</span>
          </div>
          <div className="mode-frequency__conv-actions">
            <Button size="sm" variant="primary" disabled={!noteHzOk} onClick={() => onApply(Math.round(noteHz * 100) / 100)}>
              Apply {NOTE_NAMES_SHARP[Number(pc)]}
              {octave}
            </Button>
            <Button size="sm" disabled={!noteHzOk} onClick={() => setHz(Math.round(noteHz * 100) / 100)} title="Send this note's frequency to the Hz converter">
              To converter
            </Button>
          </div>
        </div>
      </div>
    </Panel>
  );
}
