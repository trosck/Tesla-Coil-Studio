/**
 * STUB — "Pulse" mode. Replace this file (and add files/tests in this
 * folder) to implement it. See ARCHITECTURE.md -> "How to implement a mode panel".
 */
import { ModeStub } from '../../components/ModeStub';
import { defineMode, type ModePanelProps } from '../../studio/types';

// TODO: define the real params shape.
export type PulseParams = Record<string, never>;

function PulsePanel(_props: ModePanelProps<PulseParams>) {
  return (
    <ModeStub title="Pulse">
      Planned: Frequency, pulse rate or BPM, on-time / gate %, accent pattern, swing.
    </ModeStub>
  );
}

export const mode = defineMode<PulseParams>({
  id: 'pulse',
  label: 'Pulse',
  description: 'Rhythmic on/off bursts at a fixed pitch — the classic Tesla coil buzz.',
  defaultParams: {},
  // build: (params) => Sequence | SequenceSource | null   <- implement this
  Panel: PulsePanel,
});
