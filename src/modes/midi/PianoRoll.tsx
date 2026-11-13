/**
 * Canvas piano roll: original notes of the selected tracks (dimmed), the
 * reduced monophonic result (highlighted, at its sounding pitch), the trimmed
 * section, a time axis and a playhead. The notes are rendered once into an
 * offscreen layer; each animation frame only blits it and draws the playhead,
 * so files with many thousands of notes stay cheap.
 */
import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react';
import { midiToNoteName } from '../../audio/music';
import type { Sequence } from '../../audio/types';
import { cssVar, startCanvasLoop } from '../../components/visualizer/canvasLoop';
import { useStudio } from '../../studio/StudioContext';
import type { MonoNote } from './reduce';
import type { MidiSummary } from './types';

export type RollView = 'file' | 'section';

export interface PianoRollProps {
  summary: MidiSummary | null;
  selected: readonly number[];
  mono: readonly MonoNote[];
  window: { start: number; end: number };
  speed: number;
  sequence: Sequence | null;
  view: RollView;
  /** Drag on the roll (file view) to select a section; double-click clears it. */
  onSelectSection?: (start: number, end: number) => void;
}

const GUTTER = 36;
const AXIS = 20;
const TICKS = [0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600];

function fmtTime(s: number, step: number): string {
  if (step < 1) return s.toFixed(step < 0.25 ? 1 : 2).replace(/0$/, '') + 's';
  const m = Math.floor(s / 60);
  const sec = Math.round(s - m * 60);
  return m > 0 ? `${m}:${String(sec).padStart(2, '0')}` : `${sec}s`;
}

interface Layout {
  t0: number;
  t1: number;
  lo: number;
  hi: number;
  w: number;
  h: number;
}

function xOf(l: Layout, t: number): number {
  return GUTTER + ((t - l.t0) / (l.t1 - l.t0)) * (l.w - GUTTER);
}

function drawStatic(ctx: CanvasRenderingContext2D, p: PianoRollProps, w: number, h: number): Layout | null {
  ctx.clearRect(0, 0, w, h);
  const s = p.summary;
  const colors = {
    bg: cssVar('--surface', '#ffffff'),
    shade: cssVar('--surface-3', '#ece9d8'),
    grid: cssVar('--border', '#c9c4ae'),
    text: cssVar('--text-faint', '#6b7890'),
    dim: cssVar('--mode-midi-1', '#b8c4d6'),
    hot: cssVar('--blue', '#1a62d6'),
    mark: cssVar('--select-bg', '#316ac5'),
  };
  ctx.fillStyle = colors.bg;
  ctx.fillRect(0, 0, w, h);
  if (!s) return null;

  const sel = new Set(p.selected);
  const tracks = s.tracks.filter((t) => sel.has(t.index) && t.noteCount > 0);
  const t0 = p.view === 'section' ? p.window.start : 0;
  const t1Raw = p.view === 'section' ? p.window.end : Math.max(s.duration, p.window.end);
  const t1 = t1Raw > t0 ? t1Raw : t0 + 1;

  let lo = Infinity;
  let hi = -Infinity;
  for (const t of tracks) {
    if (t.minMidi !== null) lo = Math.min(lo, t.minMidi);
    if (t.maxMidi !== null) hi = Math.max(hi, t.maxMidi);
  }
  for (const n of p.mono) {
    lo = Math.min(lo, n.midi);
    hi = Math.max(hi, n.midi);
  }
  if (!Number.isFinite(lo)) {
    lo = 48;
    hi = 84;
  }
  lo -= 2;
  hi += 2;
  if (hi - lo < 24) {
    const mid = (lo + hi) / 2;
    lo = Math.floor(mid - 12);
    hi = Math.ceil(mid + 12);
  }
  const l: Layout = { t0, t1, lo, hi, w, h };
  const plotH = h - AXIS;
  const rowH = plotH / (hi - lo + 1);
  const yOf = (m: number) => plotH - (m - lo + 1) * rowH;
  const noteH = Math.max(1, rowH - (rowH > 4 ? 1 : 0));

  // octave grid + labels
  ctx.font = `10px ${cssVar('--font-ui', 'sans-serif')}`;
  ctx.textBaseline = 'middle';
  for (let m = Math.ceil(lo / 12) * 12; m <= hi; m += 12) {
    const y = Math.round(yOf(m) + rowH) + 0.5;
    ctx.strokeStyle = colors.grid;
    ctx.globalAlpha = 0.7;
    ctx.beginPath();
    ctx.moveTo(GUTTER, y);
    ctx.lineTo(w, y);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.fillStyle = colors.text;
    ctx.fillText(midiToNoteName(m), 4, y - rowH / 2);
  }

  // time axis
  const span = t1 - t0;
  const pxPerS = (w - GUTTER) / span;
  const step = TICKS.find((st) => st * pxPerS >= 64) ?? 600;
  ctx.textBaseline = 'alphabetic';
  for (let t = Math.ceil(t0 / step) * step; t <= t1 + 1e-9; t += step) {
    const x = Math.round(xOf(l, t)) + 0.5;
    ctx.strokeStyle = colors.grid;
    ctx.globalAlpha = 0.35;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, plotH);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.fillStyle = colors.text;
    ctx.fillText(fmtTime(t, step), x + 3, h - 6);
  }
  ctx.strokeStyle = colors.grid;
  ctx.beginPath();
  ctx.moveTo(GUTTER + 0.5, 0);
  ctx.lineTo(GUTTER + 0.5, plotH);
  ctx.moveTo(GUTTER, plotH + 0.5);
  ctx.lineTo(w, plotH + 0.5);
  ctx.stroke();

  ctx.save();
  ctx.beginPath();
  ctx.rect(GUTTER + 1, 0, w - GUTTER - 1, plotH);
  ctx.clip();

  // original notes (dimmed)
  ctx.fillStyle = colors.dim;
  ctx.globalAlpha = 0.8;
  for (const t of tracks) {
    for (const n of t.notes) {
      if (n.time > t1 || n.time + n.duration < t0) continue;
      const x = xOf(l, n.time);
      ctx.fillRect(x, yOf(n.midi), Math.max(1, n.duration * pxPerS), noteH);
    }
  }
  ctx.globalAlpha = 1;

  // reduced result (highlighted)
  ctx.fillStyle = colors.hot;
  for (const n of p.mono) {
    const ft = p.window.start + n.time * p.speed;
    const fd = n.duration * p.speed;
    if (ft > t1 || ft + fd < t0) continue;
    ctx.fillRect(xOf(l, ft), yOf(n.midi), Math.max(1.5, fd * pxPerS), Math.max(2, noteH));
  }

  // section shading (file view)
  if (p.view === 'file' && (p.window.start > 0 || p.window.end < s.duration)) {
    ctx.fillStyle = colors.shade;
    ctx.globalAlpha = 0.7;
    const xa = xOf(l, p.window.start);
    const xb = xOf(l, p.window.end);
    ctx.fillRect(GUTTER, 0, xa - GUTTER, plotH);
    ctx.fillRect(xb, 0, w - xb, plotH);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = colors.mark;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(Math.round(xa) + 0.5, 0);
    ctx.lineTo(Math.round(xa) + 0.5, plotH);
    ctx.moveTo(Math.round(xb) - 0.5, 0);
    ctx.lineTo(Math.round(xb) - 0.5, plotH);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.restore();
  return l;
}

