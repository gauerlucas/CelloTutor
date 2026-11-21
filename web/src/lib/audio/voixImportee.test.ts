import { describe, expect, it } from 'vitest';
import { decalage, decouperGamme } from './voixImportee';

/** Gamme « chantée » synthétique : voyelles harmoniques avec vibrato, silences, justesse approximative. */
function gamme(midis: number[], sr = 22050): Float32Array {
  const note = 0.7, pause = 0.2, x = new Float32Array(Math.round((midis.length * (note + pause) + 0.5) * sr));
  midis.forEach((m, k) => {
    const d = Math.round((0.3 + k * (note + pause)) * sr);
    let ph = 0;
    for (let i = 0; i < note * sr; i++) {
      const f = 440 * 2 ** ((m - 69) / 12) * (1 + 0.01 * Math.sin((2 * Math.PI * 5.5 * i) / sr));
      ph += (2 * Math.PI * f) / sr;
      const env = Math.min(1, i / (0.03 * sr), (note * sr - i) / (0.05 * sr));
      x[d + i] = 0.4 * env * (Math.sin(ph) + 0.5 * Math.sin(2 * ph) + 0.3 * Math.sin(3 * ph));
    }
  });
  return x;
}

describe('voix importée', () => {
  it('retrouve do ré mi fa sol la si, même un peu faux, et mesure leur hauteur', () => {
    const chante = [60.1, 61.8, 63.9, 64.7, 66.9, 68.6, 70.9];
    const r = decouperGamme(gamme([...chante, 72, 71, 69]), 22050);
    expect(Array.isArray(r)).toBe(true);
    if (typeof r === 'string') return;
    expect(r).toHaveLength(7);
    r.forEach((s, k) => expect(s.midi).toBeCloseTo(chante[k]!, 0));
  });
  it('ignore ce qui précède la gamme', () => {
    const r = decouperGamme(gamme([48, 55, 57, 50, 60, 62, 64, 65, 67, 69, 71]), 22050);
    expect(typeof r === 'string' ? r : Math.round(r[0]!.midi)).toBe(60);
  });
  it('refuse un enregistrement qui n’est pas une gamme majeure', () => {
    expect(typeof decouperGamme(gamme([60, 62, 63, 65, 67, 68, 70]), 22050)).toBe('string');
  });
  it('transpose d’une altération vers l’octave la plus proche', () => {
    expect(decalage(66, 64.66)).toBeCloseTo(1.34); // fa♯ depuis un fa chanté un peu bas
    expect(decalage(36, 59.82)).toBeCloseTo(0.18); // do grave : chanté dans la tessiture de la voix
    expect(decalage(70, 70.87)).toBeCloseTo(-0.87); // si♭
  });
});
