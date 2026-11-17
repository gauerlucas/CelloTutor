// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { analyser, nomTonalite, notesAttaquees, lireXml, ErreurPartition } from './partition';
import { candidats, doigterAuto, doigtesMorceau, type DoigteFourni } from './doigte';
import { competencesDe, decouper, reperesDe } from './passages';
import { CORDES } from '../musique/violoncelle';

const CONTENU = resolve(process.cwd(), '../contenu/morceaux');
const lire = (id: string) => readFileSync(resolve(CONTENU, id, 'partition.musicxml'), 'utf8');
const gluck = analyser(lire('gluck-melodie'));
const faure = analyser(lire('faure-apres-un-reve'));
const fournis = JSON.parse(readFileSync(resolve(CONTENU, 'gluck-melodie', 'doigtes.json'), 'utf8')).doigtes as DoigteFourni[];

describe('lecture MusicXML', () => {
  it('Gluck : 38 mesures à 3/4, 221 notes attaquées, ré mineur, noire = 57', () => {
    expect(gluck.mesures).toHaveLength(38);
    expect(gluck.notes).toHaveLength(221);
    expect(gluck.mesures.every((m) => Math.abs(m.duree - 3) < 1e-9)).toBe(true);
    expect(nomTonalite(gluck.quintes, gluck.mode)).toBe('Ré mineur');
    expect(gluck.tempo).toBe(57);
    expect(gluck.cleOrigine).toBe('sol');
  });

  it('la liaison de prolongation allonge la première note', () => {
    const n0 = gluck.notes[0]!;
    expect(n0.midi).toBe(65);
    expect(n0.duree).toBeCloseTo(1.5 + 1 / 8);
    expect(gluck.notes[1]!.debut).toBeCloseTo(n0.duree);
  });

  it('lit le doigt et la corde écrits', () => {
    expect(gluck.notes[0]!.doigtEcrit).toBe('2');
    expect(gluck.notes[0]!.cordeEcrite).toBe(3);
  });

  it('Fauré : 48 mesures, triolets compris, do mineur', () => {
    expect(faure.mesures).toHaveLength(48);
    expect(faure.mesures.every((m) => Math.abs(m.duree - 3) < 1e-9)).toBe(true);
    expect(nomTonalite(faure.quintes, faure.mode)).toBe('Do mineur');
  });

  it('notesAttaquees correspond au modèle', () => {
    expect(notesAttaquees(lireXml(lire('gluck-melodie')))).toHaveLength(221);
  });

  it('refuse un fichier qui n’est pas une partition', () => {
    expect(() => analyser('<html/>')).toThrow(ErreurPartition);
  });
});

describe('doigtés', () => {
  it('le la 440 se joue à vide, au 4e doigt en 4e sur Ré, ou plus haut sur Sol', () => {
    const c = candidats(69 - 12);
    expect(c.some((x) => x.corde === 3 && x.doigt === '0')).toBe(true);
    expect(c.some((x) => x.corde === 2 && x.position === '4' && x.doigt === '1')).toBe(true);
  });

  it('chaque doigté calculé sonne la bonne note', () => {
    for (const p of [gluck, faure]) {
      const d = doigterAuto(p.notes);
      p.notes.forEach((n, i) => {
        const x = d[i]!;
        const dt = n.midi - CORDES[x.corde]!.midi;
        expect(dt).toBeGreaterThanOrEqual(0);
        if (x.doigt === '0') expect(dt).toBe(0);
      });
    }
  });

  it('une gamme de ré majeur en 1re position reste en 1re position', () => {
    const notes = [50, 52, 54, 55, 57, 59, 61, 62].map((midi) => ({ midi, duree: 1 }));
    const d = doigterAuto(notes);
    expect(d.filter((x) => x.doigt !== '0').every((x) => x.position === '1')).toBe(true);
  });

  it('les doigtés fournis de Gluck sont repris tels quels, les corrections passent devant', () => {
    const d = doigtesMorceau(gluck.notes, fournis, { 3: { corde: 2, position: '7', doigt: '1' } });
    expect(d[0]).toEqual({ corde: 3, position: '4', doigt: '2' });
    expect(d[3]).toEqual({ corde: 2, position: '7', doigt: '1' });
    expect(d.some((x) => x.position.startsWith('P'))).toBe(true);
  });
});

describe('passages', () => {
  it('découpe par 4 mesures et rattache une fin trop courte', () => {
    const p = decouper(gluck.mesures, gluck.notes);
    expect(p[0]).toMatchObject({ de: 1, a: 4, debutNote: 0 });
    expect(p[p.length - 1]!.a).toBe(38);
    expect(p.reduce((s, x) => s + x.finNote - x.debutNote, 0)).toBe(221);
  });

  it('respecte les coupures choisies', () => {
    const p = decouper(gluck.mesures, gluck.notes, [9, 17]);
    expect(p.map((x) => [x.de, x.a])).toEqual([[1, 8], [9, 16], [17, 38]]);
  });

  it('liste positions et démanchés d’un passage', () => {
    const d = doigtesMorceau(gluck.notes, fournis);
    const p = decouper(gluck.mesures, gluck.notes)[0]!;
    const c = competencesDe(p, d);
    expect(c.some((x) => x.cle === 'pos:4')).toBe(true);
    expect(c.every((x) => x.cles.length > 0)).toBe(true);
    expect(reperesDe(p, gluck.notes, d).notes).toBe(p.finNote - p.debutNote);
  });
});

describe('cohérence des doigtés fournis', () => {
  it('un doigté fourni par note attaquée, et chacun sonne la note écrite', () => {
    expect(fournis).toHaveLength(gluck.notes.length);
    gluck.notes.forEach((n, i) => expect(CORDES[fournis[i]!.corde]!.midi + fournis[i]!.demiTons).toBe(n.midi));
  });
});

describe('passages sans notes', () => {
  it('chaque passage contient au moins une note', () => {
    for (const p of [gluck, faure]) for (const x of decouper(p.mesures, p.notes)) expect(x.finNote).toBeGreaterThan(x.debutNote);
  });
});