export function PianoRoll(props: PianoRollProps) {
  const { engine } = useStudio();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const propsRef = useRef(props);
  const versionRef = useRef(0);
  const layoutRef = useRef<Layout | null>(null);
  const dragRef = useRef<{ from: number; to: number } | null>(null);

  const { summary, selected, mono, window: win, speed, sequence, view } = props;
  useEffect(() => {
    propsRef.current = props;
  });
  useEffect(() => {
    versionRef.current++;
  }, [summary, selected, mono, win, speed, sequence, view]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const layer = document.createElement('canvas');
    const lctx = layer.getContext('2d');
    let key = '';
    const mark = cssVar('--select-bg', '#316ac5');
    const head = cssVar('--danger', '#cf2c22');
    return startCanvasLoop(canvas, (ctx, w, h, dpr) => {
      const p = propsRef.current;
      const k = `${w}x${h}@${dpr}#${versionRef.current}`;
      if (lctx && k !== key) {
        key = k;
        layer.width = Math.round(w * dpr);
        layer.height = Math.round(h * dpr);
        lctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        layoutRef.current = drawStatic(lctx, p, w, h);
      }
      ctx.clearRect(0, 0, w, h);
      ctx.drawImage(layer, 0, 0, w, h);
      const l = layoutRef.current;
      if (!l) return;
      const plotH = h - AXIS;

      // drag selection preview
      const d = dragRef.current;
      if (d) {
        const xa = xOf(l, Math.min(d.from, d.to));
        const xb = xOf(l, Math.max(d.from, d.to));
        ctx.fillStyle = mark;
        ctx.globalAlpha = 0.2;
        ctx.fillRect(xa, 0, xb - xa, plotH);
        ctx.globalAlpha = 1;
      }

      // playhead
      const st = engine.state;
      if (p.sequence && engine.currentPlayable === p.sequence && (st.isPlaying || st.isPaused)) {
        const ft = p.window.start + st.position * p.speed;
        if (ft >= l.t0 && ft <= l.t1) {
          const x = Math.round(xOf(l, ft)) + 0.5;
          ctx.strokeStyle = head;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, plotH);
          ctx.stroke();
          ctx.lineWidth = 1;
        }
      }
    });
  }, [engine]);

  const timeAt = (e: ReactPointerEvent<HTMLCanvasElement>): number | null => {
    const l = layoutRef.current;
    if (!l) return null;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const t = l.t0 + ((x - GUTTER) / Math.max(1, l.w - GUTTER)) * (l.t1 - l.t0);
    return Math.min(l.t1, Math.max(l.t0, t));
  };

  const interactive = props.view === 'file' && !!props.summary && !!props.onSelectSection;

  return (
    <canvas
      ref={canvasRef}
      className="mode-midi__roll"
      data-interactive={interactive || undefined}
      role="img"
      aria-label={
        props.summary
          ? `Piano roll: ${props.mono.length} result notes highlighted over the original notes of ${props.selected.length} selected track(s)`
          : 'Piano roll (no file loaded)'
      }
      onPointerDown={(e) => {
        if (!interactive || e.button !== 0) return;
        const t = timeAt(e);
        if (t === null) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        dragRef.current = { from: t, to: t };
      }}
      onPointerMove={(e) => {
        const d = dragRef.current;
        if (!d) return;
        const t = timeAt(e);
        if (t !== null) d.to = t;
      }}
      onPointerUp={(e) => {
        const d = dragRef.current;
        dragRef.current = null;
        if (!d || !props.onSelectSection) return;
        const t = timeAt(e) ?? d.to;
        const a = Math.min(d.from, t);
        const b = Math.max(d.from, t);
        if (b - a >= 0.1) props.onSelectSection(a, b);
      }}
      onPointerCancel={() => {
        dragRef.current = null;
      }}
      onDoubleClick={() => {
        if (interactive && props.summary) props.onSelectSection?.(0, 0);
      }}
    />
  );
}
