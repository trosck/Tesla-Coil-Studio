/** Persist global transport settings (volume, waveform, duty, loop) to localStorage. */
import type { AudioEngine } from '../audio/engine';
import type { Waveform } from '../audio/types';
import { readJson, writeJson } from '../lib/persist';

const KEY = 'tcs.settings.v1';
const WAVEFORMS: readonly Waveform[] = ['square', 'sine', 'triangle', 'sawtooth'];

interface SavedSettings {
  masterVolume?: number;
  waveform?: Waveform;
  duty?: number;
  loop?: boolean;
}

/** Apply saved settings and keep them in sync. Call once at startup. */
export function bindPersistentSettings(engine: AudioEngine): () => void {
  const s = readJson<SavedSettings>(KEY, {});
  if (typeof s.masterVolume === 'number') engine.setMasterVolume(s.masterVolume);
  if (s.waveform && WAVEFORMS.includes(s.waveform)) engine.setWaveform(s.waveform);
  if (typeof s.duty === 'number') engine.setDuty(s.duty);
  if (typeof s.loop === 'boolean') engine.setLoop(s.loop);

  let last = '';
  return engine.store.subscribe(() => {
    const st = engine.store.getSnapshot();
    const next: SavedSettings = { masterVolume: st.masterVolume, waveform: st.waveform, duty: st.duty, loop: st.loop };
    const json = JSON.stringify(next);
    if (json !== last) {
      last = json;
      writeJson(KEY, next);
    }
  });
}
