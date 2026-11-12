/**
 * STUB — "MIDI" mode. Replace this file (and add files/tests in this
 * folder) to implement it. See ARCHITECTURE.md -> "How to implement a mode panel".
 */
import { ModeStub } from '../../components/ModeStub';
import { defineMode, type ModePanelProps } from '../../studio/types';

// TODO: define the real params shape.
export type MIDIParams = Record<string, never>;

function MIDIPanel(_props: ModePanelProps<MIDIParams>) {
  return (
    <ModeStub title="MIDI">
      Planned: File loader (@tonejs/midi), track selection, highest/lowest-note priority, transpose, tempo scale. Publish via setPlayable.
    </ModeStub>
  );
}

export const mode = defineMode<MIDIParams>({
  id: 'midi',
  label: 'MIDI',
  description: 'Load a .mid file and play its melody line monophonically.',
  defaultParams: {},
  // build: (params) => Sequence | SequenceSource | null   <- implement this
  Panel: MIDIPanel,
});
