import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { AudioEngine, PlayOptions } from '../audio/engine';
import type { Playable } from '../audio/types';
import type { Preset } from '../presets/types';
import { loadParamsByMode, normalizeModeParams, saveParamsByMode, type ParamsByMode } from './params';
import { PublishContext, StudioContext, type LoadPresetOptions, type LoadedPreset, type StudioApi } from './StudioContext';
import type { AnyModeDefinition, ModeId, ParamsUpdate } from './types';
import { readJson, writeJson } from '../lib/persist';

const ACTIVE_KEY = 'tcs.activeMode.v1';
const SOURCE_KEY = 'tcs.sourceMode.v1';

interface Props {
  engine: AudioEngine;
  modes: readonly AnyModeDefinition[];
  /** Tab shown on the very first visit (default: the first mode). */
  defaultModeId?: ModeId;
  /** Mode the transport plays on the very first visit when the default tab does not provide one. */
  defaultSourceModeId?: ModeId;
  children: ReactNode;
}

/**
 * What a pending render should do with the transport once the new
 * activePlayable is known:
 * - 'play'    start the new material from the beginning (Load & Play);
 * - 'restart' if something is playing, restart with the new material now
 *             (a preset was loaded / the source mode changed); if paused, stop.
 */
type Cue = 'play' | 'restart' | null;

