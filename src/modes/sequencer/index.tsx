/**
 * Sequencer mode: monophonic 4/8/16/32-step pitch-roll sequencer with 4 pattern
 * slots, swing, per-step velocity/length, randomizer and chain playback.
 * Pure logic lives in build.ts / pattern.ts.
 */
import { useCallback, useMemo, useState } from 'react';
import { NOTE_NAMES_SHARP, SCALES, SCALE_LIST, isInScale, midiToNoteName, scaleNotesInRange, type ScaleId } from '../../audio/music';
import { Button, Panel, SegmentedControl, Select, Slider, Toggle } from '../../components/ui';
import { usePlayback, useStudio } from '../../studio/StudioContext';
import { defineMode, type ModePanelProps } from '../../studio/types';
import { Board, type BoardRow } from './Board';
import {
  BPM_MAX,
  BPM_MIN,
  GATE_MAX,
  GATE_MIN,
  OCTAVE_MAX,
  OCTAVE_MIN,
  SLOT_NAMES,
  SWING_MAX,
  buildSequencer,
  clonePattern,
  defaultSequencerParams,
  gridHighMidi,
  gridLowMidi,
  keyScale,
  normalizeSequencerParams,
  playOrder,
  seqStepSeconds,
  slotForChunk,
  stepAtPosition,
  type GridRange,
  type SeqPattern,
  type SeqStep,
  type SequencerParams,
  type StepCount,
} from './build';
import { Inspector } from './Inspector';
import { applyGateToAll, clearPattern, clickCell, randomizePattern, setStepCount, snapPatternToScale, toggleRest, transposePattern, updateStep } from './pattern';
import './sequencer.css';

const ROOT_OPTIONS = NOTE_NAMES_SHARP.map((n, i) => ({ value: String(i), label: n }));
const SCALE_OPTIONS = SCALE_LIST.map((s) => ({ value: s.id, label: s.label }));
const RANGE_OPTIONS = [
  { value: '1', label: '1 oct' },
  { value: '2', label: '2 oct' },
  { value: '3', label: '3 oct' },
] as const;
const STEP_OPTIONS = [
  { value: '4', label: '4 steps' },
  { value: '8', label: '8 steps' },
  { value: '16', label: '16 steps' },
  { value: '32', label: '32 steps' },
] as const;

function shapeName(id: ScaleId): string {
  const n = SCALES[id].intervals.length;
  if (id === 'chromatic') return 'chromatic';
  if (id === 'pentatonic') return 'pentatonic';
  return n === 7 && SCALES[id].intervals[2] === 3 ? 'minor' : 'major';
}

type PatternFn = (pat: SeqPattern, p: SequencerParams) => SeqPattern;

