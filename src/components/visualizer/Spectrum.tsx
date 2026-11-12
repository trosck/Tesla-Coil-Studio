import { useEffect, useRef } from 'react';
import type { AudioEngine } from '../../audio/engine';
import { cssVar, startCanvasLoop } from './canvasLoop';

const F_MIN = 20;
const F_MAX = 20000;
const LABELS = [50, 100, 200, 500, 1000, 2000, 5000, 10000];

/** Log-frequency spectrum bars from the AnalyserNode. */
export function Spectrum({ engine }: { engine: AudioEngine }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const cyan = cssVar('--cyan', '#22e5ff');
    const blue = cssVar('--blue', '#3d7bff');
    const purple = cssVar('--purple', '#a259ff');
    const faint = cssVar('--text-faint', '#66728a');
    let data: Uint8Array<ArrayBuffer> | null = null;
    return startCanvasLoop(canvas, (ctx, w, h) => {
      ctx.clearRect(0, 0, w, h);
      const an = engine.analyser;
      const labelH = 14;
      const plotH = h - labelH;
      const bars = Math.max(24, Math.min(160, Math.floor(w / 5)));
      const bw = w / bars;
      const grad = ctx.createLinearGradient(0, plotH, 0, 0);
      grad.addColorStop(0, blue);
      grad.addColorStop(0.55, cyan);
      grad.addColorStop(1, purple);
      ctx.fillStyle = grad;
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
          const bh = (m / 255) * plotH;
          if (bh > 0.5) ctx.fillRect(b * bw + 1, plotH - bh, Math.max(1, bw - 2), bh);
        }
      }
      ctx.fillStyle = faint;
      ctx.font = '10px ui-monospace, Menlo, monospace';
      ctx.textAlign = 'center';
      for (const f of LABELS) {
        const x = (Math.log(f / F_MIN) / Math.log(F_MAX / F_MIN)) * w;
        ctx.fillText(f >= 1000 ? `${f / 1000}k` : String(f), x, h - 3);
      }
    });
  }, [engine]);
  return <canvas ref={ref} className="viz-canvas" role="img" aria-label="Frequency spectrum" />;
}
