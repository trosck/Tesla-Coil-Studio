/**
 * STUB — "Ramp" mode. Replace this file (and add files/tests in this
 * folder) to implement it. See ARCHITECTURE.md -> "How to implement a mode panel".
 */
import { ModeStub } from '../../components/ModeStub';
import { defineMode, type ModePanelProps } from '../../studio/types';

// TODO: define the real params shape.
export type RampParams = Record<string, never>;

function RampPanel(_props: ModePanelProps<RampParams>) {
  return (
    <ModeStub title="Ramp">
      Planned: Start/end frequency, duration, curve, direction (up, down, up-down), repeat count, gap between ramps.
    </ModeStub>
  );
}

export const mode = defineMode<RampParams>({
  id: 'ramp',
  label: 'Ramp',
  description: 'Linear / exponential / logarithmic frequency ramps between two frequencies.',
  defaultParams: {},
  // build: (params) => Sequence | SequenceSource | null   <- implement this
  Panel: RampPanel,
});
