/**
 * In-memory (per page session) state of the MIDI mode: the loaded file and the
 * track selection. Lives at module level so it survives switching tabs (the
 * panel unmounts); it is intentionally not persisted.
 */
import { createStore } from '../../lib/store';
import { convertMidi, defaultTrackSelection, type ConversionResult } from './convert';
import { parseMidiAsync } from './loadMidi';
import type { MidiParams, MidiSummary } from './types';

export interface MidiSession {
  status: 'empty' | 'parsing' | 'ready' | 'error';
  summary: MidiSummary | null;
  fileName: string;
  /** Selected track indices (MidiTrackSummary.index). */
  selected: number[];
  error: string | null;
}

export const midiSession = createStore<MidiSession>({ status: 'empty', summary: null, fileName: '', selected: [], error: null });

let loadToken = 0;

/** Parse and load a file. Resolves true when a new file was loaded. */
export async function loadMidiData(buffer: ArrayBuffer, fileName: string): Promise<boolean> {
  const token = ++loadToken;
  midiSession.setState({ status: 'parsing', error: null, fileName });
  try {
    const summary = await parseMidiAsync(buffer, fileName);
    if (token !== loadToken) return false;
    if (summary.totalNotes === 0) {
      midiSession.setState((s) => ({ status: s.summary ? 'ready' : 'error', fileName: s.summary ? s.fileName : fileName, error: 'This MIDI file contains no notes.' }));
      return false;
    }
    midiSession.setState({ status: 'ready', summary, fileName, selected: defaultTrackSelection(summary), error: null });
    return true;
  } catch (e) {
    if (token !== loadToken) return false;
    const error = e instanceof Error ? e.message : 'Could not read the file.';
    // keep a previously loaded file usable
    midiSession.setState((s) => ({ status: s.summary ? 'ready' : 'error', fileName: s.summary ? s.fileName : fileName, error }));
    return false;
  }
}

export function setSelectedTracks(next: number[]): void {
  midiSession.setState({ selected: [...new Set(next)].sort((a, b) => a - b) });
}

export function clearMidi(): void {
  loadToken++;
  midiSession.setState({ status: 'empty', summary: null, fileName: '', selected: [], error: null });
}

// Single-entry memo so remounting the panel reuses the same Sequence object
// (the transport then sees no change).
let cache: { summary: MidiSummary; selected: number[]; params: MidiParams; result: ConversionResult } | null = null;

export function convertCached(summary: MidiSummary, selected: number[], params: MidiParams): ConversionResult {
  if (cache && cache.summary === summary && cache.selected === selected && cache.params === params) return cache.result;
  const result = convertMidi(summary, selected, params);
  cache = { summary, selected, params, result };
  return result;
}
