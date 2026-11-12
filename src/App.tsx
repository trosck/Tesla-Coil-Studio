import { Header } from './components/shell/Header';
import { ModeTabs } from './components/shell/ModeTabs';
import { SafetyNotice } from './components/shell/SafetyNotice';
import { SetupGuide } from './components/shell/SetupGuide';
import { guideStore } from './components/shell/guideStore';
import { TransportBar } from './components/transport/TransportBar';
import { VisualizerPanel } from './components/visualizer/VisualizerPanel';
import { useStore } from './lib/useStore';
import './App.css';

export function App() {
  const guideOpen = useStore(guideStore, (s) => s.open);
  return (
    <div className="app">
      <Header />
      <TransportBar />
      <main className="app-main">
        <ModeTabs />
        <aside className="app-side">
          <VisualizerPanel />
        </aside>
      </main>
      <SafetyNotice />
      {guideOpen && <SetupGuide />}
    </div>
  );
}
