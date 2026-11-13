/**
 * Shell artwork: per-mode orb glyphs (stroke paths, 24x24) and the small
 * pixel-art icons of the Y2K desktop. Pixel colours come from the .px-*
 * classes in shell.css (mapped to tokens), never from literals here.
 */
import type { ModeId } from '../../studio/types';

export const MODE_ICON: Record<ModeId, string> = {
  presets: 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z',
  ramp: 'M3 19 21 5M14 5h7v7',
  pulse: 'M2 17h4V7h4v10h4V7h4v10h4',
  siren: 'M2 12c2.5-6 5-6 7.5 0s5 6 7.5 0 3.5-4 5-2',
  random: 'M3 17l4-8 3 5 4-10 3 9 4-4',
  melody: 'M9 18V5l11-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM20 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0z',
  sequencer: 'M4 4h4v4H4zM10 4h4v4h-4zM16 4h4v4h-4zM4 10h4v4H4zM16 10h4v4h-4zM10 16h4v4h-4zM4 16h4v4H4z',
  midi: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM8 12h.01M16 12h.01M9.5 8.5h.01M14.5 8.5h.01M12 7h.01M10 17h4',
  frequency: 'M2 12c2-6 4-6 6 0s4 6 6 0 4-6 6 0',
};

export const PLACE_ICON = {
  guide: 'M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14M12 17.5v.01',
  bluetooth: 'm7 7 10 10-5 5V2l5 5L7 17',
  folder: 'M3 7h6l2 2h10v10H3z',
} as const;

/** Stroke glyph inside an .orb. */
export function OrbGlyph({ d, size = 14, width = 2.4 }: { d: string; size?: number; width?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" className="orb-glyph" style={{ strokeWidth: width }}>
      <path d={d} />
    </svg>
  );
}

export function BoltIcon({ size = 18, className }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" className={['bolt-icon', className].filter(Boolean).join(' ')}>
      <path d="M13 2 4 14h7l-1 8 9-12h-7z" />
    </svg>
  );
}

const PX = { viewBox: '0 0 16 16', 'aria-hidden': true, className: 'px-icon' } as const;

export function PxComputer({ size = 48 }: { size?: number }) {
  return (
    <svg {...PX} width={size} height={size}>
      <rect className="px-light" x="2" y="2" width="12" height="9" />
      <rect className="px-white" x="2" y="2" width="12" height="1" />
      <rect className="px-screen" x="3" y="3" width="10" height="7" />
      <path className="px-glow" d="M9 3.5 6 7h2l-1 2.5L10 6H8z" />
      <rect className="px-mid" x="6" y="11" width="4" height="1" />
      <rect className="px-light" x="1" y="12" width="14" height="3" />
      <rect className="px-white" x="1" y="12" width="14" height="1" />
      <rect className="px-led" x="2" y="13" width="2" height="1" />
    </svg>
  );
}

export function PxTextFile({ size = 48 }: { size?: number }) {
  return (
    <svg {...PX} width={size} height={size}>
      <rect className="px-white" x="3" y="1" width="10" height="14" />
      <rect className="px-blue" x="3" y="1" width="10" height="3" />
      <rect className="px-pale" x="4" y="2" width="6" height="1" />
      <rect className="px-mid" x="4" y="6" width="8" height="1" />
      <rect className="px-mid" x="4" y="8" width="7" height="1" />
      <rect className="px-mid" x="4" y="10" width="8" height="1" />
      <rect className="px-mid" x="4" y="12" width="5" height="1" />
      <rect className="px-dark" x="2" y="1" width="1" height="14" />
      <rect className="px-dark" x="13" y="1" width="1" height="14" />
      <rect className="px-dark" x="3" y="15" width="10" height="1" />
    </svg>
  );
}

