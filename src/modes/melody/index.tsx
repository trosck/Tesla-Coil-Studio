/**
 * Melody mode — on-screen / computer-keyboard piano with live play, a step
 * recorder and a mini piano-roll editor. The melody loops through the transport.
 */
import { useCallback, useEffect, useEffectEvent, useState } from 'react';
import { SCALES, SCALE_LIST, midiToNoteName, quantizeMidi, type ScaleId } from '../../audio/music';
import { Button, Icon, Panel, SegmentedControl, Select, Slider, Toggle, type SegmentOption } from '../../components/ui';
import { usePlayback, useStudio } from '../../studio/StudioContext';
import { defineMode, type ModePanelProps } from '../../studio/types';
import {
  BPM_MAX,
  BPM_MIN,
  DURATIONS,
  GATE_MAX,
  GATE_MIN,
  MAX_NOTES,
  MIDI_MAX,
  MIDI_MIN,
  OCTAVE_MAX,
  OCTAVE_MIN,
  buildMelody,
  defaultMelodyParams,
  durationBeats,
  durationForBeats,
  formatBeats,
  noteOffsets,
  normalizeMelodyParams,
  type DurationId,
  type MelodyNote,
  type MelodyParams,
} from './build';
import { KEY_TO_SEMITONE, insertNote, moveNote, octaveBaseMidi, removeNote, stepPitch, updateNote } from './edit';
import { Piano } from './Piano';
import { Timeline } from './Timeline';
import { useMonoVoice } from './useMonoVoice';
import './melody.css';

export type { MelodyNote, MelodyParams } from './build';

const DURATION_OPTIONS: readonly SegmentOption<DurationId>[] = DURATIONS.map((d) => ({ value: d.id, label: d.short, title: d.label }));
const SCALE_OPTIONS = SCALE_LIST.map((s) => ({ value: s.id, label: s.label }));
const HISTORY_MAX = 100;

function isTyping(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  if (!el || !el.tagName) return false;
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable;
}

