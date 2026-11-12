/**
 * Presets tab: the preset library (built-ins + the user's own presets).
 *
 * - ▶ Play  = load the preset into its mode and start playing, staying here
 *             (audition several quickly).
 * - Edit    = load the preset into its mode and open that tab. Built-ins are
 *             copied, never mutated; save changes as a new preset.
 * - User presets: rename, duplicate, delete, export/import as JSON.
 *
 * This tab has providesPlayable: false, so opening it never changes what the
 * transport plays.
 */
import { useId, useMemo, useRef, useState, useSyncExternalStore, type FormEvent } from 'react';
import { downloadBlob, timestampedName } from '../../audio/export/renderWav';
import { openGuide } from '../../components/shell/guideStore';
import { Button, Icon, Panel, SegmentedControl, Select } from '../../components/ui';
import { BUILT_IN_PRESETS, FEATURED_PRESET_IDS } from '../../presets/builtIn';
import { MAX_DESCRIPTION_LENGTH, MAX_NAME_LENGTH, parsePresetFile, presetKey, serializePresets } from '../../presets/io';
import { addUserPresets, deleteUserPreset, duplicatePreset, getUserPresets, saveUserPreset, subscribePresets, updateUserPreset } from '../../presets/storage';
import type { Preset } from '../../presets/types';
import { normalizeModeParams } from '../../studio/params';
import { usePlayback, useStudio } from '../../studio/StudioContext';
import { defineMode, type AnyModeDefinition, type ModeId, type ModePanelProps } from '../../studio/types';
import { summarizePreset } from './summary';
import './presets.css';

export type PresetsParams = Record<string, never>;

type Origin = 'all' | 'builtin' | 'user';
type Status = { kind: 'ok' | 'error'; text: string } | null;

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

// ---------------------------------------------------------------- card

interface CardProps {
  preset: Preset;
  modeLabel: string;
  loaded: boolean;
  playing: boolean;
  onPlay: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete?: () => void;
  onRename?: (name: string, description: string) => void;
}

