/**
 * MIDI mode: import a .mid file, pick tracks, reduce polyphony to a single
 * melody line and play it on the coil. The file lives in session memory
 * (session.ts) and is published with setPlayable; conversion settings are
 * persisted params.
 */
import { useEffect, useState, type DragEvent } from 'react';
import { midiToNoteName } from '../../audio/music';
import { Button, Field, NumberField, Panel, SegmentedControl, Slider, Toggle } from '../../components/ui';
import { useStore } from '../../lib/useStore';
import { usePlayback, useStudio } from '../../studio/StudioContext';
import { defineMode, type ModePanelProps } from '../../studio/types';
import {
  BPM_MAX,
  BPM_MIN,
  FREQ_LIMIT_MAX,
  FREQ_LIMIT_MIN,
  SPEED_MAX,
  SPEED_MIN,
  TRANSPOSE_LIMIT,
  bestOctaveShift,
  defaultMidiParams,
  midiRange,
  normalizeMidiParams,
} from './convert';
import { DEMO_FILE_NAME, buildDemoBuffer } from './demo';
import { isMidiFileName } from './loadMidi';
import { PianoRoll, type RollView } from './PianoRoll';
import { clearMidi, convertCached, loadMidiData, midiSession, setSelectedTracks } from './session';
import type { DurationMode, FitMode, GainMode, MidiParams, MidiSummary, ReduceStrategy, TempoMode } from './types';
import './midi.css';

const STRATEGIES: { value: ReduceStrategy; label: string; title: string; badge?: string }[] = [
  { value: 'highest', label: 'Highest', title: 'Highest sounding note wins (usually the melody)', badge: 'melody' },
  { value: 'lowest', label: 'Lowest', title: 'Lowest sounding note wins (bass line)' },
  { value: 'recent', label: 'Most recent', title: 'Last-note priority: the newest note wins' },
  { value: 'loudest', label: 'Loudest', title: 'Highest velocity wins' },
];

function fmtDuration(s: number): string {
  if (!Number.isFinite(s) || s <= 0) return '0:00';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s - m * 60);
  return `${m}:${String(sec).padStart(2, '0')}`;
}

function rangeLabel(lo: number | null, hi: number | null): string {
  if (lo === null || hi === null) return '—';
  return lo === hi ? midiToNoteName(lo) : `${midiToNoteName(lo)}–${midiToNoteName(hi)}`;
}

/* ---------------------------------------------------------------- loader */

