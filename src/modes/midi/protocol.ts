/** Messages between the main thread and midiParser.worker.ts. */
import type { MidiSummary } from './types';

export interface ParseRequest {
  id: number;
  name: string;
  /** Transferred. */
  buffer: ArrayBuffer;
}

export type ParseResponse = { id: number; ok: true; summary: MidiSummary } | { id: number; ok: false; error: string };
