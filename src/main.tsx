import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { getEngine } from './audio/engine';
import { MODES } from './modes/registry';
import { StudioProvider } from './studio/StudioProvider';
import { bindPersistentSettings } from './studio/settings';
import { App } from './App';
import './styles/global.css';

const engine = getEngine();
bindPersistentSettings(engine);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <StudioProvider engine={engine} modes={MODES}>
      <App />
    </StudioProvider>
  </StrictMode>,
);
