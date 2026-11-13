import { useEffect, useRef } from 'react';
import type { AudioEngine } from '../../audio/engine';
import { cssVar, startCanvasLoop } from './canvasLoop';

const F_MIN = 40;
const F_MAX = 12000;
const LABELS: [number, string][] = [
  [100, '100'],
  [1000, '1k'],
  [10000, '10k'],
];
const SEG = 3; // LCD segment height (px)
const GAP = 2; // gap between segments (px)

/** Log-frequency spectrum as segmented LCD bars from the AnalyserNode. */
export function Spectrum({ engine }: { engine: AudioEngine }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ink = cssVar('--lcd-ink', '#14220a');
    const faint = cssVar('--lcd-ink-faint', 'rgb(20 34 10 / 0.15)');
    const font = cssVar('--font-lcd', 'monospace');
    let data: Uint8Array<ArrayBuffer> | null = null;
    return startCanvasLoop(canvas, (ctx, w, h) => {
      ctx.clearRect(0, 0, w, h);
      const an = engine.analyser;
      const labelH = 15;
      const plotH = h - labelH - 3;
      const bars = Math.max(16, Math.min(48, Math.floor(w / 7)));
      const bw = w / bars;
      const segs = Math.max(1, Math.floor((plotH + GAP) / (SEG + GAP)));
      const levels = new Array<number>(bars).fill(0);
      if (an) {
        if (!data || data.length !== an.frequencyBinCount) data = new Uint8Array(an.frequencyBinCount);
        an.getByteFrequencyData(data);
        const nyq = an.context.sampleRate / 2;
        const binHz = nyq / data.length;
        for (let b = 0; b < bars; b++) {
          const f0 = F_MIN * Math.pow(F_MAX / F_MIN, b / bars);
          const f1 = F_MIN * Math.pow(F_MAX / F_MIN, (b + 1) / bars);
          const i0 = Math.max(0, Math.floor(f0 / binHz));
          const i1 = Math.min(data.length - 1, Math.max(i0, Math.ceil(f1 / binHz)));
          let m = 0;
          for (let i = i0; i <= i1; i++) m = Math.max(m, data[i]!);
          levels[b] = m / 255;
        }
      }
      for (let b = 0; b < bars; b++) {
        const lit = Math.round(levels[b]! * segs);
        const x = b * bw + 1;
        const bwi = Math.max(1, bw - 2);
        for (let s = 0; s < segs; s++) {
          ctx.fillStyle = s < lit ? ink : faint;
          // unlit segments: only the lowest one, as a faint baseline
          if (s >= lit && s > 0) break;
          ctx.fillRect(x, plotH - (s + 1) * (SEG + GAP) + GAP, bwi, SEG);
        }
      }
      ctx.fillStyle = ink;
      ctx.font = `14px ${font}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      for (const [f, text] of LABELS) {
        const x = (Math.log(f / F_MIN) / Math.log(F_MAX / F_MIN)) * w;
        ctx.fillText(text, x, h - 2);
      }
    });
  }, [engine]);
  return <canvas ref={ref} className="lcd-canvas" role="img" aria-label="Frequency spectrum" />;
}
