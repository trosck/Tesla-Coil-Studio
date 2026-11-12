import { useCallback, useContext } from 'react';
import type { Playable } from '../audio/types';
import { PublishContext, useStudio } from './StudioContext';
import type { AnyModeDefinition, ParamsUpdate } from './types';

/** Renders a mode's Panel wired to the studio (params, setParams, setPlayable). */
export function ModeHost({ mode }: { mode: AnyModeDefinition }) {
  const { getParams, setModeParams } = useStudio();
  const publish = useContext(PublishContext);
  const id = mode.id;
  const setParams = useCallback((next: ParamsUpdate<unknown>) => setModeParams(id, next), [id, setModeParams]);
  const setPlayable = useCallback((p: Playable | null) => publish?.(id, p), [id, publish]);
  const Panel = mode.Panel;
  return <Panel params={getParams(id)} setParams={setParams} setPlayable={setPlayable} />;
}
