/**
 * STUB — "Random" mode. Replace this file (and add files/tests in this
 * folder) to implement it. See ARCHITECTURE.md -> "How to implement a mode panel".
 */
import { ModeStub } from '../../components/ModeStub';
import { defineMode, type ModePanelProps } from '../../studio/types';

// TODO: define the real params shape.
export type RandomParams = Record<string, never>;

function RandomPanel(_props: ModePanelProps<RandomParams>) {
  return (
    <ModeStub title="Random">
      Planned: Seed, scale, range, note density, note lengths, BPM. Use a SequenceSource with mulberry32(seed + chunkIndex).
    </ModeStub>
  );
}

export const mode = defineMode<RandomParams>({
  id: 'random',
  label: 'Random',
  description: 'Seeded generative melodies quantized to a scale; plays endlessly.',
  defaultParams: {},
  // build: (params) => Sequence | SequenceSource | null   <- implement this
  Panel: RandomPanel,
});
