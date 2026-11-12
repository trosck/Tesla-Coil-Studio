/**
 * STUB — "Sequencer" mode. Replace this file (and add files/tests in this
 * folder) to implement it. See ARCHITECTURE.md -> "How to implement a mode panel".
 */
import { ModeStub } from '../../components/ModeStub';
import { defineMode, type ModePanelProps } from '../../studio/types';

// TODO: define the real params shape.
export type SequencerParams = Record<string, never>;

function SequencerPanel(_props: ModePanelProps<SequencerParams>) {
  return (
    <ModeStub title="Sequencer">
      Planned: Steps (8/16/32), BPM, per-step note/gate/velocity, current step highlight via usePlayback((s) =&gt; s.step).
    </ModeStub>
  );
}

export const mode = defineMode<SequencerParams>({
  id: 'sequencer',
  label: 'Sequencer',
  description: 'Step sequencer grid with per-step pitch, gate and velocity.',
  defaultParams: {},
  // build: (params) => Sequence | SequenceSource | null   <- implement this
  Panel: SequencerPanel,
});
