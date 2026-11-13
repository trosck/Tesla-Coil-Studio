/**
 * Presets mode: the preset library (built-ins + the user's own presets).
 *
 * - ▶ Play  = load the preset into its mode and start playing, staying here
 *             (audition several quickly).
 * - Select  = click a file card's head: load it as the current sound
 *             (PLAY / EXPORT source) without playing or leaving this page.
 * - Edit    = load the preset into its mode and open its editor. Built-ins are
 *             copied, never mutated; save changes as a new preset.
 * - User presets: rename, duplicate, delete, export/import as JSON.
 *
 * This mode has providesPlayable: false, so opening it never changes what the
 * transport plays.
 */
import { useId, useMemo, useRef, useState, useSyncExternalStore, type SubmitEvent } from 'react';
import { openGuide } from '../../components/shell/guideStore';
import { Button, Icon, SegmentedControl, Select } from '../../components/ui';
import { BUILT_IN_PRESETS, FEATURED_PRESET_IDS } from '../../presets/builtIn';
import { exportUserPresets, importPresetFile, type PresetFileMessage } from '../../presets/fileActions';
import { MAX_DESCRIPTION_LENGTH, MAX_NAME_LENGTH } from '../../presets/io';
import { deleteUserPreset, duplicatePreset, getUserPresets, saveUserPreset, subscribePresets, updateUserPreset } from '../../presets/storage';
import type { Preset } from '../../presets/types';
import { usePlayback, useStudio } from '../../studio/StudioContext';
import { defineMode, type AnyModeDefinition, type ModeId, type ModePanelProps } from '../../studio/types';
import { summarizePreset } from './summary';
import './presets.css';

export type PresetsParams = Record<string, never>;

type Origin = 'all' | 'builtin' | 'user';
type Status = PresetFileMessage | null;

const ORIGIN_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'builtin', label: 'Built-in' },
  { value: 'user', label: 'My presets' },
] as const;

function matches(p: Preset, q: string, modeLabel: string): boolean {
  if (!q) return true;
  const hay = `${p.name} ${p.description ?? ''} ${modeLabel}`.toLowerCase();
  return q
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((w) => hay.includes(w));
}

/** Explorer-style file name, e.g. "Test Signal" -> "test_signal.tcs". */
function presetFileName(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return `${base || 'preset'}.tcs`;
}

/** Small mode glyphs drawn inside the mode orb (24×24, stroked). */
const MODE_GLYPHS: Partial<Record<ModeId, string>> = {
  ramp: 'M3 19 21 5M14 5h7v7',
  pulse: 'M2 17h4V7h4v10h4V7h4v10h4',
  siren: 'M2 12c2.5-6 5-6 7.5 0s5 6 7.5 0 3.5-4 5-2',
  random: 'M3 17l4-8 3 5 4-10 3 9 4-4',
  melody: 'M9 18V5l11-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM20 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0z',
  sequencer: 'M4 4h4v4H4zM10 4h4v4h-4zM16 4h4v4h-4zM4 10h4v4H4zM16 10h4v4h-4zM10 16h4v4h-4zM4 16h4v4H4z',
  midi: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM8 12h.01M16 12h.01M9.5 8.5h.01M14.5 8.5h.01M12 7h.01M10 17h4',
  frequency: 'M2 12c2-6 4-6 6 0s4 6 6 0 4-6 6 0',
};

function FileIcon({ mode }: { mode: ModeId }) {
  const glyph = MODE_GLYPHS[mode];
  return (
    <span className="mode-presets__file-icon" aria-hidden="true">
      <svg viewBox="0 0 16 18" width="40" height="46">
        <path className="mode-presets__file-page" d="M1 1h10l4 4v12H1z" />
        <path className="mode-presets__file-fold" d="M11 1v4h4" />
        <rect className="mode-presets__file-band" x="3" y="12" width="10" height="3" />
      </svg>
      <span className={`orb orb--${mode} mode-presets__file-orb`}>
        {glyph && (
          <svg viewBox="0 0 24 24" width="11" height="11">
            <path d={glyph} />
          </svg>
        )}
      </span>
    </span>
  );
}

