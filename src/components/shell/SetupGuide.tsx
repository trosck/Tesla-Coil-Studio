import { useEffect, useRef } from 'react';
import { useBackdropClose } from '../../lib/useBackdropClose';
import { BUILT_IN_PRESETS } from '../../presets/builtIn';
import { useStudio } from '../../studio/StudioContext';
import { Button, Icon } from '../ui';
import { closeGuide } from './guideStore';
import { CloseGlyph, PxTextFile, WarningIcon } from './icons';
import { SAFETY_TEXT } from './SafetyNotice';
import './shell.css';

const TEST_SIGNAL = BUILT_IN_PRESETS.find((p) => p.id === 'builtin-test-signal');

const STEPS: { title: string; body: string }[] = [
  {
    title: 'Pair the receiver',
    body: 'Power the coil as its manual describes. Open the Bluetooth settings of your computer or phone and pair the MH-M18 receiver (it usually shows up as “MH-M18” or similar; PIN 0000 if asked).',
  },
  {
    title: 'Select it as audio output',
    body: 'Make the receiver the system sound output (macOS: Control Center → Sound; Windows: Sound output; phones switch automatically). In Chrome and Edge you can also pick it with the output selector next to the audio status.',
  },
  { title: 'Switch the coil to Music mode', body: 'Set the mode switch on the coil to Music (audio) mode so it follows the incoming signal.' },
  { title: 'Set a moderate volume', body: 'Start with the system volume around 50% and the Master volume here at a medium level, then raise it slowly.' },
  { title: 'Pick a preset', body: 'Open “All presets” under Coil modes and choose one — “Test Signal” is a steady 440 Hz tone, ideal for a first check.' },
  { title: 'Press Play', body: 'Press ▶ on a preset card or the big PLAY button (Space also toggles play/pause). The first tap also unlocks browser audio.' },
];

const TIPS = [
  'Square wave (the default) gives the loudest, clearest arcs; the duty cycle slider changes tone and arc intensity.',
  'Avoid very high volume: an overdriven signal clips and distorts. The app keeps its own output below full scale, but system or receiver gain can still overdrive it.',
  'Bluetooth adds roughly 100–300 ms of latency, so the visualizer may run slightly ahead of the sound.',
  'On phones, keep the screen on and this tab in the foreground — browsers may pause audio in the background.',
  'Use EXPORT WAV to save a track and play it from any music player, or RECORD to capture what you play live.',
];

/** First-visit setup guide (modal). Rendered by App while guideStore.open is true. */
export function SetupGuide() {
  const ref = useRef<HTMLDialogElement>(null);
  const backdrop = useBackdropClose(closeGuide);
  const { loadPreset } = useStudio();

  useEffect(() => {
    const d = ref.current;
    // No close() in cleanup (StrictMode double-mount would fire onClose). Unmount removes it.
    if (d && !d.open) d.showModal();
  }, []);

  const playTest = () => {
    if (TEST_SIGNAL) loadPreset(TEST_SIGNAL, { play: true, open: false });
    closeGuide();
  };

  return (
    <dialog ref={ref} className="guide xp-dialog win" aria-labelledby="guide-title" onCancel={closeGuide} onClose={closeGuide} {...backdrop}>
      <div className="titlebar xp-dialog__title">
        <PxTextFile size={18} />
        <span className="xp-dialog__title-text">Setup guide.txt</span>
        <button type="button" className="wbtn x" aria-label="Close setup guide" onClick={closeGuide}>
          <CloseGlyph />
        </button>
      </div>
      <div className="guide__body xp-dialog__body">
        <h2 id="guide-title" className="guide__heading">
          Make your Tesla coil sing
        </h2>
        <p className="guide__intro">
          Tesla Coil Studio only plays audio on your device&apos;s normal sound output. Your operating system sends it over Bluetooth to the coil&apos;s receiver.
        </p>
        <ol className="guide__steps">
          {STEPS.map((s, i) => (
            <li key={s.title} className="guide__step">
              <span className="guide__num" aria-hidden="true">
                {i + 1}
              </span>
              <div>
                <h3>{s.title}</h3>
                <p>{s.body}</p>
              </div>
            </li>
          ))}
        </ol>
        <section className="guide__tips" aria-labelledby="guide-tips">
          <h3 id="guide-tips">Tips</h3>
          <ul>
            {TIPS.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </section>
        <section className="guide__safety" aria-labelledby="guide-safety">
          <WarningIcon size={30} />
          <div>
            <h3 id="guide-safety">Safety</h3>
            <p>{SAFETY_TEXT}</p>
          </div>
        </section>
      </div>
      <footer className="xp-dialog__foot">
        <Button onClick={closeGuide}>Close</Button>
        {TEST_SIGNAL && (
          <Button variant="play" icon={<Icon name="play" />} onClick={playTest}>
            Play test signal
          </Button>
        )}
      </footer>
    </dialog>
  );
}
