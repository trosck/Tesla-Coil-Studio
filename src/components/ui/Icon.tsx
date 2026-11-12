/** Minimal inline SVG icon set (stroke = currentColor). */
export type IconName =
  | 'play'
  | 'pause'
  | 'stop'
  | 'loop'
  | 'record'
  | 'download'
  | 'upload'
  | 'bolt'
  | 'speaker'
  | 'close'
  | 'chevron'
  | 'help'
  | 'edit'
  | 'copy'
  | 'trash'
  | 'save'
  | 'search';

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
  upload: 'M12 15V3M7 8l5-5 5 5M4 21h16',
  help: 'M12 22a10 10 0 1 0 0-20a10 10 0 1 0 0 20zM9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01',
  edit: 'M4 20h4L19 9l-4-4L4 16zM14 6l4 4',
  copy: 'M9 9h11v11H9zM5 15H4V4h11v1',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  save: 'M5 3h11l3 3v15H5zM8 3v5h7V3M8 21v-7h8v7',
  search: 'M11 18a7 7 0 1 0 0-14a7 7 0 1 0 0 14zM21 21l-5-5',
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
