import { useEffect, useRef, type CSSProperties, type MouseEvent } from 'react';
import { midiToNoteName } from '../../audio/music';
import { formatBeats, noteOffsets, type MelodyNote } from './build';
import { isBlackKey } from './edit';

export interface TimelineProps {
  notes: readonly MelodyNote[];
  selected: number | null;
  /** Insertion point 0..notes.length. */
  cursor: number;
  /** Index of the note being played by the transport (-1 = none). */
  playing: number;
  onSelect: (index: number) => void;
  onCursor: (pos: number) => void;
}

const PX_PER_BEAT = 56;
const ROLL_H = 168;
const REST_LANE = 22;
const MIN_ROWS = 13;

/** Mini piano roll: pitch (vertical) vs. time (horizontal), rests on a bottom lane. */
export function Timeline({ notes, selected, cursor, playing, onSelect, onCursor }: TimelineProps) {
  const scroller = useRef<HTMLDivElement>(null);
  const { starts, total } = noteOffsets(notes);
  const pitched = notes.filter((x) => x.midi !== null).map((x) => x.midi!);
  let lo = pitched.length ? Math.min(...pitched) - 1 : 59;
  let hi = pitched.length ? Math.max(...pitched) + 1 : 72;
  if (hi - lo + 1 < MIN_ROWS) {
    const pad = MIN_ROWS - (hi - lo + 1);
    lo -= Math.floor(pad / 2);
    hi += Math.ceil(pad / 2);
  }
  const rows = hi - lo + 1;
  const rowH = ROLL_H / rows;
  const widthBeats = Math.max(total + 4, 16);
  const cursorBeat = cursor >= notes.length ? total : (starts[cursor] ?? 0);

  // Keep the playing note (or the cursor while editing) in view.
  const focusBeat = playing >= 0 ? (starts[playing] ?? 0) : cursorBeat;
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const x = focusBeat * PX_PER_BEAT;
    if (x < el.scrollLeft + 24 || x > el.scrollLeft + el.clientWidth - 48) {
      el.scrollTo({ left: Math.max(0, x - el.clientWidth / 3), behavior: 'smooth' });
    }
  }, [focusBeat]);

  const onBackground = (e: MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const beat = (e.clientX - rect.left) / PX_PER_BEAT;
    // nearest note boundary
    let best = notes.length;
    let bestDist = Math.abs(total - beat);
    starts.forEach((s, i) => {
      const d = Math.abs(s - beat);
      if (d < bestDist) {
        best = i;
        bestDist = d;
      }
    });
    onCursor(best);
  };

  const rowsBg: string[] = [];
  for (let m = hi; m >= lo; m--) {
    const top = (hi - m) * rowH;
    const color = isBlackKey(m) ? 'var(--mode-melody-row-dark)' : 'transparent';
    rowsBg.push(`${color} ${top}px ${top + rowH}px`);
  }
  const style = {
    '--ppb': `${PX_PER_BEAT}px`,
    '--roll-h': `${ROLL_H}px`,
    '--rest-h': `${REST_LANE}px`,
    width: `${widthBeats * PX_PER_BEAT}px`,
    backgroundImage: `repeating-linear-gradient(90deg, var(--mode-melody-bar) 0 1px, transparent 1px calc(var(--ppb) * 4)), repeating-linear-gradient(90deg, var(--mode-melody-beat) 0 1px, transparent 1px var(--ppb)), linear-gradient(180deg, ${rowsBg.join(', ')}, var(--mode-melody-rest-lane) ${ROLL_H}px)`,
  } as CSSProperties;

  return (
    <div className="mode-melody-roll" ref={scroller}>
      <div className="mode-melody-roll__canvas" style={style} onClick={onBackground}>
        <div className="mode-melody-roll__axis" aria-hidden="true">
          {[hi, lo].map((m) => (
            <span key={m} style={{ top: `${(hi - m) * rowH}px` }}>
              {midiToNoteName(m)}
            </span>
          ))}
        </div>
        {notes.map((note, i) => {
          const isRest = note.midi === null;
          const top = isRest ? ROLL_H + 3 : (hi - note.midi!) * rowH;
          const h = isRest ? REST_LANE - 6 : Math.max(rowH, 6);
          const cls = [
            'mode-melody-roll__note',
            isRest && 'mode-melody-roll__note--rest',
            selected === i && 'is-selected',
            playing === i && 'is-playing',
          ]
            .filter(Boolean)
            .join(' ');
          const name = isRest ? 'Rest' : midiToNoteName(note.midi!);
          return (
            <button
              key={i}
              type="button"
              className={cls}
              style={{ left: `${starts[i]! * PX_PER_BEAT + 1}px`, width: `${Math.max(6, note.beats * PX_PER_BEAT - 2)}px`, top: `${top}px`, height: `${h}px` }}
              aria-pressed={selected === i}
              aria-label={`Note ${i + 1}: ${name}, ${formatBeats(note.beats)}`}
              title={`${i + 1}. ${name} · ${formatBeats(note.beats)}`}
              onClick={(e) => {
                e.stopPropagation();
                onSelect(i);
              }}
            >
              {note.beats * PX_PER_BEAT >= 30 && <span>{isRest ? 'rest' : name}</span>}
            </button>
          );
        })}
        <div className="mode-melody-roll__cursor" style={{ left: `${cursorBeat * PX_PER_BEAT}px` }} aria-hidden="true" />
        {notes.length === 0 && <div className="mode-melody-roll__empty">Empty — turn on Record and play the keyboard, or press Rest / Insert.</div>}
      </div>
    </div>
  );
}
