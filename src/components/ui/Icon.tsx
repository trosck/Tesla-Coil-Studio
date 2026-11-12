/** Minimal inline SVG icon set (stroke = currentColor). */
export type IconName = 'play' | 'pause' | 'stop' | 'loop' | 'record' | 'download' | 'bolt' | 'speaker' | 'close' | 'chevron';

const paths: Record<IconName, string> = {
  play: 'M7 4.5v15l12-7.5z',
  pause: 'M7 4h4v16H7zM13 4h4v16h-4z',
  stop: 'M6 6h12v12H6z',
  loop: 'M17 2l4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 0 1-3 3H3',
  record: 'M12 5a7 7 0 1 0 0 14a7 7 0 1 0 0-14z',
  download: 'M12 3v12M7 10l5 5 5-5M4 21h16',
  bolt: 'M13 2L4 14h7l-1 8 9-12h-7z',
  speaker: 'M4 9v6h4l5 4V5L8 9zM16 8.5a5 5 0 0 1 0 7M19 5.5a9 9 0 0 1 0 13',
  close: 'M6 6l12 12M18 6L6 18',
  chevron: 'M6 9l6 6 6-6',
};

const filled: Partial<Record<IconName, boolean>> = { play: true, pause: true, stop: true, record: true, bolt: true };

export function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  const fill = filled[name];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill={fill ? 'currentColor' : 'none'}
      stroke={fill ? 'none' : 'currentColor'}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={paths[name]} />
    </svg>
  );
}
