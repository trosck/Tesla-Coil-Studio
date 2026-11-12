/**
 * STUB — "Siren" mode. Replace this file (and add files/tests in this
 * folder) to implement it. See ARCHITECTURE.md -> "How to implement a mode panel".
 */
import { ModeStub } from '../../components/ModeStub';
import { defineMode, type ModePanelProps } from '../../studio/types';

// TODO: define the real params shape.
export type SirenParams = Record<string, never>;

function SirenPanel(_props: ModePanelProps<SirenParams>) {
  return (
    <ModeStub title="Siren">
      Planned: Low/high frequency, cycle rate, shape (sine/triangle/square LFO), glide curve.
    </ModeStub>
  );
}

export const mode = defineMode<SirenParams>({
  id: 'siren',
  label: 'Siren',
  description: 'Oscillating pitch between two frequencies (LFO-style siren / wobble).',
  defaultParams: {},
  // build: (params) => Sequence | SequenceSource | null   <- implement this
  Panel: SirenPanel,
});
