import { useEffect, useState } from 'react';
import { useStudio } from '../../studio/StudioContext';
import { openGuide } from '../shell/guideStore';
import { BoltIcon, PxComputer, PxFolder, PxMonitor, PxRecycleBin, PxTextFile, PxWavFolder } from '../shell/icons';
import { openExport } from '../transport/exportStore';
import './desktop.css';

/** Floating soap bubbles (pure decor). */
export function Bubbles() {
  return (
    <div className="bubbles" aria-hidden="true">
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className={`bubble bubble--${i}`} />
      ))}
    </div>
  );
}

/** Desktop icon column (hidden on narrow screens). */
export function DesktopIcons() {
  const { setActiveMode, activePlayable } = useStudio();
  return (
    <nav className="desk-icons" aria-label="Desktop">
      <button type="button" className="dicon" onClick={() => setActiveMode('frequency')} title="Open the Frequency mode (test tones)">
        <PxComputer />
        <span>My Coil</span>
      </button>
      <button type="button" className="dicon" onClick={openGuide} aria-haspopup="dialog">
        <PxTextFile />
        <span>Setup guide.txt</span>
      </button>
      <button
        type="button"
        className="dicon"
        onClick={openExport}
        aria-haspopup="dialog"
        disabled={!activePlayable}
        title={activePlayable ? 'Export the current sound as WAV' : 'This mode has nothing to export yet'}
      >
        <PxWavFolder />
        <span>WAV exports</span>
      </button>
      <div className="dicon dicon--inert" aria-hidden="true">
        <PxRecycleBin />
        <span>Recycle Bin</span>
      </div>
    </nav>
  );
}

const fmtClock = () => new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

function Clock() {
  const [now, setNow] = useState(fmtClock);
  useEffect(() => {
    const t = window.setInterval(() => setNow(fmtClock()), 15000);
    return () => window.clearInterval(t);
  }, []);
  return <span className="tray__clock">{now}</span>;
}

/** XP taskbar: "coil" start button (opens All presets), decor quick-launch + task button, tray clock. */
export function Taskbar() {
  const { setActiveMode } = useStudio();
  return (
    <footer className="taskbar xp-taskbar">
      <button type="button" className="gel gel-green xp-start" onClick={() => setActiveMode('presets')} title="Open All presets">
        <BoltIcon size={20} className="bolt-icon--start" />
        <span>coil</span>
      </button>
      <div className="xp-quick" aria-hidden="true">
        <PxFolder />
        <PxMonitor />
      </div>
      <div className="xp-tasks" aria-hidden="true">
        <div className="xp-task">
          <BoltIcon size={14} />
          <span>Tesla Coil Studio 2000</span>
        </div>
      </div>
      <div className="tray xp-tray">
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" className="tray__icon">
          <path className="tray__fill" d="M4 9h4l5-4v14l-5-4H4z" />
          <path d="M16 9a4 4 0 0 1 0 6" />
        </svg>
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" className="tray__icon">
          <path d="m7 7 10 10-5 5V2l5 5L7 17" />
        </svg>
        <Clock />
      </div>
    </footer>
  );
}
