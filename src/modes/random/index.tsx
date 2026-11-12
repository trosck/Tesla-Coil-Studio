/**
 * Random mode: seeded generative phrases quantized to a scale (or free Hz).
 * Sound is compiled by the pure `buildRandomPlayable` (build.ts).
 */
import { useMemo } from 'react';
import { NOTE_NAMES_SHARP, SCALE_LIST, SCALES, createRng, freqToMidi, midiToFreq, type ScaleId } from '../../audio/music';
import type { Sequence } from '../../audio/types';
import { Button, NumberInput, Panel, SegmentedControl, Select, Slider, Toggle } from '../../components/ui';
import { usePlayback, useStudio } from '../../studio/StudioContext';
import { defineMode, type ModePanelProps } from '../../studio/types';
import {
  RANDOM_BARS_MAX,
  RANDOM_BPM_MAX,
  RANDOM_BPM_MIN,
  RANDOM_GATE_MIN,
  RANDOM_REST_MAX,
  RANDOM_SEED_MAX,
  buildRandomPlayable,
  defaultRandomParams,
  generatePhrase,
  normalizeRandomParams,
  scalePool,
  type RandomParams,
  type RandomScale,
} from './build';
import './random.css';

export type { RandomParams } from './build';

const SCALE_TYPE: Record<ScaleId, string> = {
  'c-major': 'major',
  'a-minor': 'minor',
  'c-minor': 'minor',
  'd-minor': 'minor',
  pentatonic: 'major pentatonic',
  chromatic: 'chromatic',
};

const SCALE_OPTIONS: { value: RandomScale; label: string }[] = [
  ...SCALE_LIST.map((s) => ({ value: s.id as RandomScale, label: s.label })),
  { value: 'free', label: 'Free (no scale, continuous Hz)' },
];

const ROOT_OPTIONS = NOTE_NAMES_SHARP.map((n, i) => ({ value: String(i), label: n }));

const GRID_OPTIONS: { value: '1' | '2' | '4'; label: string }[] = [
  { value: '1', label: '1/4' },
  { value: '2', label: '1/8' },
  { value: '4', label: '1/16' },
];

const W = 600;
const H = 150;
const PAD = 8;

function usePlayingChunk(): { chunk: number | null; step: number | null } {
  const { sourceModeId } = useStudio();
  const playing = usePlayback((s) => s.isPlaying && !s.isPaused);
  const chunk = usePlayback((s) => s.chunkIndex);
  const step = usePlayback((s) => s.step);
  if (!playing || sourceModeId !== 'random') return { chunk: null, step: null };
  return { chunk, step: typeof step === 'number' ? step : null };
}

function PhrasePlot({ phrase, params, step }: { phrase: Sequence; params: RandomParams; step: number | null }) {
  const lo = Math.min(params.minFreq, params.maxFreq);
  const hi = Math.max(params.minFreq, params.maxFreq);
  const pool = useMemo(() => scalePool(params), [params]);
  const lmLo = freqToMidi(lo) - 0.5;
  const lmHi = Math.max(lmLo + 1, freqToMidi(hi) + 0.5);
  const y = (f: number) => PAD + (1 - (freqToMidi(f) - lmLo) / (lmHi - lmLo)) * (H - 2 * PAD);
  const x = (t: number) => (t / phrase.length) * W;
  const beats = params.bars * 4;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="mode-random__plot" role="img" aria-label={`Phrase with ${phrase.events.length} notes`}>
      {pool.length <= 48 &&
        pool.map((m) => <line key={m} className="mode-random__lane" x1={0} x2={W} y1={y(midiToFreq(m))} y2={y(midiToFreq(m))} vectorEffect="non-scaling-stroke" />)}
      {Array.from({ length: beats + 1 }, (_, b) => (
        <line key={`b${b}`} className={b % 4 === 0 ? 'mode-random__bar' : 'mode-random__beat'} x1={(b / beats) * W} x2={(b / beats) * W} y1={0} y2={H} vectorEffect="non-scaling-stroke" />
      ))}
      {phrase.events.map((e, i) => {
        const yy = y(e.freqStart);
        const now = step !== null && e.step === step;
        return (
          <rect
            key={i}
            className={now ? 'mode-random__note mode-random__note--now' : 'mode-random__note'}
            x={x(e.time)}
            y={yy - 3}
            width={Math.max(3, x(e.duration))}
            height={6}
            rx={2}
          />
        );
      })}
    </svg>
  );
}

