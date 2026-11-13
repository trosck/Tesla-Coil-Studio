import { useStudio } from '../../studio/StudioContext';
import { Oscilloscope } from './Oscilloscope';
import { FrequencyReadout, LcdHeadline, TransportReadout } from './Readouts';
import { Spectrum } from './Spectrum';
import './visualizer.css';

/** The player dock's LCD strip: headline, big frequency, scope, spectrum, step/time. */
export function VisualizerPanel({ mode, name }: { mode: string; name: string }) {
  const { engine } = useStudio();
  return (
    <section className="lcd dock-lcd" aria-label="Live output">
      <LcdHeadline mode={mode} name={name} />
      <div className="dock-lcd__row">
        <FrequencyReadout />
        <div className="lcd-screen lcd-screen--scope">
          <Oscilloscope engine={engine} />
        </div>
        <div className="lcd-screen lcd-screen--spectrum">
          <Spectrum engine={engine} />
        </div>
        <TransportReadout />
      </div>
    </section>
  );
}
