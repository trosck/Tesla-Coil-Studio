/**
 * requestAnimationFrame loop for a canvas: handles devicePixelRatio, resizing,
 * and skips drawing while the tab is hidden or the canvas is off-screen.
 * Returns a cleanup function (use it as a useEffect return value).
 */
export type DrawFn = (ctx: CanvasRenderingContext2D, width: number, height: number, dpr: number) => void;

export function startCanvasLoop(canvas: HTMLCanvasElement, draw: DrawFn): () => void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return () => undefined;
  let raf = 0;
  let visible = true;
  let w = 0;
  let h = 0;
  let dpr = 1;

  const resize = () => {
    dpr = Math.min(window.devicePixelRatio || 1, 3);
    const rect = canvas.getBoundingClientRect();
    w = Math.max(1, Math.round(rect.width));
    h = Math.max(1, Math.round(rect.height));
    const bw = Math.round(w * dpr);
    const bh = Math.round(h * dpr);
    if (canvas.width !== bw || canvas.height !== bh) {
      canvas.width = bw;
      canvas.height = bh;
    }
  };

  const frame = () => {
    raf = 0;
    if (visible && !document.hidden) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      draw(ctx, w, h, dpr);
    }
    schedule();
  };
  const schedule = () => {
    if (!raf && visible && !document.hidden) raf = requestAnimationFrame(frame);
  };

  const ro = new ResizeObserver(resize);
  ro.observe(canvas);
  const io = new IntersectionObserver((entries) => {
    visible = entries.some((e) => e.isIntersecting);
    schedule();
  });
  io.observe(canvas);
  const onVis = () => schedule();
  document.addEventListener('visibilitychange', onVis);
  resize();
  schedule();

  return () => {
    if (raf) cancelAnimationFrame(raf);
    ro.disconnect();
    io.disconnect();
    document.removeEventListener('visibilitychange', onVis);
  };
}

/** Read a CSS custom property from :root (falls back if missing). */
export function cssVar(name: string, fallback: string): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}
