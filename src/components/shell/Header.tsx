import { useEffect, useState } from 'react';
import type { OutputDevice } from '../../audio/engine';
import { usePlayback, useStudio } from '../../studio/StudioContext';
import { Button, Icon, Select } from '../ui';
import { STATUS_TEXT } from './audioStatus';
import { openGuide } from './guideStore';
import { StatusHelp } from './StatusHelp';

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
    <header className="app-header">
      <div className="app-brand">
        <span className="app-brand__logo" aria-hidden="true">
          <Icon name="bolt" size={22} />
        </span>
        <div>
          <h1 className="app-brand__name">Tesla Coil Studio</h1>
          <p className="app-brand__sub">Audio signal generator for musical Tesla coils</p>
        </div>
      </div>
      <div className="app-status">
        {canSelect && devices.length > 1 && (
          <Select
            aria-label="Audio output device"
            className="app-status__device"
            value={deviceId}
            onChange={(id) => void engine.setOutputDevice(id)}
            options={[{ value: '', label: 'System default output' }, ...devices.filter((d) => d.deviceId !== 'default' && d.deviceId !== '').map((d) => ({ value: d.deviceId, label: d.label }))]}
          />
        )}
        <div className={`app-status__pill app-status__pill--${status}`} title={error ?? undefined}>
          <span className="app-status__live" role="status">
            <span className="app-status__dot" aria-hidden="true" />
            <span>{STATUS_TEXT[status] ?? status}</span>
            {running && sampleRate && <span className="mono app-status__sr">{(sampleRate / 1000).toFixed(1)} kHz</span>}
          </span>
          <StatusHelp status={status} error={error} />
        </div>
        <Button variant="ghost" icon={<Icon name="help" />} onClick={openGuide} aria-haspopup="dialog">
          Setup guide
        </Button>
      </div>
    </header>
  );
}
