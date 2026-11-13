import { useStudio } from '../../studio/StudioContext';
import { Oscilloscope } from './Oscilloscope';
import { AmplitudeMeter, FrequencyReadout, LcdHeadline, TransportReadout } from './Readouts';
import { Spectrum } from './Spectrum';
import './visualizer.css';

/** The player deck's LCD: live readouts + scope + spectrum, all in LCD ink. */
export function VisualizerPanel({ mode, name }: { mode: string; name: string }) {
  const { engine } = useStudio();
  return (
    <section className="lcd deck-lcd" aria-label="Live output">
      <LcdHeadline mode={mode} name={name} />
      <FrequencyReadout />
      <AmplitudeMeter />
      <div className="lcd-screens">
        <div className="lcd-screen lcd-screen--scope">
          <span className="lcd-screen__tag" aria-hidden="true">
            SCOPE
          </span>
          <div className="lcd-screen__frame">
            <Oscilloscope engine={engine} />
          </div>
        </div>
        <div className="lcd-screen lcd-screen--spectrum">
          <span className="lcd-screen__tag" aria-hidden="true">
            SPECTRUM
          </span>
          <div className="lcd-screen__frame">
            <Spectrum engine={engine} />
          </div>
        </div>
      </div>
      <TransportReadout />
    </section>
  );
}