// ---------------------------------------------------------------- card

interface CardProps {
  preset: Preset;
  modeLabel: string;
  loaded: boolean;
  playing: boolean;
  onSelect: () => void;
  onPlay: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete?: () => void;
  onRename?: (name: string, description: string) => void;
}

function PresetCard({ preset, modeLabel, loaded, playing, onSelect, onPlay, onEdit, onDuplicate, onDelete, onRename }: CardProps) {
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [name, setName] = useState(preset.name);
  const [desc, setDesc] = useState(preset.description ?? '');
  const ids = useId();
  const chips = useMemo(() => summarizePreset(preset), [preset]);

  const submitRename = (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    onRename?.(name, desc);
    setEditing(false);
  };

  const cls = ['mode-presets__card', loaded && 'mode-presets__card--selected', playing && 'mode-presets__card--playing'].filter(Boolean).join(' ');

  return (
    <li className={cls} data-mode={preset.mode}>
      {editing ? (
        <form className="mode-presets__rename" onSubmit={submitRename}>
          <label className="visually-hidden" htmlFor={`${ids}-n`}>
            Preset name
          </label>
          <input id={`${ids}-n`} className="ui-input" value={name} maxLength={MAX_NAME_LENGTH} onChange={(e) => setName(e.target.value)} autoFocus required />
          <label className="visually-hidden" htmlFor={`${ids}-d`}>
            Description
          </label>
          <textarea
            id={`${ids}-d`}
            className="ui-input mode-presets__textarea"
            value={desc}
            maxLength={MAX_DESCRIPTION_LENGTH}
            rows={2}
            placeholder="Description (optional)"
            onChange={(e) => setDesc(e.target.value)}
          />
          <div className="mode-presets__actions">
            <Button size="sm" variant="primary" type="submit" disabled={!name.trim()}>
              Save
            </Button>
            <Button
              size="sm"
              onClick={() => {
                setEditing(false);
                setName(preset.name);
                setDesc(preset.description ?? '');
              }}
            >
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <>
          <button
            type="button"
            className="mode-presets__file-head"
            onClick={onSelect}
            aria-current={loaded ? 'true' : undefined}
            title="Select: load as the current sound without playing"
          >
            <FileIcon mode={preset.mode} />
            <span className="mode-presets__file-text">
              <span className="mode-presets__name">{preset.name}</span>
              <span className="mode-presets__meta">
                {presetFileName(preset.name)} · {modeLabel} · {preset.builtIn ? 'Built-in' : 'Mine'}
              </span>
            </span>
            {playing ? (
              <span className="mode-presets__flag mode-presets__flag--playing">Playing</span>
            ) : (
              loaded && <span className="mode-presets__flag">Loaded</span>
            )}
          </button>
          {preset.description && <p className="mode-presets__desc">{preset.description}</p>}
          {chips.length > 0 && (
            <ul className="mode-presets__chips" aria-label="Settings">
              {chips.map((c) => (
                <li key={c} className="chip">
                  {c}
                </li>
              ))}
            </ul>
          )}
          <div className="mode-presets__actions">
            <Button size="sm" variant="primary" icon={<Icon name="play" />} onClick={onPlay} aria-label={`Play ${preset.name}`} title="Load and play (stays on this page)">
              Play
            </Button>
            <Button size="sm" onClick={onEdit} aria-label={`Edit ${preset.name}`} title={preset.builtIn ? 'Open a copy in its mode to tweak it' : 'Open in its mode'}>
              Edit
            </Button>
            <Button size="sm" onClick={onDuplicate} aria-label={`Duplicate ${preset.name}`} title="Copy to My presets">
              Duplicate
            </Button>
            {onRename && (
              <Button size="sm" onClick={() => setEditing(true)} aria-label={`Rename ${preset.name}`}>
                Rename
              </Button>
            )}
            {onDelete &&
              (confirmDelete ? (
                <span className="mode-presets__confirm">
                  <Button size="sm" variant="danger" onClick={onDelete} autoFocus>
                    Delete?
                  </Button>
                  <Button size="sm" onClick={() => setConfirmDelete(false)}>
                    Keep
                  </Button>
                </span>
              ) : (
                <Button size="sm" variant="danger" className="mode-presets__icon-btn" icon={<Icon name="trash" />} onClick={() => setConfirmDelete(true)} aria-label={`Delete ${preset.name}`} title="Delete" />
              ))}
          </div>
        </>
      )}
    </li>
  );
}

