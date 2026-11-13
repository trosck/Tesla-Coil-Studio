import { openGuide } from './guideStore';
import { BoltIcon, CaptionButtons } from './icons';
import { useNowShowing } from './nowShowing';

/** Main window titlebar: "Tesla Coil Studio 2000 — <preset or mode>". Caption buttons are decor. */
export function TitleBar() {
  const { name } = useNowShowing();
  return (
    <div className="titlebar win__titlebar">
      <BoltIcon size={18} />
      <span className="win__title">Tesla Coil Studio 2000 — {name}</span>
      <CaptionButtons />
    </div>
  );
}

/** XP menu bar. Only Help / Setup guide… do something; the rest is non-interactive decor. */
export function MenuBar() {
  return (
    <div className="menu menubar">
      <span className="menubar__item menubar__item--inert" aria-hidden="true">
        File
      </span>
      <span className="menubar__item menubar__item--inert" aria-hidden="true">
        Edit
      </span>
      <span className="menubar__item menubar__item--inert" aria-hidden="true">
        View
      </span>
      <span className="menubar__item menubar__item--inert" aria-hidden="true">
        Coil
      </span>
      <button type="button" className="menubar__item" onClick={openGuide} aria-haspopup="dialog" title="Open the setup guide">
        Help
      </button>
      <button type="button" className="menubar__item menubar__item--end" onClick={openGuide} aria-haspopup="dialog">
        Setup guide…
      </button>
    </div>
  );
}
