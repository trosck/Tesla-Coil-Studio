import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { AudioEngine, PlayOptions } from '../audio/engine';
import type { Playable } from '../audio/types';
import type { Preset } from '../presets/types';
import { loadParamsByMode, normalizeModeParams, saveParamsByMode, type ParamsByMode } from './params';
import { PublishContext, StudioContext, type StudioApi } from './StudioContext';
import type { AnyModeDefinition, ModeId, ParamsUpdate } from './types';
import { readJson, writeJson } from '../lib/persist';

const ACTIVE_KEY = 'tcs.activeMode.v1';

interface Props {
  engine: AudioEngine;
  modes: readonly AnyModeDefinition[];
  children: ReactNode;
}

export function StudioProvider({ engine, modes, children }: Props) {
  const byId = useMemo(() => new Map(modes.map((m) => [m.id, m])), [modes]);
  const firstId = modes[0]!.id;

  const [activeModeId, setActiveModeId] = useState<ModeId>(() => {
    const saved = readJson<string>(ACTIVE_KEY, firstId);
    return byId.has(saved as ModeId) ? (saved as ModeId) : firstId;
  });
  const [sourceModeId, setSourceModeId] = useState<ModeId>(() =>
    byId.get(activeModeId)?.providesPlayable === false ? (modes.find((m) => m.providesPlayable !== false)?.id ?? firstId) : activeModeId,
  );
  const [paramsByMode, setParamsByMode] = useState<ParamsByMode>(() => loadParamsByMode(modes));
  const [published, setPublished] = useState<Partial<Record<ModeId, Playable | null>>>({});

  const setActiveMode = useCallback(
    (id: ModeId) => {
      setActiveModeId(id);
      if (byId.get(id)?.providesPlayable !== false) setSourceModeId(id);
      writeJson(ACTIVE_KEY, id);
    },
    [byId],
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
    (preset: Preset) => {
      const def = byId.get(preset.mode);
      if (!def) return;
      setParamsByMode((prev) => ({ ...prev, [def.id]: normalizeModeParams(def, preset.params) }));
      setActiveMode(def.id);
    },
    [byId, setActiveMode],
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

  // Push live updates into a running/paused transport.
  const lastPushed = useRef<Playable | null>(null);
  useEffect(() => {
    if (!activePlayable || lastPushed.current === activePlayable) return;
    const st = engine.state;
    if (st.isPlaying || st.isPaused) {
      engine.updatePlayable(activePlayable, { immediate: sourceDef?.liveUpdate === 'immediate' });
    }
    lastPushed.current = activePlayable;
  }, [activePlayable, engine, sourceDef]);

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
    [engine, modes, activeModeId, setActiveMode, sourceModeId, activePlayable, getParams, setModeParams, resetModeParams, loadPreset, play, pause, stop, playPlayable],
  );

  return (
    <StudioContext.Provider value={api}>
      <PublishContext.Provider value={setPlayableFor}>{children}</PublishContext.Provider>
    </StudioContext.Provider>
  );
}
