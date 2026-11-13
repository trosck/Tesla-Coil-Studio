import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import { isInScale, midiToNoteName, type Scale } from '../../audio/music';
import { SEMITONE_TO_KEY_LABEL, isBlackKey } from './edit';

export interface PianoProps {
  /** MIDI number of the lowest key (a C). */
  startMidi: number;
  scale: Scale;
  /** Live note (cyan). */
  sounding: number | null;
  /** Note currently played by the sequence (purple). */
  playing: number | null;
  /** Pitch of the note selected in the editor (outlined). */
  selected: number | null;
  /** `glide` = reached by dragging across keys (not a fresh press). */
  onPress: (id: string, midi: number, glide: boolean) => void;
  onRelease: (id: string) => void;
}

/** Visible octaves for a keyboard width (min ~34 px per white key). */
function octavesForWidth(w: number): number {
  if (w < 520) return 1;
  if (w < 980) return 2;
  return 3;
}

function midiAt(x: number, y: number): number | null {
  const el = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-midi]');
  if (!el) return null;
  const m = Number(el.dataset.midi);
  return Number.isFinite(m) ? m : null;
}

/** Monophonic on-screen piano. Mouse + touch (pointer events), drag for glissando. */
export function Piano({ startMidi, scale, sounding, playing, selected, onPress, onRelease }: PianoProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [octaves, setOctaves] = useState(2);
  const pointerNote = useRef(new Map<number, number>());

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      if (entry) setOctaves(octavesForWidth(entry.contentRect.width));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const keys: number[] = [];
  for (let m = startMidi; m <= startMidi + octaves * 12; m++) keys.push(m);
  const whites = keys.filter((m) => !isBlackKey(m));
  const whiteCount = whites.length;

  const down = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const midi = midiAt(e.clientX, e.clientY);
    if (midi === null) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    pointerNote.current.set(e.pointerId, midi);
    onPress(`ptr${e.pointerId}`, midi, false);
  };
  const move = (e: PointerEvent<HTMLDivElement>) => {
    const prev = pointerNote.current.get(e.pointerId);
    if (prev === undefined) return;
    const midi = midiAt(e.clientX, e.clientY);
    if (midi === null || midi === prev) return;
    pointerNote.current.set(e.pointerId, midi);
    onPress(`ptr${e.pointerId}`, midi, true);
  };
  const up = (e: PointerEvent<HTMLDivElement>) => {
    if (!pointerNote.current.has(e.pointerId)) return;
    pointerNote.current.delete(e.pointerId);
    onRelease(`ptr${e.pointerId}`);
  };

  const keyClass = (m: number) =>
    [
      isBlackKey(m) ? 'mode-melody-key mode-melody-key--black' : 'mode-melody-key mode-melody-key--white',
      !isInScale(m, scale) && 'is-out',
      sounding === m && 'is-live',
      playing === m && 'is-playing',
      selected === m && 'is-selected',
    ]
      .filter(Boolean)
      .join(' ');

  const keyHint = (m: number) => SEMITONE_TO_KEY_LABEL[m - startMidi];

  return (
    <div
      ref={ref}
      className="mode-melody-piano chrome"
      role="group"
      aria-label={`Piano keyboard ${midiToNoteName(startMidi)} to ${midiToNoteName(startMidi + octaves * 12)}`}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      onLostPointerCapture={up}
      onContextMenu={(e) => e.preventDefault()}
    >
      {whites.map((m) => (
        <div key={m} data-midi={m} className={keyClass(m)} aria-label={midiToNoteName(m)}>
          {keyHint(m) && <span className="mode-melody-key__hint">{keyHint(m)}</span>}
          <span className={m % 12 === 0 ? 'mode-melody-key__name mode-melody-key__name--c' : 'mode-melody-key__name'}>{midiToNoteName(m)}</span>
        </div>
      ))}
      {keys.filter(isBlackKey).map((m) => {
        const whitesBefore = whites.filter((w) => w < m).length;
        const style = { '--xf': whitesBefore / whiteCount, '--wf': 0.62 / whiteCount } as CSSProperties;
        return (
          <div key={m} data-midi={m} className={keyClass(m)} style={style} aria-label={midiToNoteName(m)}>
            {keyHint(m) && <span className="mode-melody-key__hint">{keyHint(m)}</span>}
          </div>
        );
      })}
    </div>
  );
}
