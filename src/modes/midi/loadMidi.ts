/**
 * Parse a MIDI file in a Web Worker, falling back to the main thread when
 * workers are unavailable (or fail to start).
 */
import { MidiParseError, parseMidi } from './parse';
import type { ParseRequest, ParseResponse } from './protocol';
import type { MidiSummary } from './types';

export const MAX_FILE_BYTES = 16 * 1024 * 1024;

let worker: Worker | null = null;
let workerBroken = false;
let nextId = 1;
const pending = new Map<number, { resolve: (s: MidiSummary) => void; reject: (e: Error) => void; fallback: () => void }>();

function getWorker(): Worker | null {
  if (workerBroken || typeof Worker === 'undefined') return null;
  if (worker) return worker;
  try {
    worker = new Worker(new URL('./midiParser.worker.ts', import.meta.url), { type: 'module', name: 'midi-parser' });
  } catch {
    workerBroken = true;
    return null;
  }
  worker.onmessage = (e: MessageEvent<ParseResponse>) => {
    const msg = e.data;
    const p = pending.get(msg.id);
    if (!p) return;
    pending.delete(msg.id);
    if (msg.ok) p.resolve(msg.summary);
    else p.reject(new MidiParseError(msg.error));
  };
  worker.onerror = (e) => {
    // The worker itself failed (e.g. could not load): parse the pending files on the main thread.
    e.preventDefault();
    workerBroken = true;
    worker?.terminate();
    worker = null;
    const all = [...pending.values()];
    pending.clear();
    for (const p of all) p.fallback();
  };
  return worker;
}

function parseHere(buffer: ArrayBuffer, name: string): Promise<MidiSummary> {
  return new Promise((resolve, reject) => {
    // Yield once so the UI can show the "parsing" state.
    setTimeout(() => {
      try {
        resolve(parseMidi(buffer, name));
      } catch (e) {
        reject(e instanceof Error ? e : new Error(String(e)));
      }
    }, 0);
  });
}

/** Parse MIDI bytes. Rejects with a user-facing message on invalid data. */
export function parseMidiAsync(data: ArrayBuffer, name: string): Promise<MidiSummary> {
  if (data.byteLength > MAX_FILE_BYTES) return Promise.reject(new MidiParseError('The file is larger than 16 MB — that is not a typical MIDI file.'));
  const w = getWorker();
  if (!w) return parseHere(data, name);
  // Keep a copy for the fallback path: the original buffer is transferred.
  const copy = data.slice(0);
  return new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject, fallback: () => parseHere(copy, name).then(resolve, reject) });
    const req: ParseRequest = { id, name, buffer: data };
    try {
      w.postMessage(req, [data]);
    } catch {
      pending.delete(id);
      parseHere(copy, name).then(resolve, reject);
    }
  });
}

export function isMidiFileName(name: string): boolean {
  return /\.(mid|midi|kar|smf)$/i.test(name);
}