function SequencerPanel({ params, setParams }: ModePanelProps<SequencerParams>) {
  const { sourceModeId } = useStudio();
  const [selected, setSelected] = useState<number | null>(0);
  const [clipboard, setClipboard] = useState<SeqPattern | null>(null);

  const pattern = params.patterns[params.current]!;
  const { scale: scaleId, root } = params;
  const scale = useMemo(() => keyScale({ scale: scaleId, root }), [scaleId, root]);
  const lowMidi = gridLowMidi(params);
  const highMidi = gridHighMidi(params);

  // Grid rows (high to low): scale notes in range + any off-scale notes in use.
  const usedKey = pattern.notes
    .slice(0, pattern.steps)
    .filter((s) => s.on && s.midi >= lowMidi && s.midi <= highMidi && !isInScale(s.midi, scale))
    .map((s) => s.midi)
    .join(',');
  const rows = useMemo<BoardRow[]>(() => {
    const set = new Set(scaleNotesInRange(scale, lowMidi, highMidi));
    for (const m of usedKey ? usedKey.split(',').map(Number) : []) set.add(m);
    return [...set]
      .sort((a, b) => b - a)
      .map((midi) => ({ midi, inScale: isInScale(midi, scale), isRoot: ((midi % 12) + 12) % 12 === scale.root }));
  }, [scale, lowMidi, highMidi, usedKey]);

  // ---- updates (functional, so callbacks stay stable for the memoized board)
  const editPattern = useCallback(
    (fn: PatternFn) =>
      setParams((p) => {
        const patterns = p.patterns.slice();
        patterns[p.current] = fn(p.patterns[p.current]!, p);
        return { ...p, patterns };
      }),
    [setParams],
  );
  const set = useCallback(<K extends keyof SequencerParams>(k: K, v: SequencerParams[K]) => setParams((p) => ({ ...p, [k]: v })), [setParams]);

  const onCell = useCallback(
    (i: number, midi: number) => {
      setSelected(i);
      editPattern((pat, p) => clickCell(pat, i, midi, p.gate));
    },
    [editPattern],
  );
  const onPatch = useCallback((i: number, patch: Partial<SeqStep>) => editPattern((pat) => updateStep(pat, i, patch)), [editPattern]);
  const onToggleRest = useCallback(
    (i: number) => {
      setSelected(i);
      editPattern((pat) => toggleRest(pat, i));
    },
    [editPattern],
  );
  const onSelect = useCallback((i: number) => setSelected(i), []);

  // ---- playhead: derived from transport position (moves through held/tied steps too)
  const swing = params.swing;
  const head = usePlayback((s) => {
    if (sourceModeId !== 'sequencer' || !(s.isPlaying || s.isPaused) || !s.label?.startsWith('sequencer')) return -1;
    const bpm = s.bpm ?? params.bpm;
    const steps = Math.round(s.length / seqStepSeconds(bpm));
    const st = stepAtPosition(s.position, bpm, swing, steps);
    if (st < 0) return -1;
    return slotForChunk(params, s.chunkIndex) * 64 + st;
  });
  const playSlot = head >= 0 ? Math.floor(head / 64) : -1;
  const playStep = head >= 0 && playSlot === params.current ? head % 64 : -1;

  const order = playOrder(params);
  const sel = selected !== null && selected < pattern.steps ? selected : null;

  return (
    <div className="mode-sequencer">
      {/* ---- pattern bar */}
      <div className="mode-sequencer__bar-top">
        <div className="mode-sequencer__slots" role="group" aria-label="Pattern slots">
          {SLOT_NAMES.map((name, i) => {
            const pat = params.patterns[i]!;
            const filled = pat.notes.slice(0, pat.steps).some((s) => s.on);
            return (
              <button
                key={name}
                type="button"
                className={['mode-sequencer__slot', playSlot === i && 'mode-sequencer__slot--playing', !filled && 'mode-sequencer__slot--empty'].filter(Boolean).join(' ')}
                aria-pressed={params.current === i}
                title={`Pattern ${name}${filled ? '' : ' (empty)'}${playSlot === i ? ' — playing' : ''}`}
                onClick={() => set('current', i)}
              >
                {name}
                {order.includes(i) && <span className="mode-sequencer__slot-dot" aria-hidden="true" />}
              </button>
            );
          })}
        </div>
        <div className="mode-sequencer__actions">
          <Button size="sm" onClick={() => setClipboard(clonePattern(pattern))} title="Copy this pattern">
            Copy
          </Button>
          <Button size="sm" disabled={!clipboard} onClick={() => clipboard && editPattern(() => clonePattern(clipboard))} title="Replace this pattern with the copied one">
            Paste
          </Button>
          <Button size="sm" variant="danger" onClick={() => editPattern((pat, p) => clearPattern(pat, gridLowMidi(p), p.gate))}>
            Clear
          </Button>
        </div>
        <SegmentedControl
          aria-label="Pattern length"
          value={String(pattern.steps)}
          options={STEP_OPTIONS}
          onChange={(v) => {
            const steps = Number(v) as StepCount;
            editPattern((pat) => setStepCount(pat, steps));
          }}
        />
      </div>

      <div className="mode-sequencer__layout">
        {/* ---- grid */}
        <Panel
          className="mode-sequencer__grid-panel"
          title={`Pattern ${SLOT_NAMES[params.current]} · ${NOTE_NAMES_SHARP[params.root]} ${shapeName(params.scale)} · ${midiToNoteName(lowMidi)}–${midiToNoteName(highMidi)}`}
        >
          <Board
            pattern={pattern}
            rows={rows}
            lowMidi={lowMidi}
            highMidi={highMidi}
            selected={sel}
            playStep={playStep}
            onCell={onCell}
            onSelect={onSelect}
            onPatch={onPatch}
            onToggleRest={onToggleRest}
          />
          <p className="mode-sequencer__tip">
            Click a cell to place a note, click it again for a rest. Drag the Vel / Len lanes to paint. Length ≥ 1 step ties into the next step.
          </p>
        </Panel>

        <div className="mode-sequencer__side">
          {sel !== null && (
            <Inspector
              index={sel}
              step={pattern.notes[sel]!}
              steps={pattern.steps}
              scale={scale}
              onPatch={(patch) => onPatch(sel, patch)}
              onSelect={setSelected}
            />
          )}

          <Panel title="Generate" className="mode-sequencer__gen">
            <Slider label="Density" value={Math.round(params.density * 100)} min={0} max={100} step={1} unit="%" onChange={(v) => set('density', v / 100)} />
            <Button
              variant="primary"
              onClick={() =>
                editPattern((pat, p) =>
                  randomizePattern(pat, { scale: keyScale(p), lowMidi: gridLowMidi(p), highMidi: gridHighMidi(p), density: p.density, gate: p.gate }),
                )
              }
            >
              Randomize pattern
            </Button>
          </Panel>
        </div>
      </div>

      <div className="mode-sequencer__controls">
        <Panel title="Tempo & feel">
          <div className="mode-sequencer__fields">
            <Slider label="BPM" value={params.bpm} min={BPM_MIN} max={BPM_MAX} step={1} onChange={(v) => set('bpm', v)} />
            <Slider
              label="Swing"
              value={Math.round(params.swing * 100)}
              min={0}
              max={SWING_MAX * 100}
              step={1}
              unit="%"
              onChange={(v) => set('swing', v / 100)}
              hint="Delays every off-beat 16th."
            />
            <Slider
              label="Gate (new notes)"
              value={params.gate}
              min={GATE_MIN}
              max={GATE_MAX}
              step={0.05}
              unit="step"
              onChange={(v) => set('gate', v)}
              hint="Below 1 step = articulated repeats."
            />
            <Button size="sm" onClick={() => editPattern((pat, p) => applyGateToAll(pat, p.gate))}>
              Apply gate to all notes
            </Button>
          </div>
        </Panel>

        <Panel title="Pitch">
          <div className="mode-sequencer__fields mode-sequencer__fields--pitch">
            <Select
              label="Scale"
              value={params.scale}
              options={SCALE_OPTIONS}
              onChange={(v) => setParams((p) => ({ ...p, scale: v, root: SCALES[v].root }))}
              hint="Also sets the root."
            />
            <Select label="Root" value={String(params.root)} options={ROOT_OPTIONS} onChange={(v) => set('root', Number(v))} />
            <Select
              label="Octave"
              value={String(params.octave)}
              options={Array.from({ length: OCTAVE_MAX - OCTAVE_MIN + 1 }, (_, i) => ({ value: String(OCTAVE_MIN + i), label: String(OCTAVE_MIN + i) }))}
              onChange={(v) => set('octave', Number(v))}
            />
            <div className="ui-field">
              <span className="ui-field__label">Grid range</span>
              <SegmentedControl aria-label="Grid range" value={String(params.range) as '1' | '2' | '3'} options={RANGE_OPTIONS} onChange={(v) => set('range', Number(v) as GridRange)} />
            </div>
          </div>
          <div className="mode-sequencer__transpose" role="group" aria-label="Transpose pattern">
            <span className="ui-field__label">Transpose</span>
            <Button size="sm" onClick={() => editPattern((pat) => transposePattern(pat, -12))}>
              −Oct
            </Button>
            <Button size="sm" onClick={() => editPattern((pat) => transposePattern(pat, -1))}>
              −1
            </Button>
            <Button size="sm" onClick={() => editPattern((pat) => transposePattern(pat, 1))}>
              +1
            </Button>
            <Button size="sm" onClick={() => editPattern((pat) => transposePattern(pat, 12))}>
              +Oct
            </Button>
            <Button size="sm" variant="ghost" onClick={() => editPattern((pat, p) => snapPatternToScale(pat, keyScale(p)))} title="Move every note to the nearest scale note">
              Snap to scale
            </Button>
          </div>
        </Panel>

        <Panel title="Chain">
          <Toggle checked={params.chain} onChange={(v) => set('chain', v)} label="Chain slots (play in order)" />
          <div className="mode-sequencer__chain" role="group" aria-label="Slots in chain">
            {SLOT_NAMES.map((name, i) => (
              <Button
                key={name}
                size="sm"
                pressed={params.chainSlots[i]}
                disabled={!params.chain}
                onClick={() => setParams((p) => ({ ...p, chainSlots: p.chainSlots.map((on, j) => (j === i ? !on : on)) }))}
              >
                {name}
              </Button>
            ))}
          </div>
          <p className="mode-sequencer__tip">
            {params.chain ? `Plays ${order.map((i) => SLOT_NAMES[i]).join(' → ')}; with LOOP on it repeats.` : 'Off: the selected slot plays.'} Edits apply at the next pattern boundary.
          </p>
        </Panel>
      </div>
    </div>
  );
}

export const mode = defineMode<SequencerParams>({
  id: 'sequencer',
  label: 'Sequencer',
  description: 'Step sequencer grid with per-step pitch, gate and velocity.',
  defaultParams: defaultSequencerParams,
  normalizeParams: normalizeSequencerParams,
  build: buildSequencer,
  liveUpdate: 'boundary',
  Panel: SequencerPanel,
});
