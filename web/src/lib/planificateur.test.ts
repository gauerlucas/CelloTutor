// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { etatInitial } from './etat';
import { changerObjectif } from './morceaux/suivi';
import { composerSeance, contexteDe, couperLongs, gammeDuJour, MAX_BLOC, repartir, totalMinutes, type Energie } from './planificateur';

const LUNDI = Date.UTC(2026, 10, 16, 18);

describe('planificateur', () => {
  it('répartit des minutes entières sans en perdre', () => {
    expect(repartir(60, [6, 10, 10, 10, 20, 4])).toEqual([6, 10, 10, 10, 20, 4]);
    expect(repartir(45, [1, 1, 1]).reduce((a, b) => a + b, 0)).toBe(45);
  });

  it('respecte la durée demandée, de 15 à 120 min, quelle que soit l’énergie', () => {
    const e = etatInitial(0);
    for (const duree of [15, 30, 45, 60, 90, 120]) {
      for (const energie of ['fatigue', 'normal', 'forme'] as Energie[]) {
        for (const instrument of [true, false]) {
          const b = composerSeance(e, { duree, energie, instrument }, contexteDe(e, LUNDI));
          expect(totalMinutes(b)).toBe(duree);
          expect(b.every((x) => x.minutes >= 3 && x.minutes <= MAX_BLOC)).toBe(true);
        }
      }
    }
  });

  it('suit la grille : 60 min normal', () => {
    const e = etatInitial(0);
    const b = composerSeance(e, { duree: 60, energie: 'normal', instrument: true }, contexteDe(e, LUNDI));
    expect(b.map((x) => [x.type, x.minutes])).toEqual([
      ['echauffement', 6], ['lecture', 10], ['gamme', 10], ['technique', 10], ['morceau', 20], ['oreille', 4],
    ]);
  });

  it('fatigué : pas de technique, révisions seules et passages déjà connus', () => {
    const e = etatInitial(0);
    e.morceaux['gluck-melodie'] = { doigtes: {}, passages: { 0: 1 } };
    e.morceaux['faure-apres-un-reve'] = { doigtes: {}, passages: { 0: 1 } };
    const b = composerSeance(e, { duree: 30, energie: 'fatigue', instrument: true }, contexteDe(e, LUNDI));
    expect(b.some((x) => x.type === 'technique')).toBe(false);
    expect(b.find((x) => x.type === 'lecture')!.lien).toBe('#/lecture/revisions');
    expect(b.find((x) => x.type === 'morceau')!.titre).toMatch(/passage connu/);
  });

  it('en forme 120 min : le morceau est coupé en deux blocs alternés', () => {
    const e = etatInitial(0);
    const b = composerSeance(e, { duree: 120, energie: 'forme', instrument: true }, contexteDe(e, LUNDI));
    const iM = b.map((x, i) => (x.type === 'morceau' ? i : -1)).filter((i) => i >= 0);
    expect(iM.length).toBe(2);
    expect(iM[1]! - iM[0]!).toBeGreaterThan(1);
  });

  it('écran seul : aucun bloc qui demande l’instrument', () => {
    const e = etatInitial(0);
    const b = composerSeance(e, { duree: 60, energie: 'normal', instrument: false }, contexteDe(e, LUNDI));
    expect(b.some((x) => ['echauffement', 'gamme', 'cloture'].includes(x.type))).toBe(false);
    expect(b.find((x) => x.type === 'morceau')!.titre).toMatch(/lecture préparée/);
  });

  it('sans objectif, la séance suit le socle et propose un morceau libre', () => {
    const e = etatInitial(0);
    changerObjectif(e, 'gluck-melodie', 'pause');
    changerObjectif(e, 'faure-apres-un-reve', 'abandonne');
    const ctx = contexteDe(e, LUNDI);
    const b = composerSeance(e, { duree: 60, energie: 'normal', instrument: true }, ctx);
    expect(b.find((x) => x.type === 'morceau')!.lien).toBe('#/morceaux');
    expect(b.find((x) => x.type === 'technique')!.titre).toBe('Notes en 1re position');
    expect(gammeDuJour(e, ctx).id).toBe('do-majeur');
  });

  it('la gamme du jour suit la tonalité d’un objectif', () => {
    const e = etatInitial(0);
    changerObjectif(e, 'faure-apres-un-reve', 'pause');
    const ids = [0, 1, 2].map((k) => gammeDuJour(e, contexteDe(e, LUNDI + k * 86400000)).id);
    expect(ids).toContain('re-mineur');
    expect(ids.every((id) => id === 're-mineur' || id === 'fa-majeur')).toBe(true);
  });

  it('le bloc technique vise une compétence demandée par l’objectif', () => {
    const e = etatInitial(0);
    const b = composerSeance(e, { duree: 60, energie: 'normal', instrument: true }, contexteDe(e, LUNDI));
    expect(b.find((x) => x.type === 'technique')!.cible).toMatch(/^tech:(pos|dem):/);
  });

  it('reprend en priorité un passage reporté', () => {
    const e = etatInitial(0);
    e.seances.push({ id: 's', debut: 0, dureePrevueMin: 60, dureeReelleMin: 20, energie: 'normal', blocs: [{ id: 'morceau', titre: 'x', minutes: 20, fait: false, cible: 'morceau:gluck-melodie:4' }] });
    const b = composerSeance(e, { duree: 60, energie: 'normal', instrument: true }, contexteDe(e, LUNDI));
    expect(b.find((x) => x.type === 'morceau')!.cible).toBe('morceau:gluck-melodie:4');
  });

  it('couperLongs ne perd aucune minute', () => {
    const b = couperLongs([{ id: 'a', type: 'morceau', titre: 'M', minutes: 60, consigne: '', lien: '' }, { id: 'b', type: 'gamme', titre: 'G', minutes: 10, consigne: '', lien: '' }]);
    expect(totalMinutes(b)).toBe(70);
    expect(b.every((x) => x.minutes <= MAX_BLOC)).toBe(true);
  });
});
