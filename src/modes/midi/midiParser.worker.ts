/**
 * Web Worker: parses .mid files off the main thread and posts back a plain,
 * structured-clone-safe MidiSummary.
 */
import { MidiParseError, parseMidi } from './parse';
import type { ParseRequest, ParseResponse } from './protocol';

interface WorkerScope {
  onmessage: ((e: MessageEvent<ParseRequest>) => void) | null;
  postMessage(msg: ParseResponse): void;
}

const scope = self as unknown as WorkerScope;

scope.onmessage = (e) => {
  const { id, name, buffer } = e.data;
  try {
    scope.postMessage({ id, ok: true, summary: parseMidi(buffer, name) });
  } catch (err) {
    const error = err instanceof MidiParseError ? err.message : `Could not parse the MIDI file${err instanceof Error ? `: ${err.message}` : '.'}`;
    scope.postMessage({ id, ok: false, error });
  }
};
