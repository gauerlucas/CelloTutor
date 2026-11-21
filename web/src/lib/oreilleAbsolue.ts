// Oreille absolue « synesthésique » : reconnaître le nom d'une note à son seul son, sans
// référence, en l'associant à une couleur, une image et sa syllabe chantée.
// Les notes s'ouvrent peu à peu, dans l'ordre des cordes à vide (do, sol, ré, la) puis fa, mi,
// si : on apprend d'abord à distinguer deux « couleurs » de son, puis on en ajoute une quand
// toutes les notes ouvertes sont reconnues de façon sûre.

import type { Etat } from './etat';

/** Ordre d'ouverture des lettres (0 = do … 6 = si). */
export const ORDRE_OUVERTURE = [0, 4, 1, 5, 3, 2, 6];
export const cleOA = (L: number) => `OA|${L}`;
/** Degrés joués en clé de fa : do2 (14) à mi4 (30), toutes octaves, pour ne pas apprendre le registre. */
export const DEGRE_MIN = 14, DEGRE_MAX = 30;

/** Une lettre est acquise quand elle a été reconnue vite et juste plusieurs fois (boîte ≥ 2). */
export function acquise(etat: Etat, L: number): boolean {
  const it = etat.items[cleOA(L)];
  return !!it && it.boite >= 2 && it.vus >= 4;
}

/** Lettres ouvertes : deux au départ, une de plus chaque fois que toutes les ouvertes sont acquises. */
export function lettresOuvertes(etat: Etat): number[] {
  let n = 2;
  while (n < 7 && ORDRE_OUVERTURE.slice(0, n).every((L) => acquise(etat, L))) n++;
  return ORDRE_OUVERTURE.slice(0, n);
}

/**
 * Tire la prochaine note (degré) : une lettre ouverte, plus souvent les moins sûres, rarement
 * la même que la précédente, à une octave au hasard.
 */
export function tirerDegre(etat: Etat, ouvertes: number[], precedent: number | null, alea = Math.random): number {
  const poids = ouvertes.map((L) => {
    const b = etat.items[cleOA(L)]?.boite ?? 0;
    const p = 6 - b; // les moins sûres reviennent plus
    return precedent !== null && ((precedent % 7) + 7) % 7 === L ? p * 0.25 : p;
  });
  let r = alea() * poids.reduce((a, b) => a + b, 0), k = 0;
  while (k < poids.length - 1 && r >= poids[k]!) { r -= poids[k]!; k++; }
  const L = ouvertes[k]!;
  const choix: number[] = [];
  for (let d = DEGRE_MIN; d <= DEGRE_MAX; d++) if (d % 7 === L && d !== precedent) choix.push(d);
  return choix[Math.floor(alea() * choix.length)]!;
}
