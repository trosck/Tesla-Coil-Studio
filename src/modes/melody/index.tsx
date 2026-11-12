/**
 * STUB — "Melody" mode. Replace this file (and add files/tests in this
 * folder) to implement it. See ARCHITECTURE.md -> "How to implement a mode panel".
 */
import { ModeStub } from '../../components/ModeStub';
import { defineMode, type ModePanelProps } from '../../studio/types';

// TODO: define the real params shape.
export type MelodyParams = Record<string, never>;

function MelodyPanel(_props: ModePanelProps<MelodyParams>) {
  return (
    <ModeStub title="Melody">
      Planned: Note entry (text like "C4 E4 G4"), durations, BPM, on-screen piano using engine.noteOn/noteOff.
    </ModeStub>
  );
}

export const mode = defineMode<MelodyParams>({
  id: 'melody',
  label: 'Melody',
  description: 'Type or play a melody (note names / on-screen piano) and loop it.',
  defaultParams: {},
  // build: (params) => Sequence | SequenceSource | null   <- implement this
  Panel: MelodyPanel,
});