export function PxWavFolder({ size = 48 }: { size?: number }) {
  return (
    <svg {...PX} width={size} height={size}>
      <rect className="px-folder-tab" x="1" y="3" width="6" height="2" />
      <rect className="px-folder" x="1" y="4" width="14" height="10" />
      <rect className="px-folder-hi" x="1" y="6" width="14" height="1" />
      <rect className="px-folder-tab" x="1" y="13" width="14" height="1" />
      <rect className="px-blue" x="4" y="8" width="2" height="4" />
      <rect className="px-blue" x="7" y="9" width="2" height="3" />
      <rect className="px-blue" x="10" y="7" width="2" height="5" />
    </svg>
  );
}

export function PxRecycleBin({ size = 48 }: { size?: number }) {
  return (
    <svg {...PX} width={size} height={size}>
      <rect className="px-mid" x="3" y="2" width="10" height="2" />
      <rect className="px-dark" x="6" y="1" width="4" height="1" />
      <rect className="px-light" x="4" y="4" width="8" height="11" />
      <rect className="px-mid" x="5" y="5" width="1" height="9" />
      <rect className="px-mid" x="7" y="5" width="1" height="9" />
      <rect className="px-mid" x="9" y="5" width="1" height="9" />
      <rect className="px-mid" x="11" y="5" width="1" height="9" />
      <rect className="px-white" x="4" y="4" width="8" height="1" />
    </svg>
  );
}

export function PxFolder({ size = 20, arrow }: { size?: number; arrow?: 'up' | 'down' }) {
  return (
    <svg {...PX} width={size} height={size}>
      <rect className="px-folder" x="1" y="4" width="14" height="10" />
      <rect className="px-folder-tab" x="1" y="3" width="6" height="2" />
      {arrow === 'up' && <path className="px-arrow px-arrow--up" d="M8 13V7M5 10l3-3 3 3" />}
      {arrow === 'down' && <path className="px-arrow px-arrow--down" d="M8 7v6M5 10l3 3 3-3" />}
    </svg>
  );
}

export function PxSave({ size = 20 }: { size?: number }) {
  return (
    <svg {...PX} width={size} height={size}>
      <rect className="px-navy" x="2" y="2" width="12" height="12" />
      <rect className="px-white" x="4" y="2" width="8" height="5" />
      <rect className="px-navy" x="9" y="3" width="2" height="3" />
      <rect className="px-pale" x="4" y="9" width="8" height="5" />
    </svg>
  );
}

export function PxMonitor({ size = 20 }: { size?: number }) {
  return (
    <svg {...PX} width={size} height={size}>
      <rect className="px-light" x="2" y="2" width="12" height="9" />
      <rect className="px-screen" x="3" y="3" width="10" height="7" />
      <rect className="px-led" x="5" y="6" width="6" height="1" />
      <rect className="px-light" x="1" y="12" width="14" height="3" />
    </svg>
  );
}

export function WarningIcon({ size = 38 }: { size?: number }) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden="true" className="warn-icon">
      <path className="warn-icon__body" d="M16 3 30 28H2z" />
      <path className="warn-icon__mark" d="M16 12v8M16 24v.5" />
    </svg>
  );
}

export function InfoIcon({ size = 22 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" className="info-icon">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 7v.5M12 10.5V17" />
    </svg>
  );
}

/** Decorative XP caption buttons (minimise / maximise / close). */
export function CaptionButtons({ closeOnly }: { closeOnly?: boolean }) {
  return (
    <div className="caption-btns" aria-hidden="true">
      {!closeOnly && (
        <>
          <span className="wbtn">
            <span className="caption-btns__min" />
          </span>
          <span className="wbtn">
            <span className="caption-btns__max" />
          </span>
        </>
      )}
      <span className="wbtn x">
        <CloseGlyph />
      </span>
    </div>
  );
}

export function CloseGlyph() {
  return (
    <svg viewBox="0 0 10 10" width="10" height="10" aria-hidden="true" className="close-glyph">
      <path d="M1 1l8 8M9 1 1 9" />
    </svg>
  );
}
