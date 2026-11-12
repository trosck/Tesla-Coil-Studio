import { useEffect, useRef } from 'react';
import type { AudioEngine } from '../../audio/engine';
import { cssVar, startCanvasLoop } from './canvasLoop';

const WINDOW = 1024; // samples shown (~21 ms at 48 kHz)

/** Time-domain scope with rising zero-crossing trigger for a stable picture. */
export function Oscilloscope({ engine }: { engine: AudioEngine }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const cyan = cssVar('--cyan', '#22e5ff');
    const grid = cssVar('--border', '#2a3142');
    let data: Float32Array<ArrayBuffer> | null = null;
    return startCanvasLoop(canvas, (ctx, w, h) => {
      ctx.clearRect(0, 0, w, h);
      // grid
      ctx.strokeStyle = grid;
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.6;
      ctx.beginPath();
      for (let i = 1; i < 8; i++) {
        const x = Math.round((w * i) / 8) + 0.5;
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
      }
      for (let i = 1; i < 4; i++) {
        const y = Math.round((h * i) / 4) + 0.5;
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
      }
      ctx.stroke();
      ctx.globalAlpha = 1;

      const an = engine.analyser;
      const mid = h / 2;
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
      ctx.strokeStyle = cyan;
      ctx.lineWidth = 2;
      ctx.shadowColor = cyan;
      ctx.shadowBlur = 8;
      ctx.beginPath();
      const amp = (h / 2) * 0.9;
      for (let i = 0; i < count; i++) {
        const x = (i / (count - 1)) * w;
        const s = data ? data[start + i]! : 0;
        const y = mid - s * amp;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.shadowBlur = 0;
    });
  }, [engine]);
  return <canvas ref={ref} className="viz-canvas" role="img" aria-label="Oscilloscope: output waveform" />;
}
