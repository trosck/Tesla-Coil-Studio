import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type MouseEvent } from 'react';
import { createPortal } from 'react-dom';
import type { AudioStatus } from '../../audio/engine';
import { Icon } from '../ui';
import { STATUS_HELP, STATUS_ORDER, STATUS_TEXT } from './audioStatus';
import './statusHelp.css';

const MARGIN = 16; // min distance from the viewport edges
const GAP = 8; // distance between trigger and tooltip
const HIDE_DELAY = 120; // ms, lets the pointer travel from the icon onto the tooltip

interface Pos {
  top: number;
  left: number;
  arrowX: number;
  maxHeight: number;
  above: boolean;
}

export interface StatusHelpProps {
  status: AudioStatus;
  error?: string | null;
}

/** Question-mark button inside the audio status pill; shows a fixed-position tooltip explaining every status. */
export function StatusHelp({ status, error }: StatusHelpProps) {
  const id = useId();
  const tipId = `${id}-tip`;
  const btnRef = useRef<HTMLButtonElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const hideTimer = useRef<number | undefined>(undefined);
  const lastPointer = useRef<string>('');
  const keepOnBlur = useRef(false);
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [pos, setPos] = useState<Pos | null>(null);

  const cancelHide = () => window.clearTimeout(hideTimer.current);
  const close = useCallback(() => {
    window.clearTimeout(hideTimer.current);
    setOpen(false);
    setPinned(false);
  }, []);
  const scheduleHide = () => {
    if (pinned) return;
    cancelHide();
    hideTimer.current = window.setTimeout(() => setOpen(false), HIDE_DELAY);
  };

  const place = useCallback(() => {
    const btn = btnRef.current;
    const tip = tipRef.current;
    if (!btn || !tip) return;
    const r = btn.getBoundingClientRect();
    const vw = document.documentElement.clientWidth;
    const vh = window.innerHeight;
    const w = tip.offsetWidth;
    const h = tip.scrollHeight;
    const cx = r.left + r.width / 2;
    const left = Math.max(MARGIN, Math.min(cx - w / 2, vw - MARGIN - w));
    const below = vh - r.bottom - GAP - MARGIN;
    const aboveSpace = r.top - GAP - MARGIN;
    const above = h > below && aboveSpace > below;
    const maxHeight = Math.max(120, above ? aboveSpace : below);
    const top = above ? Math.max(MARGIN, r.top - GAP - Math.min(h, maxHeight)) : r.bottom + GAP;
    const arrowX = Math.max(14, Math.min(cx - left, w - 14));
    setPos({ top, left, arrowX, maxHeight, above });
  }, []);

  // Position while open; follow scroll/resize.
  useLayoutEffect(() => {
    if (!open) return;
    place();
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [open, place, status, error]);

  // Esc closes; a tap/click outside closes.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close();
      }
    };
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || tipRef.current?.contains(t)) return;
      close();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDown);
    };
  }, [open, close]);

  useEffect(() => () => window.clearTimeout(hideTimer.current), []);

  const onClick = (e: MouseEvent<HTMLButtonElement>) => {
    cancelHide();
    const keyboard = e.detail === 0;
    if (!keyboard && lastPointer.current === 'mouse') {
      // Hover already shows it; a click pins it open (or unpins and closes).
      if (pinned) close();
      else {
        setPinned(true);
        setOpen(true);
      }
      return;
    }
    // Touch/pen tap or Enter/Space: toggle.
    if (open) close();
    else {
      setPinned(true);
      setOpen(true);
    }
  };

  const style: CSSProperties | undefined = pos
    ? ({ top: pos.top, left: pos.left, maxHeight: pos.maxHeight, '--status-help-arrow-x': `${pos.arrowX}px` } as CSSProperties)
    : undefined;

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className="status-help__btn"
        aria-label="What does the audio status mean?"
        aria-describedby={tipId}
        aria-expanded={open}
        aria-controls={tipId}
        onPointerDown={(e) => {
          lastPointer.current = e.pointerType;
        }}
        onPointerEnter={(e) => {
          if (e.pointerType !== 'mouse') return;
          cancelHide();
          setOpen(true);
        }}
        onPointerLeave={(e) => {
          if (e.pointerType === 'mouse') scheduleHide();
        }}
        onFocus={(e) => {
          keepOnBlur.current = false;
          // Keyboard focus opens it; focus from a mouse click or tap is handled by onClick.
          if (e.currentTarget.matches(':focus-visible')) setOpen(true);
        }}
        onBlur={() => {
          // Pressing inside the tooltip (e.g. to select text) moves focus away; keep it open then.
          if (keepOnBlur.current) keepOnBlur.current = false;
          else close();
        }}
        onClick={onClick}
      >
        <Icon name="help" size={16} />
      </button>
      {createPortal(
        <div
          ref={tipRef}
          id={tipId}
          role="tooltip"
          className="status-help"
          data-open={open && pos ? 'true' : 'false'}
          data-placement={pos?.above ? 'above' : 'below'}
          style={style}
          onPointerDown={() => {
            keepOnBlur.current = true;
          }}
          onPointerEnter={(e) => {
            if (e.pointerType === 'mouse' && open) cancelHide();
          }}
          onPointerLeave={(e) => {
            if (e.pointerType === 'mouse') scheduleHide();
          }}
        >
          <p className="status-help__title">Audio status</p>
          <p className="status-help__intro">The pill shows whether the browser can make sound right now.</p>
          <ul className="status-help__list">
            {STATUS_ORDER.map((s) => {
              const help = STATUS_HELP[s];
              const current = s === status;
              return (
                <li key={s} className={`status-help__row status-help__row--${s}${current ? ' is-current' : ''}`} aria-current={current ? 'true' : undefined}>
                  <span className={`status-led status-led--${s}`} aria-hidden="true" />
                  <div className="status-help__body">
                    <div className="status-help__label">
                      {STATUS_TEXT[s]}
                      {current && <span className="status-help__badge">current</span>}
                    </div>
                    <p className="status-help__text">
                      {help.meaning}
                      {help.action && <> <strong>{help.action}</strong></>}
                    </p>
                    {s === 'error' && error && <p className="status-help__error mono">{error}</p>}
                  </div>
                </li>
              );
            })}
          </ul>
          <p className="status-help__note">Sound goes to your system output device, e.g. the MH-M18 Bluetooth receiver.</p>
        </div>,
        document.body,
      )}
    </>
  );
}