function Loader({ onLoaded }: { onLoaded: (s: MidiSummary) => void }) {
  const session = useStore(midiSession);
  const [dragging, setDragging] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const load = async (buffer: ArrayBuffer, name: string) => {
    setLocalError(null);
    const ok = await loadMidiData(buffer, name);
    const s = midiSession.getSnapshot().summary;
    if (ok && s) onLoaded(s);
  };

  const loadFile = async (file: File | undefined) => {
    if (!file) return;
    if (!isMidiFileName(file.name) && file.type !== 'audio/midi' && file.type !== 'audio/x-midi') {
      setLocalError(`"${file.name}" is not a .mid / .midi file.`);
      return;
    }
    try {
      await load(await file.arrayBuffer(), file.name);
    } catch {
      setLocalError('Could not read the file.');
    }
  };

  const onDrop = (e: DragEvent<HTMLElement>) => {
    e.preventDefault();
    setDragging(false);
    void loadFile(e.dataTransfer.files[0]);
  };

  const s = session.summary;
  const error = localError ?? session.error;
  return (
    <Panel
      title="MIDI file"
      className="mode-midi__loader"
      actions={
        <>
          <Button size="sm" onClick={() => void load(buildDemoBuffer(), DEMO_FILE_NAME)} disabled={session.status === 'parsing'}>
            Load demo
          </Button>
          {s && (
            <Button size="sm" variant="ghost" onClick={clearMidi}>
              Clear
            </Button>
          )}
        </>
      }
    >
      <label
        className="mode-midi__drop"
        data-dragging={dragging || undefined}
        onDragEnter={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'copy';
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
        }}
        onDrop={onDrop}
      >
        <input
          type="file"
          accept=".mid,.midi,.kar,audio/midi,audio/x-midi"
          className="mode-midi__file"
          onChange={(e) => {
            void loadFile(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
        <span className="mode-midi__drop-title">{session.status === 'parsing' ? 'Parsing…' : 'Drop a .mid file here'}</span>
        <span className="mode-midi__drop-sub">or click to browse — parsed locally, nothing is uploaded</span>
      </label>
      {error && (
        <p className="mode-midi__error" role="alert">
          {error}
        </p>
      )}
      {s && (
        <dl className="mode-midi__info">
          <div>
            <dt>File</dt>
            <dd title={session.fileName}>{s.name}</dd>
          </div>
          <div>
            <dt>Length</dt>
            <dd>{fmtDuration(s.duration)}</dd>
          </div>
          <div>
            <dt>Tempo</dt>
            <dd>
              {Math.round(s.bpm * 10) / 10} BPM
              {s.tempos.length > 1 && <span className="mode-midi__muted"> · {s.tempos.length - 1} change(s)</span>}
            </dd>
          </div>
          <div>
            <dt>Meter</dt>
            <dd>
              {s.timeSignature[0]}/{s.timeSignature[1]}
            </dd>
          </div>
          <div>
            <dt>Notes</dt>
            <dd>{s.totalNotes.toLocaleString()}</dd>
          </div>
          <div>
            <dt>Tracks</dt>
            <dd>{s.tracks.filter((t) => t.noteCount > 0).length}</dd>
          </div>
        </dl>
      )}
      {s && s.tempos.length > 1 && (
        <p className="mode-midi__muted mode-midi__tempos">
          Tempo map:{' '}
          {s.tempos
            .slice(0, 8)
            .map((t) => `${fmtDuration(t.time)} → ${Math.round(t.bpm)}`)
            .join(', ')}
          {s.tempos.length > 8 ? ', …' : ''} (note times already follow the tempo map)
        </p>
      )}
    </Panel>
  );
}

/* ---------------------------------------------------------------- tracks */

function Tracks({ summary, selected }: { summary: MidiSummary; selected: number[] }) {
  const tracks = summary.tracks.filter((t) => t.noteCount > 0);
  const hidden = summary.tracks.length - tracks.length;
  const sel = new Set(selected);
  const toggle = (i: number) => setSelectedTracks(sel.has(i) ? selected.filter((x) => x !== i) : [...selected, i]);
  return (
    <Panel
      title={`Tracks (${selected.length}/${tracks.length})`}
      actions={
        <>
          <Button size="sm" variant="ghost" onClick={() => setSelectedTracks(tracks.map((t) => t.index))}>
            All
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelectedTracks(tracks.filter((t) => !t.isPercussion).map((t) => t.index))}>
            Melodic
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelectedTracks([])}>
            None
          </Button>
        </>
      }
    >
      <ul className="mode-midi__tracks">
        {tracks.map((t) => {
          const on = sel.has(t.index);
          return (
            <li key={t.index}>
              <button type="button" role="checkbox" aria-checked={on} className="mode-midi__track" data-drums={t.isPercussion || undefined} onClick={() => toggle(t.index)}>
                <span className="mode-midi__check" aria-hidden="true" />
                <span className="mode-midi__track-main">
                  <span className="mode-midi__track-name">{t.name || `Track ${t.index + 1}`}</span>
                  <span className="mode-midi__track-inst">
                    {t.instrument}
                    {t.family && !t.isPercussion ? ` · ${t.family}` : ''} · ch {t.channel + 1}
                  </span>
                </span>
                <span className="mode-midi__track-meta">
                  {t.isPercussion && <span className="mode-midi__badge chip">drums</span>}
                  <span>{t.noteCount.toLocaleString()} notes</span>
                  <span className="mode-midi__muted">{rangeLabel(t.minMidi, t.maxMidi)}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {hidden > 0 && <p className="mode-midi__muted">{hidden} track(s) without notes hidden.</p>}
      {selected.some((i) => summary.tracks.find((t) => t.index === i)?.isPercussion) && (
        <p className="mode-midi__warn">Drum tracks are selected — their note numbers are drum sounds, not pitches.</p>
      )}
    </Panel>
  );
}

/* ---------------------------------------------------------------- panel */

function MIDIPanel({ params: p, setParams, setPlayable }: ModePanelProps<MidiParams>) {
  const { playPlayable, stop, engine } = useStudio();
  const session = useStore(midiSession);
  const [view, setView] = useState<RollView>('file');
  const isActive = usePlayback((s) => s.isPlaying || s.isPaused);
  const isPlaying = usePlayback((s) => s.isPlaying);

  const summary = session.summary;
  const result = summary ? convertCached(summary, session.selected, p) : null;
  const sequence = result?.sequence ?? null;

  useEffect(() => {
    setPlayable(sequence);
  }, [sequence, setPlayable]);

  const set = <K extends keyof MidiParams>(k: K, v: MidiParams[K]) => setParams((prev) => ({ ...prev, [k]: v }));
  const ours = !!sequence && isActive && engine.currentPlayable === sequence;

  const onLoaded = (s: MidiSummary) =>
    setParams((prev) => ({ ...prev, trimStart: 0, trimEnd: 0, targetBpm: Math.min(BPM_MAX, Math.max(BPM_MIN, Math.round(s.bpm))) }));

  const detected = summary?.bpm ?? 120;
  const [lo, hi] = midiRange(p.rangeMinHz, p.rangeMaxHz);
  const autoOctave = () => {
    if (!result) return;
    const shift = bestOctaveShift(result.preFitMidi, lo, hi);
    if (shift) set('transpose', Math.max(-TRANSPOSE_LIMIT, Math.min(TRANSPOSE_LIMIT, p.transpose + shift)));
  };
  const fileDur = summary?.duration ?? 0;
  const stats = result?.stats;

  return (
    <div className="mode-midi">
      <div className="mode-midi__top">
        <Loader onLoaded={onLoaded} />
        {summary && <Tracks summary={summary} selected={session.selected} />}
      </div>

      <Panel
        title="Piano roll"
        className="mode-midi__roll-panel"
        actions={
          <>
            <SegmentedControl<RollView>
              aria-label="Piano roll view"
              value={view}
              onChange={setView}
              options={[
                { value: 'file', label: 'Whole file' },
                { value: 'section', label: 'Section' },
              ]}
            />
            <Button
              size="sm"
              variant={ours && isPlaying ? 'secondary' : 'play'}
              disabled={!sequence}
              onClick={() => {
                if (ours && isPlaying) stop();
                else if (sequence) void playPlayable(sequence, { loop: false });
              }}
            >
              {ours && isPlaying ? 'Stop preview' : 'Preview'}
            </Button>
          </>
        }
      >
        <PianoRoll
          summary={summary}
          selected={session.selected}
          mono={result?.mono ?? []}
          window={result?.window ?? { start: 0, end: 0 }}
          speed={result?.speed ?? 1}
          sequence={sequence}
          view={view}
          onSelectSection={(a, b) =>
            setParams((prev) => ({ ...prev, trimStart: Math.round(a * 100) / 100, trimEnd: b >= fileDur - 0.01 ? 0 : Math.round(b * 100) / 100 }))
          }
        />
        <div className="mode-midi__legend">
          <span>
            <i className="mode-midi__swatch mode-midi__swatch--orig" /> original notes
          </span>
          <span>
            <i className="mode-midi__swatch mode-midi__swatch--mono" /> monophonic result (sounding pitch)
          </span>
          {summary && view === 'file' && <span className="mode-midi__muted">drag to select a section · double-click to clear</span>}
        </div>
        {!summary && <p className="mode-midi__empty">Load a MIDI file or the demo to see its notes.</p>}
        {summary && session.selected.length === 0 && <p className="mode-midi__empty">Select at least one track.</p>}
        {stats && (
          <dl className="mode-midi__stats" aria-live="polite">
            <div>
              <dt>Original notes</dt>
              <dd>{stats.originalNotes.toLocaleString()}</dd>
            </div>
            <div>
              <dt>Max polyphony</dt>
              <dd>{stats.maxPolyphony}</dd>
            </div>
            <div>
              <dt>Result notes</dt>
              <dd>{stats.resultNotes.toLocaleString()}</dd>
            </div>
            <div>
              <dt>Duration</dt>
              <dd>{fmtDuration(stats.duration)}</dd>
            </div>
            <div>
              <dt>Tempo</dt>
              <dd>{stats.bpm} BPM</dd>
            </div>
            {p.fitRange && (
              <div>
                <dt>Fitted</dt>
                <dd>{stats.fittedNotes}</dd>
              </div>
            )}
          </dl>
        )}
        <p className="mode-midi__muted">PLAY and EXPORT WAV in the transport use this converted melody.</p>
      </Panel>

      <div className="mode-midi__grid">
        <Panel title="Polyphony reduction">
          <Field label="Note priority">
            <SegmentedControl<ReduceStrategy> aria-label="Note priority" value={p.strategy} onChange={(v) => set('strategy', v)} options={STRATEGIES} />
          </Field>
          <Toggle checked={p.retrigger} onChange={(v) => set('retrigger', v)} label="Retrigger held notes (resume a still-held note when the winner ends)" />
          <Slider
            label="Minimum gap"
            value={p.minGapMs}
            min={0}
            max={100}
            step={1}
            unit="ms"
            onChange={(v) => set('minGapMs', v)}
            hint={p.minGapMs === 0 ? 'Touching notes play legato (repeated notes merge).' : 'Silence between notes so repeated notes articulate.'}
          />
          <Slider label="Minimum note length" value={p.minNoteMs} min={0} max={200} step={1} unit="ms" onChange={(v) => set('minNoteMs', v)} hint="Shorter notes and fragments are dropped." />
        </Panel>

        <Panel title="Tempo & section">
          <Field label="Tempo" aside={<span className="mode-midi__muted">detected {Math.round(detected * 10) / 10} BPM</span>}>
            <SegmentedControl<TempoMode>
              aria-label="Tempo mode"
              value={p.tempoMode}
              onChange={(v) => set('tempoMode', v)}
              options={[
                { value: 'speed', label: 'Speed %' },
                { value: 'bpm', label: 'Set BPM' },
              ]}
            />
          </Field>
          {p.tempoMode === 'speed' ? (
            <Slider label="Speed" value={p.speedPct} min={SPEED_MIN} max={SPEED_MAX} step={1} unit="%" scale="log" onChange={(v) => set('speedPct', v)} />
          ) : (
            <Slider label="Target BPM" value={p.targetBpm} min={BPM_MIN} max={BPM_MAX} step={1} unit="BPM" scale="log" onChange={(v) => set('targetBpm', v)} />
          )}
          <div className="mode-midi__row">
            <NumberField label="Start" value={p.trimStart} min={0} max={Math.max(0, fileDur)} step={0.1} precision={2} unit="s" onChange={(v) => set('trimStart', v)} />
            <NumberField label="End (0 = file end)" value={p.trimEnd} min={0} max={Math.max(0, fileDur)} step={0.1} precision={2} unit="s" onChange={(v) => set('trimEnd', v)} />
          </div>
          <div className="mode-midi__buttons">
            <Button size="sm" onClick={() => setParams((prev) => ({ ...prev, trimStart: 0, trimEnd: 0 }))} disabled={p.trimStart === 0 && p.trimEnd === 0}>
              Whole file
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setParams((prev) => ({ ...prev, tempoMode: 'speed', speedPct: 100 }))}>
              Original tempo
            </Button>
          </div>
        </Panel>

        <Panel title="Pitch">
          <Slider
            label="Transpose"
            value={p.transpose}
            min={-TRANSPOSE_LIMIT}
            max={TRANSPOSE_LIMIT}
            step={1}
            unit="st"
            onChange={(v) => set('transpose', Math.round(v))}
            hint={p.transpose ? `${p.transpose > 0 ? '+' : ''}${p.transpose} semitones` : 'Original pitch'}
          />
          <div className="mode-midi__buttons">
            <Button size="sm" onClick={() => set('transpose', Math.max(-TRANSPOSE_LIMIT, p.transpose - 12))}>
              −1 oct
            </Button>
            <Button size="sm" onClick={() => set('transpose', Math.min(TRANSPOSE_LIMIT, p.transpose + 12))}>
              +1 oct
            </Button>
            <Button size="sm" variant="ghost" onClick={() => set('transpose', 0)} disabled={p.transpose === 0}>
              Reset
            </Button>
            <Button size="sm" variant="ghost" onClick={autoOctave} disabled={!result?.mono.length} title="Shift by octaves so most notes fall inside the coil range below">
              Auto octave
            </Button>
          </div>
          <Toggle checked={p.fitRange} onChange={(v) => set('fitRange', v)} label="Fit to coil range" />
          <div className="mode-midi__row">
            <NumberField
              label="Min"
              value={p.rangeMinHz}
              min={FREQ_LIMIT_MIN}
              max={FREQ_LIMIT_MAX}
              step={1}
              unit="Hz"
              onChange={(v) => setParams((prev) => ({ ...prev, rangeMinHz: v, rangeMaxHz: Math.max(v, prev.rangeMaxHz) }))}
            />
            <NumberField
              label="Max"
              value={p.rangeMaxHz}
              min={FREQ_LIMIT_MIN}
              max={FREQ_LIMIT_MAX}
              step={1}
              unit="Hz"
              onChange={(v) => setParams((prev) => ({ ...prev, rangeMaxHz: v, rangeMinHz: Math.min(v, prev.rangeMinHz) }))}
            />
          </div>
          <Field label="Out-of-range notes" hint={`Range ${midiToNoteName(lo)}–${midiToNoteName(hi)}`}>
            <SegmentedControl<FitMode>
              aria-label="Out-of-range notes"
              value={p.fitMode}
              onChange={(v) => set('fitMode', v)}
              options={[
                { value: 'fold', label: 'Octave fold', title: 'Move out-of-range notes by whole octaves' },
                { value: 'clamp', label: 'Clamp', title: 'Pin out-of-range notes to the range edge' },
              ]}
            />
          </Field>
        </Panel>

        <Panel title="Notes & level">
          <Field label="Note length">
            <SegmentedControl<DurationMode>
              aria-label="Note length"
              value={p.durationMode}
              onChange={(v) => set('durationMode', v)}
              options={[
                { value: 'scale', label: 'Gate %' },
                { value: 'legato', label: 'Legato', title: 'Extend notes up to the next note (max 1 s into rests)' },
                { value: 'fixed', label: 'Fixed' },
              ]}
            />
          </Field>
          {p.durationMode === 'scale' && (
            <>
              <Slider label="Gate" value={p.durationPct} min={5} max={100} step={1} unit="%" onChange={(v) => set('durationPct', v)} hint="100% = as written, lower = staccato" />
              <div className="mode-midi__buttons">
                <Button size="sm" pressed={p.durationPct === 100} onClick={() => set('durationPct', 100)}>
                  Full
                </Button>
                <Button size="sm" pressed={p.durationPct === 80} onClick={() => set('durationPct', 80)}>
                  Normal
                </Button>
                <Button size="sm" pressed={p.durationPct === 40} onClick={() => set('durationPct', 40)}>
                  Staccato
                </Button>
              </div>
            </>
          )}
          {p.durationMode === 'fixed' && (
            <Slider label="Fixed length" value={p.fixedMs} min={5} max={2000} step={1} unit="ms" scale="log" onChange={(v) => set('fixedMs', v)} hint="Every note gets this length (cut by the next note)." />
          )}
          {p.durationMode === 'legato' && <p className="mode-midi__muted">Notes are held until the next note (minus the minimum gap).</p>}
          <Field label="Gain">
            <SegmentedControl<GainMode>
              aria-label="Gain"
              value={p.gainMode}
              onChange={(v) => set('gainMode', v)}
              options={[
                { value: 'velocity', label: 'From velocity' },
                { value: 'fixed', label: 'Fixed' },
              ]}
            />
          </Field>
          <Slider label="Level" value={Math.round(p.level * 100)} min={0} max={100} step={1} unit="%" onChange={(v) => set('level', v / 100)} />
          <div className="mode-midi__buttons">
            <Button size="sm" variant="ghost" onClick={() => setParams(defaultMidiParams)}>
              Reset all settings
            </Button>
          </div>
        </Panel>
      </div>
    </div>
  );
}

export const mode = defineMode<MidiParams>({
  id: 'midi',
  label: 'MIDI',
  description: 'Load a .mid file, pick tracks and play its melody line monophonically.',
  defaultParams: defaultMidiParams,
  normalizeParams: normalizeMidiParams,
  // No build(): the file data is not in params; the panel publishes via setPlayable.
  liveUpdate: 'immediate',
  Panel: MIDIPanel,
});