export function StudioProvider({ engine, modes, defaultModeId, defaultSourceModeId, children }: Props) {
  const byId = useMemo(() => new Map(modes.map((m) => [m.id, m])), [modes]);
  const firstId = modes[0]!.id;
  const provides = useCallback((id: ModeId | undefined) => !!id && byId.has(id) && byId.get(id)!.providesPlayable !== false, [byId]);

  const [activeModeId, setActiveModeId] = useState<ModeId>(() => {
    const fallback = defaultModeId && byId.has(defaultModeId) ? defaultModeId : firstId;
    const saved = readJson<string>(ACTIVE_KEY, fallback);
    return byId.has(saved as ModeId) ? (saved as ModeId) : fallback;
  });
  const [sourceModeId, setSourceModeIdState] = useState<ModeId>(() => {
    if (provides(activeModeId)) return activeModeId;
    const saved = readJson<string>(SOURCE_KEY, '') as ModeId;
    if (provides(saved)) return saved;
    if (provides(defaultSourceModeId)) return defaultSourceModeId!;
    return modes.find((m) => m.providesPlayable !== false)?.id ?? firstId;
  });
  const [paramsByMode, setParamsByMode] = useState<ParamsByMode>(() => loadParamsByMode(modes));
  const [published, setPublished] = useState<Partial<Record<ModeId, Playable | null>>>({});
  const [loadedPreset, setLoadedPreset] = useState<LoadedPreset | null>(null);
  const cue = useRef<Cue>(null);
  // Bumped with every cue so the sync effect runs even if the playable did not change.
  const [cueTick, setCueTick] = useState(0);

  const setSourceModeId = useCallback((id: ModeId) => {
    setSourceModeIdState(id);
    writeJson(SOURCE_KEY, id);
  }, []);

  const setActiveMode = useCallback(
    (id: ModeId) => {
      setActiveModeId(id);
      if (provides(id)) setSourceModeId(id);
      writeJson(ACTIVE_KEY, id);
    },
    [provides, setSourceModeId],
  );

  // persist params (debounced)
  useEffect(() => {
    const t = setTimeout(() => saveParamsByMode(paramsByMode), 300);
    return () => clearTimeout(t);
  }, [paramsByMode]);

  const getParams = useCallback(<P,>(id: ModeId): P => paramsByMode[id] as P, [paramsByMode]);

  const setModeParams = useCallback(<P,>(id: ModeId, next: ParamsUpdate<P>) => {
    setParamsByMode((prev) => {
      const value = typeof next === 'function' ? (next as (p: P) => P)(prev[id] as P) : next;
      return { ...prev, [id]: value };
    });
  }, []);

  const resetModeParams = useCallback(
    (id: ModeId) => {
      const def = byId.get(id);
      if (def) setParamsByMode((prev) => ({ ...prev, [id]: def.defaultParams }));
    },
    [byId],
  );

  const setPlayableFor = useCallback((id: ModeId, p: Playable | null) => {
    setPublished((prev) => (prev[id] === p ? prev : { ...prev, [id]: p }));
  }, []);

  const loadPreset = useCallback(
    (preset: Preset, opts: LoadPresetOptions = {}) => {
      const def = byId.get(preset.mode);
      if (!def || def.providesPlayable === false) return;
      // Built-ins are never mutated: the mode gets a normalized deep copy.
      const params = normalizeModeParams(def, JSON.parse(JSON.stringify(preset.params ?? null)) as unknown);
      setParamsByMode((prev) => ({ ...prev, [def.id]: params }));
      setLoadedPreset({ id: preset.id, mode: def.id, name: preset.name });
      cue.current = opts.play ? 'play' : 'restart';
      setCueTick((n) => n + 1);
      if (opts.play) {
        // Create/resume the AudioContext inside the user gesture; playback starts once the new playable is built.
        void engine.ensureStarted().catch(() => undefined);
      }
      if (opts.open === false) setSourceModeId(def.id);
      else setActiveMode(def.id);
    },
    [byId, engine, setActiveMode, setSourceModeId],
  );

  const sourceDef = byId.get(sourceModeId);
  const sourceParams = paramsByMode[sourceModeId];
  const sourcePublished = published[sourceModeId];
  const activePlayable = useMemo<Playable | null>(() => {
    if (!sourceDef) return null;
    if (sourceDef.build) {
      try {
        return sourceDef.build(sourceParams);
      } catch (e) {
        console.error(`[mode ${sourceDef.id}] build() failed`, e);
        return null;
      }
    }
    return sourcePublished ?? null;
  }, [sourceDef, sourceParams, sourcePublished]);

  // Keep the transport in sync with the source mode.
  //
  // Rule (see ARCHITECTURE.md "Switching modes while playing"):
  // - editing params of the playing mode: hand over at the next loop/chunk
  //   boundary ('boundary' modes) or re-cue in place ('immediate' modes);
  // - switching to another mode tab, or loading a preset, while PLAYING:
  //   restart immediately with the new mode's material (stop if it has
  //   nothing to play); while PAUSED: stop (rewind), so PLAY starts the new
  //   material from the beginning;
  // - the Presets tab does not provide material, so opening it never
  //   changes what plays.
  const lastPushed = useRef<Playable | null>(null);
  const lastSource = useRef<ModeId>(sourceModeId);
  useEffect(() => {
    const sourceChanged = lastSource.current !== sourceModeId;
    lastSource.current = sourceModeId;
    const pending = cue.current;
    cue.current = null;
    const st = engine.state;
    if (pending === 'play') {
      lastPushed.current = activePlayable;
      if (activePlayable) void engine.play(activePlayable).catch(() => undefined);
      return;
    }
    if (sourceChanged || pending === 'restart') {
      lastPushed.current = activePlayable;
      if (st.isPlaying) {
        if (activePlayable) void engine.play(activePlayable).catch(() => undefined);
        else engine.stop();
      } else if (st.isPaused) {
        engine.stop();
      }
      return;
    }
    if (!activePlayable || lastPushed.current === activePlayable) return;
    if (st.isPlaying || st.isPaused) {
      engine.updatePlayable(activePlayable, { immediate: sourceDef?.liveUpdate === 'immediate' });
    }
    lastPushed.current = activePlayable;
  }, [activePlayable, engine, sourceDef, sourceModeId, cueTick]);

  const play = useCallback(async () => {
    const st = engine.state;
    if (st.isPaused && engine.currentPlayable) {
      if (activePlayable && engine.currentPlayable !== activePlayable) engine.updatePlayable(activePlayable);
      await engine.resume();
      return;
    }
    if (!activePlayable) return;
    lastPushed.current = activePlayable;
    await engine.play(activePlayable);
  }, [engine, activePlayable]);

  const pause = useCallback(() => engine.pause(), [engine]);
  const stop = useCallback(() => engine.stop(), [engine]);
  const playPlayable = useCallback((p: Playable, opts?: PlayOptions) => engine.play(p, opts), [engine]);

  const api = useMemo<StudioApi>(
    () => ({
      engine,
      modes,
      activeModeId,
      setActiveMode,
      sourceModeId,
      loadedPreset,
      activePlayable,
      getParams,
      setModeParams,
      resetModeParams,
      loadPreset,
      play,
      pause,
      stop,
      playPlayable,
    }),
    [engine, modes, activeModeId, setActiveMode, sourceModeId, loadedPreset, activePlayable, getParams, setModeParams, resetModeParams, loadPreset, play, pause, stop, playPlayable],
  );

  return (
    <StudioContext.Provider value={api}>
      <PublishContext.Provider value={setPlayableFor}>{children}</PublishContext.Provider>
    </StudioContext.Provider>
  );
}