function PresetCard({ preset, modeLabel, loaded, playing, onPlay, onEdit, onDuplicate, onDelete, onRename }: CardProps) {
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [name, setName] = useState(preset.name);
  const [desc, setDesc] = useState(preset.description ?? '');
  const ids = useId();
  const chips = useMemo(() => summarizePreset(preset), [preset]);

  const submitRename = (e: FormEvent) => {
    e.preventDefault();
    onRename?.(name, desc);
    setEditing(false);
  };

  return (
    <li className={['mode-presets__card', playing && 'mode-presets__card--playing'].filter(Boolean).join(' ')} data-mode={preset.mode}>
      <div className="mode-presets__card-top">
        <span className="mode-presets__mode">{modeLabel}</span>
        <span className={`mode-presets__origin mode-presets__origin--${preset.builtIn ? 'builtin' : 'user'}`}>{preset.builtIn ? 'Built-in' : 'Mine'}</span>
        {playing ? <span className="mode-presets__flag mode-presets__flag--playing">Playing</span> : loaded && <span className="mode-presets__flag">Loaded</span>}
      </div>

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
              variant="ghost"
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
          <h4 className="mode-presets__name">{preset.name}</h4>
          {preset.description && <p className="mode-presets__desc">{preset.description}</p>}
          {chips.length > 0 && (
            <ul className="mode-presets__chips" aria-label="Settings">
              {chips.map((c) => (
                <li key={c} className="mono">
                  {c}
                </li>
              ))}
            </ul>
          )}
          <div className="mode-presets__actions">
            <Button size="sm" variant="primary" icon={<Icon name="play" />} onClick={onPlay} aria-label={`Play ${preset.name}`} title="Load and play (stays on this tab)">
              Play
            </Button>
            <Button size="sm" icon={<Icon name="edit" />} onClick={onEdit} aria-label={`Edit ${preset.name}`} title={preset.builtIn ? 'Open a copy in its mode tab to tweak it' : 'Open in its mode tab'}>
              Edit
            </Button>
            <Button size="sm" variant="ghost" icon={<Icon name="copy" />} onClick={onDuplicate} aria-label={`Duplicate ${preset.name}`} title="Copy to My presets">
              <span className="mode-presets__btn-text">Duplicate</span>
            </Button>
            {onRename && (
              <Button size="sm" variant="ghost" onClick={() => setEditing(true)} aria-label={`Rename ${preset.name}`}>
                Rename
              </Button>
            )}
            {onDelete &&
              (confirmDelete ? (
                <span className="mode-presets__confirm">
                  <Button size="sm" variant="danger" onClick={onDelete} autoFocus>
                    Delete?
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(false)}>
                    Keep
                  </Button>
                </span>
              ) : (
                <Button size="sm" variant="ghost" icon={<Icon name="trash" />} onClick={() => setConfirmDelete(true)} aria-label={`Delete ${preset.name}`} title="Delete" />
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

  const submit = (e: FormEvent) => {
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
        hint={mode === 'midi' ? 'MIDI presets keep the conversion settings only, not the MIDI file.' : 'Stores the current settings of that mode tab.'}
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

  const modeLabel = useMemo(() => new Map(modes.map((m) => [m.id, m.label])), [modes]);
  const labelOf = (id: ModeId) => modeLabel.get(id) ?? id;
  const all = useMemo(() => [...BUILT_IN_PRESETS, ...user], [user]);
  const featured = useMemo(() => FEATURED_PRESET_IDS.map((id) => BUILT_IN_PRESETS.find((p) => p.id === id)).filter((p): p is Preset => !!p), []);

  // modes that have at least one preset (for the filter chips), in tab order
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
  const edit = (p: Preset) => loadPreset(p);
  const isLoaded = (p: Preset) => loadedPreset?.id === p.id && sourceModeId === p.mode;

  const normalizeFor = (mode: ModeId, params: unknown): unknown => {
    const def = modes.find((m) => m.id === mode);
    return def && def.providesPlayable !== false ? normalizeModeParams(def, params) : undefined;
  };

  const exportUser = () => {
    downloadBlob(serializePresets(user), timestampedName('tesla-coil-presets', 'json'), 'application/json');
    setStatus({ kind: 'ok', text: `Exported ${user.length} preset${user.length === 1 ? '' : 's'}.` });
  };

  const importFile = async (file: File) => {
    try {
      const { presets, invalid } = parsePresetFile(await file.text(), normalizeFor);
      const existing = new Set(user.map(presetKey));
      const fresh = presets.filter((p) => {
        const k = presetKey(p);
        if (existing.has(k)) return false;
        existing.add(k);
        return true;
      });
      addUserPresets(fresh);
      const dupes = presets.length - fresh.length;
      const notes = [dupes > 0 && `${dupes} already present`, invalid > 0 && `${invalid} invalid skipped`].filter(Boolean).join(', ');
      setStatus({ kind: fresh.length > 0 || dupes > 0 ? 'ok' : 'error', text: `Imported ${fresh.length} preset${fresh.length === 1 ? '' : 's'}${notes ? ` (${notes})` : ''}.` });
      if (fresh.length > 0) setOrigin((o) => (o === 'builtin' ? 'all' : o));
    } catch (e) {
      setStatus({ kind: 'error', text: `Import failed: ${e instanceof Error ? e.message : String(e)}` });
    }
  };

  const playingHere = (p: Preset) => isPlaying && isLoaded(p);

  return (
    <div className="mode-presets">
      <Panel className="mode-presets__hero">
        <div className="mode-presets__hero-text">
          <h3>Pick a preset and press ▶ Play</h3>
          <p>
            <strong>Play</strong> starts it right here, <strong>Edit</strong> opens it in its mode tab to tweak (built-ins stay unchanged — save your version as a new preset). First time? Read the{' '}
            <button type="button" className="mode-presets__link" onClick={openGuide}>
              setup guide
            </button>
            .
          </p>
        </div>
        <ul className="mode-presets__quick" aria-label="Quick start">
          {featured.map((p) => (
            <li key={p.id}>
              <button type="button" className={['mode-presets__tile', playingHere(p) && 'mode-presets__tile--playing'].filter(Boolean).join(' ')} data-mode={p.mode} onClick={() => play(p)}>
                <span className="mode-presets__tile-icon" aria-hidden="true">
                  <Icon name={playingHere(p) ? 'speaker' : 'play'} size={20} />
                </span>
                <span className="mode-presets__tile-text">
                  <span className="mode-presets__tile-name">{p.name}</span>
                  <span className="mode-presets__tile-mode">{labelOf(p.mode)}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
        <p className="mode-presets__source">
          PLAY / EXPORT currently use: <strong>{labelOf(sourceModeId)}</strong>
          {loadedPreset && loadedPreset.mode === sourceModeId && <> · last loaded “{loadedPreset.name}”</>}
        </p>
      </Panel>

      <Panel
        title="Library"
        className="mode-presets__library"
        actions={
          <>
            <Button size="sm" variant={saveOpen ? 'secondary' : 'primary'} icon={<Icon name="save" />} onClick={() => setSaveOpen((o) => !o)} aria-expanded={saveOpen}>
              Save current…
            </Button>
            <Button size="sm" icon={<Icon name="upload" />} onClick={() => fileRef.current?.click()} title="Import presets from a JSON file">
              Import
            </Button>
            <Button size="sm" icon={<Icon name="download" />} onClick={exportUser} disabled={user.length === 0} title="Download your presets as a JSON file">
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
          </>
        }
      >
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

        <div className="mode-presets__toolbar">
          <div className="mode-presets__search">
            <Icon name="search" size={16} />
            <label className="visually-hidden" htmlFor={searchId}>
              Search presets
            </label>
            <input id={searchId} className="ui-input" type="search" placeholder="Search presets" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <SegmentedControl
            aria-label="Preset source"
            value={origin}
            onChange={setOrigin}
            options={ORIGIN_OPTIONS.map((o) => ({ ...o, label: o.value === 'user' ? `${o.label} (${user.length})` : o.label }))}
          />
        </div>
        <div className="mode-presets__chipbar" role="group" aria-label="Filter by mode">
          <Button size="sm" variant="ghost" pressed={modeFilter === 'all'} onClick={() => setModeFilter('all')}>
            All modes
          </Button>
          {modeCounts.map((m) => (
            <Button key={m.id} size="sm" variant="ghost" pressed={modeFilter === m.id} onClick={() => setModeFilter((f) => (f === m.id ? 'all' : m.id))}>
              {m.label} <span className="mode-presets__count mono">{m.count}</span>
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
              <p>No presets match these filters.</p>
            )}
          </div>
        ) : (
          groups.map((g) => (
            <section key={g.mode.id} className="mode-presets__group" aria-labelledby={`presets-group-${g.mode.id}`}>
              <h3 id={`presets-group-${g.mode.id}`} className="mode-presets__group-title" data-mode={g.mode.id}>
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
      </Panel>
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
