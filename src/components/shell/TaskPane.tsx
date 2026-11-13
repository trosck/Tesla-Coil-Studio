import { useMemo, useRef, useSyncExternalStore, type KeyboardEvent } from 'react';
import { summarizePreset } from '../../modes/presets/summary';
import { BUILT_IN_PRESETS } from '../../presets/builtIn';
import { getPreset, getUserPresets, subscribePresets } from '../../presets/storage';
import { useStudio } from '../../studio/StudioContext';
import type { ModeId } from '../../studio/types';
import { openExport } from '../transport/exportStore';
import { openGuide } from './guideStore';
import { MODE_ICON, OrbGlyph, PLACE_ICON } from './icons';

export const panelId = (id: ModeId) => `panel-${id}`;
export const tabId = (id: ModeId) => `tab-${id}`;

/** Built-in preset count per mode ("presets" = all built-ins). */
function builtInCount(id: ModeId): number {
  return id === 'presets' ? BUILT_IN_PRESETS.length : BUILT_IN_PRESETS.filter((p) => p.mode === id).length;
}

/** XP task pane: Coil modes (the mode tabs), Details, Other places. */
export function TaskPane() {
  const { modes, activeModeId, setActiveMode, sourceModeId, activePlayable } = useStudio();
  const listRef = useRef<HTMLDivElement>(null);
  const counts = useMemo(() => new Map(modes.map((m) => [m.id, builtInCount(m.id)])), [modes]);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = modes.findIndex((m) => m.id === activeModeId);
    let next = -1;
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') next = (i + 1) % modes.length;
    else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') next = (i - 1 + modes.length) % modes.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = modes.length - 1;
    if (next < 0) return;
    e.preventDefault();
    setActiveMode(modes[next]!.id);
    listRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
  };

  return (
    <aside className="taskpane shell-pane" aria-label="Task pane">
      <section className="tp-group">
        <h2 className="tp-head" id="tp-modes">
          Coil modes
        </h2>
        <div ref={listRef} className="tp-body tp-list" role="tablist" aria-labelledby="tp-modes" aria-orientation="vertical" onKeyDown={onKeyDown}>
          {modes.map((m) => {
            const selected = m.id === activeModeId;
            const isSource = m.id === sourceModeId;
            const n = counts.get(m.id) ?? 0;
            return (
              <button
                key={m.id}
                id={tabId(m.id)}
                role="tab"
                type="button"
                aria-selected={selected}
                aria-controls={selected ? panelId(m.id) : undefined}
                tabIndex={selected ? 0 : -1}
                className="mode-btn"
                title={isSource && !selected ? 'PLAY / EXPORT use this mode' : undefined}
                onClick={() => setActiveMode(m.id)}
              >
                <span className={`orb orb--${m.id}`}>
                  <OrbGlyph d={MODE_ICON[m.id]} />
                </span>
                <span className="mode-btn__label">
                  {m.label}
                  {isSource && (
                    <span className="mode-btn__src">
                      <span aria-hidden="true"> ▶</span>
                      <span className="visually-hidden"> (PLAY / EXPORT use this mode)</span>
                    </span>
                  )}
                </span>
                <span className="mode-btn__count">
                  {n}
                  <span className="visually-hidden"> built-in preset{n === 1 ? '' : 's'}</span>
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="tp-group">
        <h2 className="tp-head">Details</h2>
        <div className="tp-body tp-details">
          <Details />
        </div>
      </section>

      <section className="tp-group">
        <h2 className="tp-head">Other places</h2>
        <div className="tp-body tp-list">
          <button type="button" className="mode-btn" onClick={openGuide} aria-haspopup="dialog">
            <span className="orb orb--place-guide">
              <OrbGlyph d={PLACE_ICON.guide} size={13} width={2.6} />
            </span>
            <span className="mode-btn__label">Setup guide</span>
          </button>
          <button type="button" className="mode-btn" onClick={openGuide} aria-haspopup="dialog" title="Pairing steps are in the setup guide">
            <span className="orb orb--midi">
              <OrbGlyph d={PLACE_ICON.bluetooth} size={13} />
            </span>
            <span className="mode-btn__label">Bluetooth pairing</span>
          </button>
          <button
            type="button"
            className="mode-btn"
            onClick={openExport}
            aria-haspopup="dialog"
            disabled={!activePlayable}
            title={activePlayable ? 'Render the current mode to a WAV file' : 'This mode has nothing to export yet'}
          >
            <span className="orb orb--presets">
              <OrbGlyph d={PLACE_ICON.folder} size={13} />
            </span>
            <span className="mode-btn__label">WAV exports</span>
          </button>
        </div>
      </section>
    </aside>
  );
}

/** Loaded preset (when it belongs to the open mode, or on All presets), else the open mode. */
function Details() {
  const { modes, activeModeId, sourceModeId, loadedPreset } = useStudio();
  // re-render when user presets change (rename / delete)
  useSyncExternalStore(subscribePresets, getUserPresets, getUserPresets);
  const labelOf = (id: ModeId) => modes.find((m) => m.id === id)?.label ?? id;
  const active = modes.find((m) => m.id === activeModeId) ?? modes[0]!;
  const preset = loadedPreset && (loadedPreset.mode === activeModeId || activeModeId === 'presets') ? getPreset(loadedPreset.id) : undefined;

  if (preset) {
    const chips = summarizePreset(preset);
    return (
      <>
        <b className="tp-details__name">{preset.name}</b>
        <span className="tp-details__meta">
          {labelOf(preset.mode)} preset · {preset.builtIn ? 'Built-in' : 'My preset'}
        </span>
        {preset.description && <span>{preset.description}</span>}
        {chips.length > 0 && (
          <ul className="tp-details__chips" aria-label="Settings">
            {chips.map((c) => (
              <li key={c} className="chip">
                {c}
              </li>
            ))}
          </ul>
        )}
        <span className="tp-details__meta">{sourceModeId === preset.mode ? 'Loaded · PLAY / EXPORT use it' : 'Loaded earlier'}</span>
      </>
    );
  }
  return (
    <>
      <b className="tp-details__name">{active.label}</b>
      <span className="tp-details__meta">Coil mode</span>
      <span>{active.description}</span>
      <span className="tp-details__meta">
        PLAY / EXPORT use: <b>{labelOf(sourceModeId)}</b>
      </span>
    </>
  );
}
