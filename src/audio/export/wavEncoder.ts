/**
 * Pure 16-bit PCM WAV encoder (RIFF/WAVE, fmt chunk PCM = 1, then data chunk).
 * No browser APIs: returns an ArrayBuffer; wrap it in a Blob for download.
 */

export interface WavOptions {
  sampleRate: number;
  /** Only 16 is supported (fixed by design: 44.1 kHz / 16-bit export). */
  bitDepth?: 16;
}

/** Convert a float sample (-1..1) to signed 16-bit with clamping. */
export function floatTo16(sample: number): number {
  if (!(sample === sample)) return 0; // NaN
  const s = sample > 1 ? 1 : sample < -1 ? -1 : sample;
  return s < 0 ? Math.round(s * 0x8000) : Math.round(s * 0x7fff);
}

function writeAscii(view: DataView, offset: number, text: string): void {
  for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
}

/**
 * Encode one or more channels (all the same length) into an interleaved
 * 16-bit PCM WAV file.
 */
export function encodeWav(channels: readonly Float32Array[], opts: WavOptions): ArrayBuffer {
  if (channels.length === 0) throw new Error('encodeWav: at least one channel is required');
  const numChannels = channels.length;
  const frames = channels[0]!.length;
  for (const ch of channels) {
    if (ch.length !== frames) throw new Error('encodeWav: channels must have equal length');
  }
  const bytesPerSample = 2;
  const blockAlign = numChannels * bytesPerSample;
  const dataSize = frames * blockAlign;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  writeAscii(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(view, 8, 'WAVE');
  writeAscii(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // fmt chunk size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, opts.sampleRate, true);
  view.setUint32(28, opts.sampleRate * blockAlign, true); // byte rate
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true); // bits per sample
  writeAscii(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < numChannels; c++) {
      view.setInt16(offset, floatTo16(channels[c]![i]!), true);
      offset += 2;
    }
  }
  return buffer;
}

/** Convenience: mono buffer -> WAV, optionally duplicated to stereo. */
export function encodeMonoWav(samples: Float32Array, sampleRate: number, stereo = false): ArrayBuffer {
  return encodeWav(stereo ? [samples, samples] : [samples], { sampleRate });
}
