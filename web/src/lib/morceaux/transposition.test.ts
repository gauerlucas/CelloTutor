// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { analyser, nomTonalite } from './partition';
import { alterationArmure, intervalle, suggererTransposition, transposerXml } from './transposition';

const lire = (id: string) => readFileSync(resolve(process.cwd(), '../contenu/morceaux', id, 'partition.musicxml'), 'utf8');
const faureXml = lire('faure-apres-un-reve');
const faure = analyser(faureXml);

describe('transposition', () => {
  it('choisit l’écriture d’intervalle à l’armure la plus simple', () => {
    expect(intervalle(-12, -3)).toEqual({ degres: -7, quintes: 0 });
    expect(intervalle(2, -3)).toEqual({ degres: 1, quintes: 2 }); // do mineur → ré mineur
    expect(intervalle(-1, 0).quintes).toBe(5); // do → si (5 dièses) plutôt que do♭ (7 bémols)
  });

  it('armure : si♭ en fa majeur, fa♯ en sol', () => {
    expect(alterationArmure(-1, 6)).toBe(-1);
    expect(alterationArmure(1, 3)).toBe(1);
    expect(alterationArmure(1, 0)).toBe(0);
  });

  it('une octave plus bas : mêmes notes, 12 demi-tons plus bas, même tonalité', () => {
    const t = analyser(transposerXml(faureXml, -12));
    expect(t.notes).toHaveLength(faure.notes.length);
    t.notes.forEach((n, i) => {
      expect(n.midi).toBe(faure.notes[i]!.midi - 12);
      expect(n.L).toBe(faure.notes[i]!.L);
      expect(n.acc).toBe(faure.notes[i]!.acc);
    });
    expect(nomTonalite(t.quintes, t.mode)).toBe('Do mineur');
  });

  it('un ton plus haut : do mineur devient ré mineur, rythmes intacts', () => {
    const t = analyser(transposerXml(faureXml, 2));
    expect(nomTonalite(t.quintes, t.mode)).toBe('Ré mineur');
    t.notes.forEach((n, i) => {
      expect(n.midi).toBe(faure.notes[i]!.midi + 2);
      expect(n.debut).toBeCloseTo(faure.notes[i]!.debut);
    });
  });

  it('les altérations accidentelles sont réécrites selon la nouvelle armure', () => {
    const x = transposerXml(faureXml, 2);
    const doc = new DOMParser().parseFromString(x, 'application/xml');
    // Toute note dont l'altération diffère de l'armure (et de la mémoire de mesure) porte un signe.
    expect(doc.getElementsByTagName('accidental').length).toBeGreaterThan(0);
    expect(x).not.toContain('<fingering>');
  });

  it('pour Fauré, la suggestion descend le morceau et réduit les positions hautes', () => {
    const s = suggererTransposition(faure.notes);
    const origine = s.find((x) => x.demiTons === 0)!;
    expect(s[0]!.demiTons).toBeLessThan(0);
    expect(s[0]!.aigues).toBeLessThan(origine.aigues);
    expect(Math.min(...faure.notes.map((n) => n.midi)) + s[0]!.demiTons).toBeGreaterThanOrEqual(36);
  });
});
