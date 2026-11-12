import { useEffect, useRef, type KeyboardEvent } from 'react';
import { ModeHost } from '../../studio/ModeHost';
import { useStudio } from '../../studio/StudioContext';

/** Accessible tablist of all registered modes + the active mode panel. */
export function ModeTabs() {
  const { modes, activeModeId, setActiveMode, sourceModeId } = useStudio();
  const listRef = useRef<HTMLDivElement>(null);
  const active = modes.find((m) => m.id === activeModeId) ?? modes[0]!;

  // Keep the selected tab visible in the horizontally scrolling tab strip (mobile).
  useEffect(() => {
    const list = listRef.current;
    const tab = list?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (!list || !tab) return;
    const left = tab.offsetLeft - list.offsetLeft;
    if (left < list.scrollLeft || left + tab.offsetWidth > list.scrollLeft + list.clientWidth) {
      list.scrollLeft = Math.max(0, left - (list.clientWidth - tab.offsetWidth) / 2);
    }
  }, [activeModeId]);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = modes.findIndex((m) => m.id === activeModeId);
    let next = -1;
    if (e.key === 'ArrowRight') next = (i + 1) % modes.length;
    else if (e.key === 'ArrowLeft') next = (i - 1 + modes.length) % modes.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = modes.length - 1;
    if (next < 0) return;
    e.preventDefault();
    setActiveMode(modes[next]!.id);
    listRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
  };

  return (
    <section className="modes">
      <div ref={listRef} className="modes__tabs" role="tablist" aria-label="Modes" onKeyDown={onKeyDown}>
        {modes.map((m) => {
          const selected = m.id === activeModeId;
          return (
            <button
              key={m.id}
              id={`tab-${m.id}`}
              role="tab"
              type="button"
              aria-selected={selected}
              aria-controls={`panel-${m.id}`}
              tabIndex={selected ? 0 : -1}
              className="modes__tab"
              data-source={m.id === sourceModeId || undefined}
              title={m.id === sourceModeId && !selected ? 'PLAY / EXPORT use this mode' : undefined}
              onClick={() => setActiveMode(m.id)}
            >
              {m.label}
            </button>
          );
        })}
      </div>
      <div id={`panel-${active.id}`} role="tabpanel" aria-labelledby={`tab-${active.id}`} className="modes__panel" key={active.id}>
        <p className="modes__desc">{active.description}</p>
        <ModeHost mode={active} />
      </div>
    </section>
  );
}
