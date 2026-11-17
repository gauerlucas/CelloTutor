import { describe, expect, it } from 'vitest';
import { decimer, detecterHauteur } from './hauteur';
import { midiDeHz } from '../musique/notes';

function sonDeCorde(f: number, sr = 48000, n = 8192): Float32Array {
  // Signal riche en harmoniques, comme une corde frottée (amplitudes en 1/k).
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) for (let k = 1; k <= 8; k++) x[i]! += (0.3 / k) * Math.sin((2 * Math.PI * f * k * i) / sr);
  return x;
}

describe('detecterHauteur', () => {
  it.each([65.41, 98, 146.83, 220, 440, 698.46])('reconnaît %f Hz à moins de 5 cents', (f) => {
    const { y, sr } = decimer(sonDeCorde(f), 48000);
    const r = detecterHauteur(y.subarray(y.length - 2048), sr);
    expect(r).not.toBeNull();
    const cents = Math.abs((midiDeHz(r!.freq) - midiDeHz(f)) * 100);
    expect(cents).toBeLessThan(5);
  });

  it('ignore le silence', () => {
    expect(detecterHauteur(new Float32Array(2048), 16000)).toBeNull();
  });
});
