import { useEffect } from 'react';
import { Bubbles, DesktopIcons, Taskbar } from './components/desktop/Desktop';
import { Explorer } from './components/shell/Explorer';
import { Header } from './components/shell/Header';
import { SafetyNotice } from './components/shell/SafetyNotice';
import { SetupGuide } from './components/shell/SetupGuide';
import { TaskPane } from './components/shell/TaskPane';
import { MenuBar, TitleBar } from './components/shell/WindowChrome';
import { guideStore } from './components/shell/guideStore';
import { ExportDialog } from './components/transport/ExportDialog';
import { closeExport, exportStore } from './components/transport/exportStore';
import { TransportBar } from './components/transport/TransportBar';
import { useStore } from './lib/useStore';
import { useStudio } from './studio/StudioContext';
import './App.css';

export function App() {
  const { activePlayable } = useStudio();
  const guideOpen = useStore(guideStore, (s) => s.open);
  const exportOpen = useStore(exportStore, (s) => s.open);
  // Nothing left to export (e.g. the source mode was cleared): drop the request instead of reopening later.
  useEffect(() => {
    if (exportOpen && !activePlayable) closeExport();
  }, [exportOpen, activePlayable]);
  return (
    <div className="desk">
      <Bubbles />
      <div className="desk__main">
        <DesktopIcons />
        <div className="desk__windows">
          <section className="win app-win" aria-label="Tesla Coil Studio window">
            <TitleBar />
            <MenuBar />
            <Header />
            <div className="app-body">
              <TaskPane />
              <Explorer />
            </div>
            <TransportBar />
          </section>
          <SafetyNotice />
        </div>
      </div>
      <Taskbar />
      {guideOpen && <SetupGuide />}
      {exportOpen && activePlayable && <ExportDialog playable={activePlayable} onClose={closeExport} />}
    </div>
  );
}
