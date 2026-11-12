import { useStudio } from '../../studio/StudioContext';
import { Panel } from '../ui';
import { Oscilloscope } from './Oscilloscope';
import { AmplitudeMeter, FrequencyReadout, TransportReadout } from './Readouts';
import { Spectrum } from './Spectrum';
import './visualizer.css';

export function VisualizerPanel() {
  const { engine } = useStudio();
  return (
    <Panel title="Live output" className="viz">
      <FrequencyReadout />
      <AmplitudeMeter />
      <div className="viz-screen">
        <span className="viz-screen__tag">SCOPE</span>
        <Oscilloscope engine={engine} />
      </div>
      <div className="viz-screen viz-screen--spectrum">
        <span className="viz-screen__tag">SPECTRUM</span>
        <Spectrum engine={engine} />
      </div>
      <TransportReadout />
    </Panel>
  );
}
