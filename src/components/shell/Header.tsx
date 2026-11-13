import { useEffect, useState } from 'react';
import type { OutputDevice } from '../../audio/engine';
import { usePlayback, useStudio } from '../../studio/StudioContext';
import { Select } from '../ui';
import { STATUS_TEXT } from './audioStatus';
import { BoltIcon } from './icons';
import { StatusHelp } from './StatusHelp';
import './shell.css';

export function Header() {
  const { engine } = useStudio();
  const status = usePlayback((s) => s.audioStatus);
  const sampleRate = usePlayback((s) => s.sampleRate);
  const error = usePlayback((s) => s.error);
  const deviceId = usePlayback((s) => s.outputDeviceId);
  const [devices, setDevices] = useState<OutputDevice[]>([]);
  const running = status === 'running';
  const canSelect = running && engine.supportsOutputSelection;

  useEffect(() => {
    if (!canSelect) return;
    let alive = true;
    const load = () =>
      engine.listOutputDevices().then(
        (d) => alive && setDevices(d),
        () => undefined,
      );
    void load();
    navigator.mediaDevices?.addEventListener?.('devicechange', load);
    return () => {
      alive = false;
      navigator.mediaDevices?.removeEventListener?.('devicechange', load);
    };
  }, [canSelect, engine]);

  return (
    <header className="aero brand">
      <div className="orb brand__orb" aria-hidden="true">
        <BoltIcon size={30} className="bolt-icon--orb" />
      </div>
      <div className="brand__text">
        <h1 className="chrome-text brand__name">TESLA COIL STUDIO</h1>
        <p className="brand__tagline">
          audio signal generator for musical Tesla coils · <b>est. 2000-something</b>
        </p>
      </div>
      <div className="burst burst-green brand__burst" aria-hidden="true">
        <span>
          AUDIO
          <br />
          ONLY!
        </span>
      </div>
      <div className="brand__status">
        {canSelect && devices.length > 1 && (
          <Select
            aria-label="Audio output device"
            className="brand__device"
            value={deviceId}
            onChange={(id) => void engine.setOutputDevice(id)}
            options={[{ value: '', label: 'System default output' }, ...devices.filter((d) => d.deviceId !== 'default' && d.deviceId !== '').map((d) => ({ value: d.deviceId, label: d.label }))]}
          />
        )}
        <div className={`chrome status-pill status-pill--${status}`} title={error ?? undefined}>
          <span className="status-pill__live" role="status">
            <span className={`status-led status-led--${status}`} aria-hidden="true" />
            <span>{STATUS_TEXT[status] ?? status}</span>
            {running && sampleRate && <span className="status-pill__sr">{(sampleRate / 1000).toFixed(1)} kHz</span>}
          </span>
          <StatusHelp status={status} error={error} />
        </div>
      </div>
    </header>
  );
}
