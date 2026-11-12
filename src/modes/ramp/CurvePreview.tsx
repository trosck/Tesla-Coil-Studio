/**
 * Inline SVG preview of a Sequence's frequency trajectory (log-frequency y
 * axis, time x axis) with a live playhead while this mode is playing.
 * Shared by the Ramp and Siren panels.
 */
import { useMemo } from 'react';
import type { Sequence } from '../../audio/types';
import { usePlayback, useStudio } from '../../studio/StudioContext';
import type { ModeId } from '../../studio/types';
import { freqToY, sampleTrajectory, sequenceFreqRange, timeToX, trajectoryPath, type PlotBox } from './trajectory';
import './curve.css';

const W = 600;
const H = 140;

function formatHz(f: number): string {
  return f >= 1000 ? `${(f / 1000).toFixed(f >= 10000 ? 0 : 1)} kHz` : `${Math.round(f)} Hz`;
}

function Playhead({ modeId, box }: { modeId: ModeId; box: PlotBox }) {
  const { sourceModeId } = useStudio();
  const playing = usePlayback((s) => s.isPlaying && !s.isPaused);
  const position = usePlayback((s) => s.position);
  if (!playing || sourceModeId !== modeId) return null;
  const x = timeToX(Math.min(box.length, Math.max(0, position)), box);
  return <line className="mode-ramp-curve__playhead" x1={x} x2={x} y1={0} y2={box.height} vectorEffect="non-scaling-stroke" />;
}

export interface CurvePreviewProps {
  sequence: Sequence;
  modeId: ModeId;
  /** Accessible description. */
  label: string;
}

export function CurvePreview({ sequence, modeId, label }: CurvePreviewProps) {
  const { box, path, area } = useMemo(() => {
    const range = sequenceFreqRange(sequence);
    const b: PlotBox = { width: W, height: H, length: sequence.length, fMin: range.min, fMax: range.max, pad: 10 };
    const lines = sampleTrajectory(sequence);
    const d = trajectoryPath(lines, b);
    // Filled area under each sounding segment (glow fill).
    const a = lines
      .map((line) => {
        if (line.length === 0) return '';
        const first = line[0]!;
        const last = line[line.length - 1]!;
        const body = line.map((pt) => `L${timeToX(pt.t, b).toFixed(1)} ${freqToY(pt.f, b).toFixed(1)}`).join('');
        return `M${timeToX(first.t, b).toFixed(1)} ${H}${body}L${timeToX(last.t, b).toFixed(1)} ${H}Z`;
      })
      .join('');
    return { box: b, path: d, area: a };
  }, [sequence]);

  return (
    <figure className="mode-ramp-curve">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={label} className="mode-ramp-curve__svg">
        <line className="mode-ramp-curve__grid" x1={0} x2={W} y1={H / 2} y2={H / 2} vectorEffect="non-scaling-stroke" />
        <line className="mode-ramp-curve__grid" x1={W / 2} x2={W / 2} y1={0} y2={H} vectorEffect="non-scaling-stroke" />
        <path className="mode-ramp-curve__area" d={area} />
        <path className="mode-ramp-curve__line" d={path} vectorEffect="non-scaling-stroke" />
        <Playhead modeId={modeId} box={box} />
      </svg>
      <figcaption className="mode-ramp-curve__axis">
        <span>{formatHz(box.fMin)}</span>
        <span>
          {sequence.length.toFixed(sequence.length < 10 ? 2 : 1)} s · {formatHz(box.fMax)} peak
        </span>
      </figcaption>
    </figure>
  );
}
