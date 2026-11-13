/**
 * Pitch-roll grid + per-step lanes (velocity, length, mute). Columns are
 * memoized per step, so editing one step (or a velocity drag) only re-renders
 * that column; the playhead is a separate overlay.
 */
import { memo, useEffect, useRef, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';
import { midiToNoteName } from '../../audio/music';
import type { SeqPattern, SeqStep, StepLength } from './build';

export interface BoardRow {
  midi: number;
  inScale: boolean;
  isRoot: boolean;
}

export interface BoardProps {
  pattern: SeqPattern;
  rows: readonly BoardRow[];
  lowMidi: number;
  highMidi: number;
  selected: number | null;
  /** Step currently playing in this pattern, -1 = none. */
  playStep: number;
  onCell: (step: number, midi: number) => void;
  onSelect: (step: number) => void;
  onPatch: (step: number, patch: Partial<SeqStep>) => void;
  onToggleMute: (step: number) => void;
}

// ---------------------------------------------------------------- length

export function formatLength(len: number): string {
  return len === 0.5 ? '½' : '1';
}

/** Options for a two-way ½ / 1 SegmentedControl (string-valued). */
export const LENGTH_OPTIONS = [
  { value: '0.5', label: '½', ariaLabel: 'Half step', title: 'Half step: articulated' },
  { value: '1', label: '1', ariaLabel: 'Full step', title: 'Full step: ties into the next step' },
] as const;

// ---------------------------------------------------------------- column

interface ColumnProps {
  index: number;
  step: SeqStep;
  rows: readonly BoardRow[];
  lowMidi: number;
  highMidi: number;
  selected: boolean;
  focusRow: number;
  onCell: (step: number, midi: number) => void;
  onSelect: (step: number) => void;
  onToggleMute: (step: number) => void;
}

const Column = memo(function Column({ index, step, rows, lowMidi, highMidi, selected, focusRow, onCell, onSelect, onToggleMute }: ColumnProps) {
  const above = step.on && step.midi > highMidi;
  const below = step.on && step.midi < lowMidi;
  const name = midiToNoteName(step.midi);
  const cls = [
    'mode-sequencer__col',
    index % 4 === 0 && 'mode-sequencer__col--beat',
    index % 16 === 0 && 'mode-sequencer__col--bar',
    Math.floor(index / 4) % 2 === 1 && 'mode-sequencer__col--shade',
    selected && 'mode-sequencer__col--selected',
    step.muted && 'mode-sequencer__col--muted',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <div className={cls} data-col={index}>
      <button
        type="button"
        className="mode-sequencer__stepnum"
        tabIndex={-1}
        aria-label={`Select step ${index + 1}`}
        title={above || below ? `Step ${index + 1}: ${name} (outside the grid range)` : `Step ${index + 1}`}
        onClick={() => onSelect(index)}
      >
        {above ? '▲' : below ? '▼' : index + 1}
      </button>
      {rows.map((r, ri) => {
        const active = step.on && step.midi === r.midi;
        return (
          <button
            key={r.midi}
            type="button"
            data-row={ri}
            tabIndex={ri === focusRow ? 0 : -1}
            className={[
              'mode-sequencer__cell',
              !r.inScale && 'mode-sequencer__cell--off',
              r.isRoot && 'mode-sequencer__cell--root',
              active && 'mode-sequencer__cell--on',
            ]
              .filter(Boolean)
              .join(' ')}
            aria-pressed={active}
            aria-label={`Step ${index + 1}, ${midiToNoteName(r.midi)}`}
            onClick={() => onCell(index, r.midi)}
          >
            {active && (
              <span
                className="mode-sequencer__note"
                style={{ '--len': step.length, '--vel': step.velocity } as CSSProperties}
                aria-hidden="true"
              />
            )}
          </button>
        );
      })}
      <div
        className={['mode-sequencer__lane', 'mode-sequencer__lane--vel', !step.on && 'mode-sequencer__lane--rest'].filter(Boolean).join(' ')}
        data-lane="velocity"
        data-col={index}
        title={`Velocity ${Math.round(step.velocity * 100)}%`}
      >
        <span className="mode-sequencer__bar" style={{ height: `${step.velocity * 100}%` }} />
      </div>
      <div
        className={['mode-sequencer__lane', 'mode-sequencer__lane--len', !step.on && 'mode-sequencer__lane--rest'].filter(Boolean).join(' ')}
        data-lane="length"
        data-col={index}
        title={`Length ${formatLength(step.length)} step (click to toggle ½ / 1, drag to paint)`}
      >
        <span className="mode-sequencer__bar" style={{ height: step.length === 0.5 ? '50%' : '100%' }} />
        <span className="mode-sequencer__lenval">{formatLength(step.length)}</span>
      </div>
      <button
        type="button"
        tabIndex={-1}
        className={['mode-sequencer__rest', !step.muted && 'mode-sequencer__rest--on'].filter(Boolean).join(' ')}
        aria-pressed={!step.muted}
        aria-label={step.muted ? `Step ${index + 1} muted (click to unmute)` : `Step ${index + 1} playing (click to mute)`}
        title={step.muted ? `Step ${index + 1} muted (click to unmute)` : `Step ${index + 1} playing (click to mute)`}
        onClick={() => onToggleMute(index)}
      >
        {step.muted ? '–' : '●'}
      </button>
    </div>
  );
});

// ---------------------------------------------------------------- board

export const Board = memo(function Board({ pattern, rows, lowMidi, highMidi, selected, playStep, onCell, onSelect, onPatch, onToggleMute }: BoardProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const colsRef = useRef<HTMLDivElement>(null);
  const drag = useRef<
    { lane: 'velocity'; top: number; height: number; pointer: number } | { lane: 'length'; value: StepLength; pointer: number } | null
  >(null);
  const steps = pattern.steps;
  // Single tab stop: the selected step's note row (or the top row).
  const focusCol = selected !== null && selected < steps ? selected : 0;
  const focusRow = Math.max(0, rows.findIndex((r) => r.midi === pattern.notes[focusCol]?.midi));

  // Keep the playhead visible inside the horizontally scrolling container.
  useEffect(() => {
    const sc = scrollRef.current;
    const cols = colsRef.current;
    if (!sc || !cols || playStep < 0) return;
    const col = cols.children[playStep] as HTMLElement | undefined;
    if (!col) return;
    const label = sc.querySelector<HTMLElement>('.mode-sequencer__labels')?.offsetWidth ?? 0;
    const left = col.offsetLeft + cols.offsetLeft;
    if (left < sc.scrollLeft + label) sc.scrollLeft = left - label;
    else if (left + col.offsetWidth > sc.scrollLeft + sc.clientWidth) sc.scrollLeft = left + col.offsetWidth - sc.clientWidth;
  }, [playStep]);

  const colAt = (clientX: number): number => {
    const el = colsRef.current;
    if (!el) return -1;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0) return -1;
    return Math.min(steps - 1, Math.max(0, Math.floor(((clientX - rect.left) / rect.width) * steps)));
  };

  const applyDrag = (clientX: number, clientY: number) => {
    const d = drag.current;
    if (!d) return;
    const col = colAt(clientX);
    if (col < 0) return;
    if (d.lane === 'length') {
      // Paint the value chosen on pointer down; skip columns that already have it.
      if (pattern.notes[col]?.length !== d.value) onPatch(col, { length: d.value });
      return;
    }
    const f = Math.min(1, Math.max(0, 1 - (clientY - d.top) / d.height));
    onPatch(col, { velocity: Math.round(f * 100) / 100 });
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    const lane = (e.target as HTMLElement).closest<HTMLElement>('[data-lane]');
    if (!lane || e.button !== 0) return;
    const col = Number(lane.dataset.col);
    if (lane.dataset.lane === 'length') {
      // Click toggles this step ½ ↔ 1; dragging paints that value onto other columns.
      const cur = Number.isFinite(col) ? pattern.notes[col]?.length : undefined;
      drag.current = { lane: 'length', value: cur === 0.5 ? 1 : 0.5, pointer: e.pointerId };
    } else {
      const rect = lane.getBoundingClientRect();
      drag.current = { lane: 'velocity', top: rect.top, height: rect.height || 1, pointer: e.pointerId };
    }
    e.currentTarget.setPointerCapture(e.pointerId);
    e.preventDefault();
    if (Number.isFinite(col)) onSelect(col);
    applyDrag(e.clientX, e.clientY);
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (drag.current && drag.current.pointer === e.pointerId) applyDrag(e.clientX, e.clientY);
  };
  const endDrag = (e: PointerEvent<HTMLDivElement>) => {
    if (drag.current && drag.current.pointer === e.pointerId) drag.current = null;
  };

  // Roving focus through the grid with the arrow keys.
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const t = e.target as HTMLElement;
    const rowAttr = t.dataset.row;
    const colEl = t.closest<HTMLElement>('[data-col]');
    if (rowAttr === undefined || !colEl) return;
    let r = Number(rowAttr);
    let c = Number(colEl.dataset.col);
    if (e.key === 'ArrowUp') r--;
    else if (e.key === 'ArrowDown') r++;
    else if (e.key === 'ArrowLeft') c--;
    else if (e.key === 'ArrowRight') c++;
    else return;
    e.preventDefault();
    r = Math.min(rows.length - 1, Math.max(0, r));
    c = Math.min(steps - 1, Math.max(0, c));
    const next = colsRef.current?.children[c]?.querySelector<HTMLElement>(`[data-row="${r}"]`);
    if (next) {
      next.focus();
      if (c !== Number(colEl.dataset.col)) onSelect(c);
    }
  };

  return (
    <div className="mode-sequencer__scroll" ref={scrollRef}>
      <div className="mode-sequencer__board" role="group" aria-label="Step grid">
        <div className="mode-sequencer__labels" aria-hidden="true">
          <div className="mode-sequencer__label mode-sequencer__label--head">Step</div>
          {rows.map((r) => (
            <div
              key={r.midi}
              className={['mode-sequencer__label', r.isRoot && 'mode-sequencer__label--root', !r.inScale && 'mode-sequencer__label--off'].filter(Boolean).join(' ')}
            >
              {midiToNoteName(r.midi)}
            </div>
          ))}
          <div className="mode-sequencer__label mode-sequencer__label--lane">Vel</div>
          <div className="mode-sequencer__label mode-sequencer__label--lane">Len</div>
          <div className="mode-sequencer__label mode-sequencer__label--rest">On</div>
        </div>
        <div
          className="mode-sequencer__cols"
          ref={colsRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onKeyDown={onKeyDown}
        >
          {pattern.notes.slice(0, steps).map((st, i) => (
            <Column
              key={i}
              index={i}
              step={st}
              rows={rows}
              lowMidi={lowMidi}
              highMidi={highMidi}
              selected={selected === i}
              focusRow={i === focusCol ? focusRow : -1}
              onCell={onCell}
              onSelect={onSelect}
              onToggleMute={onToggleMute}
            />
          ))}
          {playStep >= 0 && playStep < steps && (
            <div className="mode-sequencer__playhead" style={{ '--step': playStep } as CSSProperties} aria-hidden="true" />
          )}
        </div>
      </div>
    </div>
  );
});
