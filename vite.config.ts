import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  worker: {
    // The AudioWorklet module is bundled as a worker entry (see src/audio/worklet).
    // ES format keeps it loadable by audioWorklet.addModule() in dev and build.
    format: 'es',
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
