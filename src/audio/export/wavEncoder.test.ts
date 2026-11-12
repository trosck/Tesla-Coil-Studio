import { describe, expect, it } from 'vitest';
import { encodeWav, encodeMonoWav, floatTo16 } from './wavEncoder';

const ascii = (v: DataView, o: number, n: number) => String.fromCharCode(...Array.from({ length: n }, (_, i) => v.getUint8(o + i)));

describe('wavEncoder', () => {
  it('writes a valid 44-byte PCM header', () => {
    const buf = encodeMonoWav(new Float32Array(100), 44100);
    const v = new DataView(buf);
    expect(buf.byteLength).toBe(44 + 200);
    expect(ascii(v, 0, 4)).toBe('RIFF');
    expect(v.getUint32(4, true)).toBe(36 + 200);
    expect(ascii(v, 8, 4)).toBe('WAVE');
    expect(ascii(v, 12, 4)).toBe('fmt ');
    expect(v.getUint32(16, true)).toBe(16);
    expect(v.getUint16(20, true)).toBe(1);
    expect(v.getUint16(22, true)).toBe(1);
    expect(v.getUint32(24, true)).toBe(44100);
    expect(v.getUint32(28, true)).toBe(88200);
    expect(v.getUint16(32, true)).toBe(2);
    expect(v.getUint16(34, true)).toBe(16);
    expect(ascii(v, 36, 4)).toBe('data');
    expect(v.getUint32(40, true)).toBe(200);
  });

  it('stereo doubles sizes and interleaves L/R', () => {
    const l = new Float32Array([0.5, -0.5]);
    const r = new Float32Array([1, -1]);
    const buf = encodeWav([l, r], { sampleRate: 48000 });
    const v = new DataView(buf);
    expect(buf.byteLength).toBe(44 + 8);
    expect(v.getUint16(22, true)).toBe(2);
    expect(v.getUint32(28, true)).toBe(48000 * 4);
    expect(v.getUint16(32, true)).toBe(4);
    expect([v.getInt16(44, true), v.getInt16(46, true), v.getInt16(48, true), v.getInt16(50, true)]).toEqual([
      floatTo16(0.5),
      32767,
      floatTo16(-0.5),
      -32768,
    ]);
  });

  it('duplicates mono to stereo', () => {
    const buf = encodeMonoWav(new Float32Array([0.25]), 44100, true);
    const v = new DataView(buf);
    expect(v.getInt16(44, true)).toBe(v.getInt16(46, true));
  });

  it('clamps to 16-bit range', () => {
    expect(floatTo16(2)).toBe(32767);
    expect(floatTo16(-2)).toBe(-32768);
    expect(floatTo16(0)).toBe(0);
    expect(floatTo16(Number.NaN)).toBe(0);
  });

  it('rejects mismatched channels', () => {
    expect(() => encodeWav([new Float32Array(2), new Float32Array(3)], { sampleRate: 1 })).toThrow();
  });
});