function RandomPanel({ params, setParams }: ModePanelProps<RandomParams>) {
  const p = params;
  const set = <K extends keyof RandomParams>(key: K, value: RandomParams[K]) => setParams((prev) => ({ ...prev, [key]: value }));
  const { chunk, step } = usePlayingChunk();
  const chunkIndex = p.repeat ? 0 : (chunk ?? 0);
  const phrase = useMemo(() => generatePhrase(p, createRng(p.repeat ? p.seed : p.seed + chunkIndex)), [p, chunkIndex]);
  const pool = useMemo(() => scalePool(p), [p]);
  const free = p.scale === 'free';
  const scaleName = p.scale === 'free' ? 'Free frequencies' : `${NOTE_NAMES_SHARP[p.root]} ${SCALE_TYPE[p.scale]}`;
  const reroll = () => set('seed', Math.floor(Math.random() * (RANDOM_SEED_MAX + 1)));

  return (
    <div className="mode-random">
      <Panel
        title={p.repeat ? 'Phrase' : `Phrase #${chunkIndex + 1}`}
        actions={
          <div className="mode-random__seed">
            <span className="mode-random__seed-label">Seed</span>
            <NumberInput value={p.seed} min={0} max={RANDOM_SEED_MAX} step={1} onChange={(v) => set('seed', Math.round(v))} aria-label="Seed" />
            <Button size="sm" variant="primary" onClick={reroll} title="New random seed">
              ⟳ Re-roll
            </Button>
          </div>
        }
      >
        <PhrasePlot phrase={phrase} params={p} step={p.repeat || chunk === chunkIndex ? step : null} />
        <div className="mode-random__caption">
          <span>
            {scaleName} · {free ? `${Math.round(Math.min(p.minFreq, p.maxFreq))}–${Math.round(Math.max(p.minFreq, p.maxFreq))} Hz` : `${pool.length} notes in range`}
          </span>
          <span>
            {phrase.events.length} notes · {phrase.length.toFixed(1)} s
          </span>
        </div>
      </Panel>

      <div className="mode-random__grid">
        <Panel title="Pitch">
          <div className="mode-random__stack">
            <Slider label="Min frequency" value={p.minFreq} min={20} max={20000} step={1} scale="log" unit="Hz" onChange={(v) => set('minFreq', v)} />
            <Slider label="Max frequency" value={p.maxFreq} min={20} max={20000} step={1} scale="log" unit="Hz" onChange={(v) => set('maxFreq', v)} />
            <div className="mode-random__pair">
              <Select
                label="Scale"
                value={p.scale}
                options={SCALE_OPTIONS}
                onChange={(v) => setParams((prev) => ({ ...prev, scale: v, root: v === 'free' ? prev.root : SCALES[v].root }))}
              />
              <Select label="Root" value={String(p.root)} options={ROOT_OPTIONS} disabled={free} onChange={(v) => set('root', Number(v))} hint={free ? 'Not used in free mode' : undefined} />
            </div>
          </div>
        </Panel>

        <Panel title="Rhythm">
          <div className="mode-random__stack">
            <Slider label="BPM" value={p.bpm} min={RANDOM_BPM_MIN} max={RANDOM_BPM_MAX} step={1} onChange={(v) => set('bpm', v)} />
            <div className="ui-field">
              <span className="ui-field__label">Step grid</span>
              <SegmentedControl aria-label="Step grid" value={String(p.stepsPerBeat) as '1' | '2' | '4'} options={GRID_OPTIONS} onChange={(v) => set('stepsPerBeat', Number(v) as 1 | 2 | 4)} />
            </div>
            <Slider
              label="Note length (gate)"
              value={Math.round(p.gate * 100)}
              min={RANDOM_GATE_MIN * 100}
              max={100}
              step={1}
              unit="%"
              onChange={(v) => set('gate', v / 100)}
              hint={p.gate >= 1 ? 'Legato: notes touch without gaps' : 'Share of each step the note sounds'}
            />
            <Slider label="Phrase length" value={p.bars} min={1} max={RANDOM_BARS_MAX} step={1} unit="bars" onChange={(v) => set('bars', v)} />
          </div>
        </Panel>

        <Panel title="Character">
          <div className="mode-random__stack">
            <Slider
              label="Randomness"
              value={Math.round(p.randomness * 100)}
              min={0}
              max={100}
              step={1}
              unit="%"
              onChange={(v) => set('randomness', v / 100)}
              hint={p.randomness < 0.2 ? 'Stepwise walk through neighbouring notes' : p.randomness > 0.75 ? 'Wild leaps and varied note lengths' : 'Mostly steps, some leaps and longer notes'}
            />
            <Slider label="Rest probability" value={Math.round(p.restProbability * 100)} min={0} max={RANDOM_REST_MAX * 100} step={1} unit="%" onChange={(v) => set('restProbability', v / 100)} />
            <Slider label="Level" value={Math.round(p.gain * 100)} min={0} max={100} step={1} unit="%" onChange={(v) => set('gain', v / 100)} />
          </div>
        </Panel>

        <Panel title="Repeat">
          <div className="mode-random__stack">
            <Toggle checked={p.repeat} onChange={(v) => set('repeat', v)} label="Repeat the same phrase" />
            <p className="mode-random__tip">
              {p.repeat
                ? 'ON: the seeded phrase plays once; with LOOP on it repeats identically.'
                : 'OFF: endless generation — a new phrase every ' + p.bars + (p.bars === 1 ? ' bar' : ' bars') + ' until STOP (deterministic per seed, so export matches).'}
            </p>
          </div>
        </Panel>
      </div>
    </div>
  );
}

export const mode = defineMode<RandomParams>({
  id: 'random',
  label: 'Random',
  description: 'Seeded generative melodies quantized to a scale — repeat a phrase or generate endlessly.',
  defaultParams: defaultRandomParams,
  normalizeParams: normalizeRandomParams,
  build: buildRandomPlayable,
  liveUpdate: 'boundary',
  Panel: RandomPanel,
});
