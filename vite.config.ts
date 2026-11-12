import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // Relative base so the build works under the GitHub Pages project path
  // (https://<user>.github.io/Tesla-Coil-Studio/) as well as at a domain root.
  base: './',
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
