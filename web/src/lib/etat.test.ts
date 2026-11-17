import { describe, expect, it } from 'vitest';
import { choisirPlusRecent, etatInitial, normaliser, VERSION_ETAT } from './etat';

describe('normaliser', () => {
  it('accepte un état complet tel quel', () => {
    const e = etatInitial(1000);
    expect(normaliser(JSON.parse(JSON.stringify(e)))).toEqual(e);
  });

  it('refuse ce qui n’est pas un état', () => {
    expect(normaliser(null)).toBeNull();
    expect(normaliser('texte')).toBeNull();
    expect(normaliser({ pasDeVersion: true })).toBeNull();
  });

  it('refuse un état venant d’une version plus récente de l’appli', () => {
    expect(normaliser({ ...etatInitial(), version: VERSION_ETAT + 1 })).toBeNull();
  });

  it('complète les champs manquants et écarte les valeurs invalides', () => {
    const e = normaliser({ version: 1, reglages: { theme: 'violet', volume: 3, taillePupitre: 1.4 } });
    expect(e).not.toBeNull();
    expect(e!.reglages.theme).toBe('auto');
    expect(e!.reglages.volume).toBe(0.6);
    expect(e!.reglages.taillePupitre).toBe(1.4);
    expect(e!.items).toEqual({});
    expect(e!.objectifs.map((o) => o.morceauId)).toEqual(['gluck-melodie', 'faure-apres-un-reve']);
  });

  it('garde une liste d’objectifs vide si l’utilisateur les a tous retirés', () => {
    expect(normaliser({ version: 1, objectifs: [] })!.objectifs).toEqual([]);
  });
});

describe('choisirPlusRecent', () => {
  const vieux = etatInitial(100);
  const recent = etatInitial(200);

  it('prend la copie la plus récente', () => {
    expect(choisirPlusRecent(recent, vieux)).toBe(recent);
    expect(choisirPlusRecent(vieux, recent)).toBe(recent);
  });

  it('préfère le dossier en cas d’égalité', () => {
    const dossier = etatInitial(100);
    expect(choisirPlusRecent(vieux, dossier)).toBe(dossier);
  });

  it('se contente d’une seule copie', () => {
    expect(choisirPlusRecent(null, vieux)).toBe(vieux);
    expect(choisirPlusRecent(vieux, null)).toBe(vieux);
    expect(choisirPlusRecent(null, null)).toBeNull();
  });
});
