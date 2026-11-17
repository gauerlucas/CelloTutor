import { describe, expect, it } from 'vitest';
import { DetecteurTenue, ecartCible } from './tenue';

/** Rejoue une suite de lectures toutes les 60 ms ; renvoie l'instant (ms) de validation ou null. */
function jouer(d: DetecteurTenue, lectures: (number | null)[], t0 = 0) {
  let valide: number | null = null;
  lectures.forEach((midi, i) => {
    const r = d.pousser({ midi, t: t0 + i * 60 });
    if (r.etat === 'valide' && valide == null) valide = t0 + i * 60;
  });
  return valide;
}
const rep = (x: number | null, n: number) => Array<number | null>(n).fill(x);

describe('reconnaissance d’une note tenue', () => {
  it('un bruit bref sur la bonne note ne valide pas', () => {
    const d = new DetecteurTenue();
    d.viser(62);
    expect(jouer(d, [null, 62.1, 62.05, null, null, null, null, 70, null, null])).toBeNull();
  });

  it('une note tenue est validée après environ 0,45 s', () => {
    const d = new DetecteurTenue();
    d.viser(62);
    const t = jouer(d, [null, ...rep(62.1, 15)]);
    expect(t).not.toBeNull();
    expect(t!).toBeGreaterThanOrEqual(450);
    expect(t!).toBeLessThan(700);
  });

  it('de courtes coupures (archet, vibrato) ne remettent pas à zéro', () => {
    const d = new DetecteurTenue();
    d.viser(62);
    const seq = [62, 62, 62, null, 62, 62, null, null, 62.2, 61.9, 62, null, 62, 62, 62, 62];
    expect(jouer(d, seq)).not.toBeNull();
  });

  it('une longue interruption fait repartir de zéro', () => {
    const d = new DetecteurTenue();
    d.viser(62);
    expect(jouer(d, [62, 62, 62, 62, ...rep(null, 8), 62, 62, 62])).toBeNull();
  });

  it('une erreur d’octave du détecteur compte comme la bonne note', () => {
    expect(ecartCible(50.1, 62, true)).toBeCloseTo(10);
    const d = new DetecteurTenue();
    d.viser(62);
    expect(jouer(d, rep(74.05, 12))).not.toBeNull();
  });

  it('une note voisine (un demi-ton) n’est pas acceptée', () => {
    const d = new DetecteurTenue();
    d.viser(62);
    expect(jouer(d, rep(63, 20))).toBeNull();
  });

  it('deux notes identiques de suite : il faut rejouer la seconde', () => {
    const d = new DetecteurTenue();
    d.viser(62);
    expect(jouer(d, rep(62, 10))).not.toBeNull();
    d.viser(62.000001); // même hauteur, note suivante
    expect(jouer(d, rep(62, 20), 1000)).toBeNull();
    expect(jouer(d, [null, ...rep(62, 12)], 3000)).not.toBeNull();
  });

  it('renvoie l’écart médian de la tenue', () => {
    const d = new DetecteurTenue();
    d.viser(62);
    let med: number | undefined;
    for (let i = 0; i < 15; i++) { const r = d.pousser({ midi: 62.2, t: i * 60 }); if (r.etat === 'valide') med = r.ecartMedian; }
    expect(med).toBe(20);
  });
});
