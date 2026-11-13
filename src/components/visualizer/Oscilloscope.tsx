import { useEffect, useRef } from 'react';
import type { AudioEngine } from '../../audio/engine';
import { cssVar, startCanvasLoop } from './canvasLoop';

const WINDOW = 1024; // samples shown (~21 ms at 48 kHz)

/** Time-domain scope with rising zero-crossing trigger, drawn in LCD ink. */
export function Oscilloscope({ engine }: { engine: AudioEngine }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ink = cssVar('--lcd-ink', '#14220a');
    const dim = cssVar('--lcd-ink-dim', 'rgb(20 34 10 / 0.35)');
    const faint = cssVar('--lcd-ink-faint', 'rgb(20 34 10 / 0.15)');
    let data: Float32Array<ArrayBuffer> | null = null;
    return startCanvasLoop(canvas, (ctx, w, h) => {
      ctx.clearRect(0, 0, w, h);
      const mid = Math.round(h / 2) + 0.5;
      // grid: quarter verticals + dashed centre line
      ctx.lineWidth = 1;
      ctx.strokeStyle = faint;
      ctx.beginPath();
      for (let i = 1; i < 4; i++) {
        const x = Math.round((w * i) / 4) + 0.5;
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
      }
      ctx.stroke();
      ctx.strokeStyle = dim;
      ctx.setLineDash([2, 3]);
      ctx.beginPath();
      ctx.moveTo(0, mid);
      ctx.lineTo(w, mid);
      ctx.stroke();
      ctx.setLineDash([]);

      const an = engine.analyser;
      let start = 0;
      let count = WINDOW;
      if (an) {
        if (!data || data.length !== an.fftSize) data = new Float32Array(an.fftSize);
        an.getFloatTimeDomainData(data);
        count = Math.min(WINDOW, data.length >> 1);
        // trigger: first rising zero crossing in the first half
        for (let i = 1; i < data.length - count; i++) {
          if (data[i - 1]! < 0 && data[i]! >= 0) {
            start = i;
            break;
          }
        }
      }
      ctx.strokeStyle = ink;
      ctx.lineWidth = 2.5;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      const amp = (h / 2) * 0.85;
      for (let i = 0; i < count; i++) {
        const x = (i / (count - 1)) * w;
        const s = data ? data[start + i]! : 0;
        const y = mid - s * amp;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    });
  }, [engine]);
  return <canvas ref={ref} className="lcd-canvas" role="img" aria-label="Oscilloscope: output waveform" />;
}
