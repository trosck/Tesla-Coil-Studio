/**
 * Pure .mid -> MidiSummary parser (wraps @tonejs/midi). Used by the Web
 * Worker and as the main-thread fallback.
 */
import { Midi } from '@tonejs/midi';
import type { MidiNote, MidiSummary, MidiTrackSummary } from './types';

export class MidiParseError extends Error {}

function clean(s: string | undefined): string {
  return (s ?? '').replace(/\0/g, '').trim();
}

function capitalize(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

function summarizeTrack(track: Midi['tracks'][number], index: number): MidiTrackSummary {
  const notes: MidiNote[] = [];
  let minMidi: number | null = null;
  let maxMidi: number | null = null;
  for (const n of track.notes) {
    const time = n.time;
    const duration = n.duration;
    if (!Number.isFinite(time) || !Number.isFinite(duration)) continue;
    notes.push({ midi: n.midi, time, duration: Math.max(0, duration), velocity: Math.min(1, Math.max(0, n.velocity)) });
    if (minMidi === null || n.midi < minMidi) minMidi = n.midi;
    if (maxMidi === null || n.midi > maxMidi) maxMidi = n.midi;
  }
  notes.sort((a, b) => a.time - b.time || a.midi - b.midi);
  const isPercussion = track.channel === 9 || track.instrument.percussion;
  return {
    index,
    name: clean(track.name),
    instrument: isPercussion ? 'Drums' : capitalize(clean(track.instrument.name)),
    family: isPercussion ? 'drums' : clean(track.instrument.family),
    channel: track.channel,
    isPercussion,
    noteCount: notes.length,
    minMidi,
    maxMidi,
    notes,
  };
}

/** Parse a Standard MIDI File. Throws MidiParseError with a user-facing message. */
export function parseMidi(data: ArrayBuffer | Uint8Array, fileName = ''): MidiSummary {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  if (bytes.length < 14) throw new MidiParseError('The file is too small to be a MIDI file.');
  if (String.fromCharCode(bytes[0]!, bytes[1]!, bytes[2]!, bytes[3]!) !== 'MThd') {
    throw new MidiParseError('Not a Standard MIDI File (missing "MThd" header).');
  }
  let midi: Midi;
  try {
    midi = new Midi(bytes);
  } catch (e) {
    throw new MidiParseError(`Could not parse the MIDI file${e instanceof Error && e.message ? `: ${e.message}` : '.'}`);
  }
  const tracks = midi.tracks.map(summarizeTrack);
  let duration = 0;
  let totalNotes = 0;
  for (const t of tracks) {
    totalNotes += t.noteCount;
    for (const n of t.notes) duration = Math.max(duration, n.time + n.duration);
  }
  const tempos = midi.header.tempos
    .map((t) => ({ time: t.time ?? midi.header.ticksToSeconds(t.ticks), bpm: t.bpm }))
    .filter((t) => Number.isFinite(t.bpm) && t.bpm > 0);
  const ts = midi.header.timeSignatures[0]?.timeSignature;
  const baseName = fileName.replace(/\.(mid|midi|kar)$/i, '');
  return {
    name: baseName || clean(midi.name) || 'Untitled',
    duration,
    ppq: midi.header.ppq,
    bpm: tempos[0]?.bpm ?? 120,
    tempos,
    timeSignature: ts && ts.length >= 2 ? [ts[0]!, ts[1]!] : [4, 4],
    timeSignatureChanges: midi.header.timeSignatures.length,
    totalNotes,
    tracks,
  };
}