function MelodyPanel({ params, setParams }: ModePanelProps<MelodyParams>) {
  const { engine } = useStudio();
  const voice = useMonoVoice(engine, params.gain);
  const playingIndex = usePlayback((s) => (s.isPlaying ? s.step : -1));

  const [recording, setRecording] = useState(false);
  const [selectedRaw, setSelected] = useState<number | null>(null);
  const [cursorRaw, setCursor] = useState(params.notes.length);
  const [history, setHistory] = useState<MelodyNote[][]>([]);
  const [lastMidi, setLastMidi] = useState(60);

  const notes = params.notes;
  const scale = SCALES[params.scale];
  // Params may change from outside (preset load) — keep editor indices valid.
  const selected = selectedRaw !== null && selectedRaw < notes.length ? selectedRaw : null;
  const cursor = Math.min(cursorRaw, notes.length);
  const selNote = selected !== null ? notes[selected]! : null;
  const startMidi = octaveBaseMidi(params.octave);
  const set = <K extends keyof MelodyParams>(key: K, value: MelodyParams[K]) => setParams((p) => ({ ...p, [key]: value }));

  const commit = (next: MelodyNote[]) => {
    setHistory((h) => [...h.slice(-(HISTORY_MAX - 1)), notes]);
    setParams((p) => ({ ...p, notes: next }));
  };

  const undo = () => {
    const prev = history[history.length - 1];
    if (!prev) return;
    setHistory((h) => h.slice(0, -1));
    setParams((p) => ({ ...p, notes: prev }));
  };

  const newBeats = durationBeats(params.duration);

  /** A key was played (already snapped). Edits the sequence when applicable. */
  const notePlayed = (midi: number) => {
    setLastMidi(midi);
    if (selected !== null) {
      commit(updateNote(notes, selected, { midi }));
    } else if (recording && notes.length < MAX_NOTES) {
      commit(insertNote(notes, cursor, { midi, beats: newBeats }));
      setCursor(cursor + 1);
    }
  };

  const snap = (midi: number) => (params.snapToScale ? quantizeMidi(midi, scale) : midi);

  const press = (id: string, rawMidi: number) => {
    const midi = Math.min(MIDI_MAX, Math.max(MIDI_MIN, snap(rawMidi)));
    if (voice.heldBy(id) === midi) return; // glissando over an out-of-scale key snapped to the same note
    voice.press(id, midi);
    notePlayed(midi);
  };

  const insertAtCursor = (midi: number | null) => {
    if (notes.length >= MAX_NOTES) return;
    commit(insertNote(notes, cursor, { midi, beats: newBeats }));
    setCursor(cursor + 1);
    setSelected(null);
  };

  const deleteNote = () => {
    const idx = selected ?? cursor - 1;
    if (idx < 0 || idx >= notes.length) return;
    commit(removeNote(notes, idx));
    setSelected(null);
    setCursor(idx);
  };

  const move = (dir: -1 | 1) => {
    if (selected === null) return;
    const j = selected + dir;
    if (j < 0 || j >= notes.length) return;
    commit(moveNote(notes, selected, dir));
    setSelected(j);
    setCursor(j + 1);
  };

  const transpose = (dir: -1 | 1) => {
    if (selected === null || selNote?.midi == null) return;
    const midi = stepPitch(selNote.midi, dir, params.snapToScale ? scale : null);
    commit(updateNote(notes, selected, { midi }));
    voice.press('preview', midi);
    window.setTimeout(() => voice.release('preview'), 220);
  };

  const pickDuration = (d: DurationId) => {
    setParams((p) => ({ ...p, duration: d }));
    if (selected !== null) commit(updateNote(notes, selected, { beats: durationBeats(d) }));
  };

  const selectNote = (i: number) => {
    if (selected === i) {
      setSelected(null);
      return;
    }
    setSelected(i);
    setCursor(i + 1);
    const n = notes[i];
    if (n?.midi != null) {
      setLastMidi(n.midi);
      const d = durationForBeats(n.beats);
      if (d) setParams((p) => ({ ...p, duration: d.id }));
    }
  };

  const shiftOctave = useCallback(
    (dir: -1 | 1) => setParams((p) => ({ ...p, octave: Math.min(OCTAVE_MAX, Math.max(OCTAVE_MIN, p.octave + dir)) })),
    [setParams],
  );

  // Computer keyboard: piano keys, Z/X octave, Delete, Esc, Ctrl/Cmd+Z.
  const onKeyDown = useEffectEvent((e: KeyboardEvent) => {
    if (isTyping(e.target)) return;
    if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ') {
      e.preventDefault();
      undo();
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const semi = KEY_TO_SEMITONE[e.code];
    if (semi !== undefined) {
      e.preventDefault();
      if (!e.repeat) press(`key${e.code}`, startMidi + semi);
      return;
    }
    if (e.repeat) return;
    if (e.code === 'KeyZ') shiftOctave(-1);
    else if (e.code === 'KeyX') shiftOctave(1);
    else if (e.code === 'Escape') setSelected(null);
    else if (e.code === 'Delete' || e.code === 'Backspace') {
      e.preventDefault();
      deleteNote();
    }
  });
  const onKeyUp = useEffectEvent((e: KeyboardEvent) => {
    if (KEY_TO_SEMITONE[e.code] !== undefined) voice.release(`key${e.code}`);
  });
  useEffect(() => {
    const down = (e: KeyboardEvent) => onKeyDown(e);
    const up = (e: KeyboardEvent) => onKeyUp(e);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  const playingMidi = playingIndex >= 0 ? (notes[playingIndex]?.midi ?? null) : null;
  const { total } = noteOffsets(notes);
  const seconds = (total * 60) / params.bpm;

  let editHint: string;
  if (selected !== null) editHint = `Editing note ${selected + 1}: play a key to replace its pitch, pick a duration to change its length. Esc = deselect.`;
  else if (recording) editHint = `Recording: each key you play is inserted at the cursor (position ${cursor + 1}) as a ${DURATIONS.find((d) => d.id === params.duration)?.label.toLowerCase()} note.`;
  else editHint = 'Play freely, or turn on Record to write notes. Click a note in the timeline to edit it; click empty space to move the cursor.';

  return (
    <div className="mode-melody">
      <div className="mode-melody__settings">
        <Select label="Scale" value={params.scale} options={SCALE_OPTIONS} onChange={(v: ScaleId) => set('scale', v)} hint="Keys outside the scale are dimmed." />
        <div className="mode-melody__snap">
          <Toggle checked={params.snapToScale} onChange={(v) => set('snapToScale', v)} label="Snap to scale" />
        </div>
        <Slider label="Tempo" value={params.bpm} min={BPM_MIN} max={BPM_MAX} step={1} unit="BPM" onChange={(v) => set('bpm', v)} />
        <Slider
          label="Gate"
          value={params.gate}
          min={GATE_MIN}
          max={GATE_MAX}
          step={1}
          unit="%"
          onChange={(v) => set('gate', v)}
          hint={params.gate >= 100 ? 'Legato: repeated notes merge.' : 'Sounding part of each note; the rest is a short gap.'}
        />
        <Slider label="Level" value={Math.round(params.gain * 100)} min={0} max={100} step={1} unit="%" onChange={(v) => set('gain', v / 100)} />
      </div>

      <Panel
        className="mode-melody__keys"
        title="Keyboard"
        actions={
          <div className="mode-melody__octave" role="group" aria-label="Octave">
            <Button size="sm" onClick={() => shiftOctave(-1)} disabled={params.octave <= OCTAVE_MIN} title="Octave down (Z)" aria-label="Octave down">
              − Oct
            </Button>
            <span className="mode-melody__octave-value lcd-chip" aria-live="polite">
              {midiToNoteName(startMidi)}
            </span>
            <Button size="sm" onClick={() => shiftOctave(1)} disabled={params.octave >= OCTAVE_MAX} title="Octave up (X)" aria-label="Octave up">
              Oct +
            </Button>
          </div>
        }
      >
        <div className="mode-melody__toolbar">
          <div className="mode-melody__duration">
            <span className="mode-melody__label">Duration</span>
            <SegmentedControl aria-label="Note duration" value={params.duration} options={DURATION_OPTIONS} onChange={pickDuration} />
          </div>
          <div className="mode-melody__rec">
            <Button variant="danger" pressed={recording} icon={<Icon name="record" />} onClick={() => setRecording((r) => !r)} title="Record played keys into the sequence">
              {recording ? 'Recording' : 'Record'}
            </Button>
            <Button onClick={() => insertAtCursor(null)} title="Insert a rest at the cursor">
              Rest
            </Button>
            <Button onClick={() => insertAtCursor(lastMidi)} title={`Insert ${midiToNoteName(lastMidi)} at the cursor`}>
              Insert {midiToNoteName(lastMidi)}
            </Button>
          </div>
        </div>
        <Piano
          startMidi={startMidi}
          scale={scale}
          sounding={voice.sounding}
          playing={playingMidi}
          selected={selNote?.midi ?? null}
          onPress={(id, midi) => press(id, midi)}
          onRelease={voice.release}
        />
        <p className="mode-melody__tip">
          Computer keys: <kbd>A</kbd>–<kbd>&apos;</kbd> white keys, <kbd>W</kbd> <kbd>E</kbd> <kbd>T</kbd> <kbd>Y</kbd> <kbd>U</kbd> <kbd>O</kbd> <kbd>P</kbd> black keys,{' '}
          <kbd>Z</kbd>/<kbd>X</kbd> octave. Drag across keys for a glissando.
        </p>
      </Panel>

      <Panel
        className="mode-melody__editor"
        title="Sequence"
        actions={
          <span className="mode-melody__stats">
            {notes.length} notes · {parseFloat(total.toFixed(2))} beats · {seconds.toFixed(1)} s
          </span>
        }
      >
        <div className="mode-melody__edit-bar">
          <div className="mode-melody__inspector" aria-live="polite">
            {selNote ? (
              <>
                <span className="mode-melody__sel-index">#{selected! + 1}</span>
                <span className="mode-melody__sel-name">{selNote.midi === null ? 'Rest' : midiToNoteName(selNote.midi)}</span>
                <span className="mode-melody__sel-dur">{formatBeats(selNote.beats)}</span>
              </>
            ) : (
              <span className="mode-melody__sel-none">Cursor at {cursor + 1}</span>
            )}
          </div>
          <div className="mode-melody__edit-buttons">
            <Button size="sm" onClick={() => transpose(-1)} disabled={selNote?.midi == null} title="Pitch down" aria-label="Pitch down">
              Pitch −
            </Button>
            <Button size="sm" onClick={() => transpose(1)} disabled={selNote?.midi == null} title="Pitch up" aria-label="Pitch up">
              Pitch +
            </Button>
            <Button size="sm" onClick={() => move(-1)} disabled={selected === null || selected === 0} title="Move left" aria-label="Move note left">
              ◀ Move
            </Button>
            <Button size="sm" onClick={() => move(1)} disabled={selected === null || selected >= notes.length - 1} title="Move right" aria-label="Move note right">
              Move ▶
            </Button>
            <Button size="sm" onClick={deleteNote} disabled={selected === null && cursor === 0} title="Delete the selected note (or the one before the cursor) — Del / Backspace">
              Delete
            </Button>
            <Button size="sm" onClick={undo} disabled={history.length === 0} title="Undo (Ctrl/Cmd+Z)">
              Undo
            </Button>
            <Button
              size="sm"
              variant="danger"
              onClick={() => {
                commit([]);
                setSelected(null);
                setCursor(0);
              }}
              disabled={notes.length === 0}
            >
              Clear
            </Button>
          </div>
        </div>
        <Timeline notes={notes} selected={selected} cursor={cursor} playing={playingIndex} onSelect={selectNote} onCursor={(c) => { setCursor(c); setSelected(null); }} />
        <p className="mode-melody__tip">{editHint}</p>
      </Panel>
    </div>
  );
}

export const mode = defineMode<MelodyParams>({
  id: 'melody',
  label: 'Melody',
  description: 'Play the on-screen piano, record a melody step by step, edit it and loop it.',
  defaultParams: defaultMelodyParams,
  normalizeParams: normalizeMelodyParams,
  build: buildMelody,
  liveUpdate: 'boundary',
  Panel: MelodyPanel,
});
