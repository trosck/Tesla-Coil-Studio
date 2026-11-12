import { Header } from './components/shell/Header';
import { ModeTabs } from './components/shell/ModeTabs';
import { SafetyNotice } from './components/shell/SafetyNotice';
import { TransportBar } from './components/transport/TransportBar';
import { VisualizerPanel } from './components/visualizer/VisualizerPanel';
import './App.css';

export function App() {
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
    </div>
  );
}