// ---------------------------------------------------------------- save form

function SaveForm({ modes, defaultMode, onSaved }: { modes: readonly AnyModeDefinition[]; defaultMode: ModeId; onSaved: (p: Preset) => void }) {
  const { getParams } = useStudio();
  const savable = modes.filter((m) => m.providesPlayable !== false);
  const [mode, setMode] = useState<ModeId>(defaultMode);
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const ids = useId();
  const label = savable.find((m) => m.id === mode)?.label ?? mode;
  const fallbackName = `My ${label.toLowerCase()} preset`;

  const submit = (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    const p = saveUserPreset({ name: name.trim() || fallbackName, mode, params: getParams(mode), description: desc });
    setName('');
    setDesc('');
    onSaved(p);
  };

  return (
    <form className="mode-presets__save" onSubmit={submit}>
      <Select
        label="Save settings of"
        value={mode}
        onChange={setMode}
        options={savable.map((m) => ({ value: m.id, label: m.id === defaultMode ? `${m.label} (current)` : m.label }))}
        hint={mode === 'midi' ? 'MIDI presets keep the conversion settings only, not the MIDI file.' : 'Stores the current settings of that mode.'}
      />
      <div className="ui-field">
        <label className="ui-field__label" htmlFor={`${ids}-name`}>
          Name
        </label>
        <input id={`${ids}-name`} className="ui-input" placeholder={fallbackName} value={name} maxLength={MAX_NAME_LENGTH} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="ui-field mode-presets__save-desc">
        <label className="ui-field__label" htmlFor={`${ids}-desc`}>
          Description <span className="mode-presets__optional">(optional)</span>
        </label>
        <textarea id={`${ids}-desc`} className="ui-input mode-presets__textarea" rows={2} value={desc} maxLength={MAX_DESCRIPTION_LENGTH} onChange={(e) => setDesc(e.target.value)} />
      </div>
      <div className="mode-presets__save-actions">
        <Button type="submit" variant="primary" icon={<Icon name="save" />}>
          Save preset
        </Button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------- panel

function PresetsPanel(_props: ModePanelProps<PresetsParams>) {
  const { loadPreset, sourceModeId, modes, loadedPreset } = useStudio();
  const isPlaying = usePlayback((s) => s.isPlaying);
  const user = useSyncExternalStore(subscribePresets, getUserPresets, getUserPresets);
  const [modeFilter, setModeFilter] = useState<ModeId | 'all'>('all');
  const [origin, setOrigin] = useState<Origin>('all');
  const [query, setQuery] = useState('');
  const [saveOpen, setSaveOpen] = useState(false);
  const [status, setStatus] = useState<Status>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const searchId = useId();
  const headId = useId();

  const modeLabel = useMemo(() => new Map(modes.map((m) => [m.id, m.label])), [modes]);
  const labelOf = (id: ModeId) => modeLabel.get(id) ?? id;
  const all = useMemo(() => [...BUILT_IN_PRESETS, ...user], [user]);
  const featured = useMemo(() => FEATURED_PRESET_IDS.map((id) => BUILT_IN_PRESETS.find((p) => p.id === id)).filter((p): p is Preset => !!p), []);

  // modes that have at least one preset (for the filter chips), in mode order
  const modeCounts = useMemo(() => {
    const counts = new Map<ModeId, number>();
    for (const p of all) if (origin === 'all' || (origin === 'user') === !p.builtIn) counts.set(p.mode, (counts.get(p.mode) ?? 0) + 1);
    return modes.filter((m) => counts.has(m.id)).map((m) => ({ id: m.id, label: m.label, count: counts.get(m.id)! }));
  }, [all, modes, origin]);

  const visible = all.filter(
    (p) => (origin === 'all' || (origin === 'user') === !p.builtIn) && (modeFilter === 'all' || p.mode === modeFilter) && matches(p, query.trim(), labelOf(p.mode)),
  );
  const groups = modes.map((m) => ({ mode: m, items: visible.filter((p) => p.mode === m.id) })).filter((g) => g.items.length > 0);

  const play = (p: Preset) => loadPreset(p, { play: true, open: false });
  const select = (p: Preset) => loadPreset(p, { open: false });
  const edit = (p: Preset) => loadPreset(p);
  const isLoaded = (p: Preset) => loadedPreset?.id === p.id && sourceModeId === p.mode;

  const importFile = async (file: File) => {
    const result = await importPresetFile(file, modes);
    setStatus({ kind: result.kind, text: result.text });
    if (result.added > 0) setOrigin((o) => (o === 'builtin' ? 'all' : o));
  };

  const playingHere = (p: Preset) => isPlaying && isLoaded(p);
  const filterMode = modeFilter === 'all' ? undefined : modes.find((m) => m.id === modeFilter);
  const presetsDesc = modes.find((m) => m.id === 'presets')?.description;

  return (
    <div className="mode-presets">
      <section className="mode-presets__quickpicks" aria-labelledby={`${headId}-qp`}>
        <div className="mode-presets__heading">
          <h2 id={`${headId}-qp`}>Pick a preset and press ▶ Play</h2>
          <p className="mode-presets__hint">
            Play starts it here · Edit opens its mode to tweak · built-ins stay unchanged · First time? Read the{' '}
            <button type="button" className="mode-presets__link" onClick={openGuide}>
              setup guide
            </button>
          </p>
        </div>
        <ul className="mode-presets__quick" aria-label="Quick start">
          {featured.map((p) => {
            const on = playingHere(p);
            return (
              <li key={p.id}>
                <button
                  type="button"
                  className={['mode-presets__tile', on && 'mode-presets__tile--playing'].filter(Boolean).join(' ')}
                  data-mode={p.mode}
                  onClick={() => play(p)}
                  aria-label={`Play ${p.name} (${labelOf(p.mode)})`}
                >
                  <span className="gel mode-presets__tile-orb" aria-hidden="true">
                    <Icon name={on ? 'speaker' : 'play'} size={18} />
                  </span>
                  <span className="mode-presets__tile-text">
                    <b className="mode-presets__tile-name">{p.name}</b>
                    <span className="mode-presets__tile-mode">{labelOf(p.mode)}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="mode-presets__library" aria-labelledby={`${headId}-lib`}>
        <div className="mode-presets__toolbar" role="toolbar" aria-label="Preset files">
          <Button variant="ghost" icon={<Icon name="save" />} onClick={() => setSaveOpen((o) => !o)} pressed={saveOpen} aria-expanded={saveOpen}>
            Save current…
          </Button>
          <Button variant="ghost" icon={<Icon name="upload" />} onClick={() => fileRef.current?.click()} title="Import presets from a JSON file">
            Import
          </Button>
          <Button variant="ghost" icon={<Icon name="download" />} onClick={() => setStatus(exportUserPresets())} disabled={user.length === 0} title="Download your presets as a JSON file">
            Export{user.length > 0 ? ` (${user.length})` : ''}
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) void importFile(f);
            }}
          />
        </div>

        {saveOpen && (
          <SaveForm
            modes={modes}
            defaultMode={sourceModeId}
            onSaved={(p) => {
              setStatus({ kind: 'ok', text: `Saved “${p.name}” to My presets.` });
              setSaveOpen(false);
              if (origin === 'builtin') setOrigin('all');
            }}
          />
        )}
        <p className={`mode-presets__status mode-presets__status--${status?.kind ?? 'none'}`} role="status" aria-live="polite">
          {status?.text}
        </p>

        <div className="mode-presets__libhead">
          <h2 id={`${headId}-lib`}>{filterMode ? `Library › ${filterMode.label}` : 'Library'}</h2>
          <div className="mode-presets__search">
            <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
              <circle className="mode-presets__search-lens" cx="10" cy="10" r="6" />
              <path className="mode-presets__search-handle" d="m15 15 6 6" />
            </svg>
            <label className="visually-hidden" htmlFor={searchId}>
              Search presets
            </label>
            <input id={searchId} type="search" placeholder="Search presets" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <SegmentedControl
            aria-label="Source"
            value={origin}
            onChange={setOrigin}
            options={ORIGIN_OPTIONS.map((o) => ({ ...o, label: o.value === 'user' ? `${o.label} (${user.length})` : o.label }))}
          />
        </div>
        <p className="mode-presets__libdesc">{filterMode ? filterMode.description : presetsDesc}</p>
        <div className="mode-presets__chipbar" role="group" aria-label="Filter by mode">
          <Button size="sm" variant="ghost" pressed={modeFilter === 'all'} onClick={() => setModeFilter('all')}>
            All modes
          </Button>
          {modeCounts.map((m) => (
            <Button key={m.id} size="sm" variant="ghost" pressed={modeFilter === m.id} onClick={() => setModeFilter((f) => (f === m.id ? 'all' : m.id))}>
              <span className={`orb orb--${m.id} mode-presets__chip-orb`} aria-hidden="true" />
              {m.label} <span className="mode-presets__count">{m.count}</span>
            </Button>
          ))}
        </div>

        {groups.length === 0 ? (
          <div className="mode-presets__empty">
            {origin === 'user' && user.length === 0 ? (
              <>
                <p>No presets of your own yet.</p>
                <p>Tweak any mode, then use “Save current…”, or import a presets file.</p>
              </>
            ) : (
              <p>Nothing here yet — try another mode or clear the search.</p>
            )}
          </div>
        ) : (
          groups.map((g) => (
            <section key={g.mode.id} className="mode-presets__group" aria-labelledby={`${headId}-group-${g.mode.id}`}>
              <h3 id={`${headId}-group-${g.mode.id}`} className="mode-presets__group-title" data-mode={g.mode.id}>
                {g.mode.label}
                <span className="mode-presets__group-desc">{g.mode.description}</span>
              </h3>
              <ul className="mode-presets__grid">
                {g.items.map((p) => (
                  <PresetCard
                    key={p.id}
                    preset={p}
                    modeLabel={labelOf(p.mode)}
                    loaded={isLoaded(p)}
                    playing={playingHere(p)}
                    onSelect={() => select(p)}
                    onPlay={() => play(p)}
                    onEdit={() => edit(p)}
                    onDuplicate={() => {
                      const copy = duplicatePreset(p);
                      setStatus({ kind: 'ok', text: `Duplicated as “${copy.name}”.` });
                    }}
                    onDelete={
                      p.builtIn
                        ? undefined
                        : () => {
                            deleteUserPreset(p.id);
                            setStatus({ kind: 'ok', text: `Deleted “${p.name}”.` });
                          }
                    }
                    onRename={p.builtIn ? undefined : (name, description) => updateUserPreset(p.id, { name, description })}
                  />
                ))}
              </ul>
            </section>
          ))
        )}
      </section>
    </div>
  );
}

export const mode = defineMode<PresetsParams>({
  id: 'presets',
  label: 'Presets',
  description: 'Ready-to-play sounds and your saved settings. Play one, tweak it, save your own.',
  defaultParams: {},
  providesPlayable: false,
  Panel: PresetsPanel,
});
