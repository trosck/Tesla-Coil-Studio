import type { AudioStatus } from '../../audio/engine';

/** Label shown in the header status pill (and in the status help tooltip). */
export const STATUS_TEXT: Record<AudioStatus, string> = {
  uninitialized: 'Audio off',
  starting: 'Starting…',
  running: 'Output live',
  suspended: 'Suspended',
  interrupted: 'Interrupted',
  closed: 'Closed',
  unsupported: 'Web Audio unsupported',
  error: 'Audio error',
};

/** Plain-language meaning of each status, plus what to do when action is needed. */
export const STATUS_HELP: Record<AudioStatus, { meaning: string; action?: string }> = {
  uninitialized: {
    meaning: 'Sound hasn’t been started yet. Browsers block audio until you click or tap once.',
    action: 'Press Play to start.',
  },
  starting: {
    meaning: 'The audio engine is loading. This usually takes under a second.',
  },
  running: {
    meaning: 'Audio is on and ready. Whatever you play goes straight to the output. The number shows the sample rate.',
  },
  suspended: {
    meaning: 'The browser paused audio, often after the tab sat in the background or the device went idle.',
    action: 'Press Play to resume.',
  },
  interrupted: {
    meaning: 'The system took over audio, for example during a phone call, a Siri prompt or another app playing sound.',
    action: 'Press Play to resume once it’s over.',
  },
  closed: {
    meaning: 'The audio engine was shut down and can’t make sound anymore.',
    action: 'Reload the page to start a new session.',
  },
  unsupported: {
    meaning: 'This browser doesn’t support Web Audio, so no sound can be generated.',
    action: 'Use a recent Chrome, Edge, Firefox or Safari.',
  },
  error: {
    meaning: 'Audio failed to start.',
    action: 'Press Play to retry. If it keeps failing, reload the page or try another browser.',
  },
};

export const STATUS_ORDER: AudioStatus[] = ['uninitialized', 'starting', 'running', 'suspended', 'interrupted', 'closed', 'unsupported', 'error'];
