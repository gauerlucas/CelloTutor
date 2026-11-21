// Les trois clés du violoncelle : fa, ut 4e (ténor), sol.

import { degre, type Note } from './notes';

export type Cle = 'fa' | 'ut' | 'sol';

export interface InfoCle {
  id: Cle;
  label: string;
  /** Degré diatonique de la ligne du bas de la portée. */
  bas: number;
  /** Repères à mémoriser (degrés), du grave à l'aigu. */
  reperes: number[];
}

export const CLES: Record<Cle, InfoCle> = {
  // G2 = 4 + 7×2 = 18 ; D3 = 22 ; E4 = 30
  fa: { id: 'fa', label: 'clé de fa', bas: 18, reperes: [14, 18, 22, 24, 26] },
  ut: { id: 'ut', label: "clé d'ut", bas: 22, reperes: [22, 26, 28, 30] },
  sol: { id: 'sol', label: 'clé de sol', bas: 30, reperes: [28, 32, 36, 38] },
};

/** Clé conseillée pour lire une hauteur (MIDI). */
export const cleConseillee = (m: number): Cle => (m <= 62 ? 'fa' : m <= 72 ? 'ut' : 'sol');

/** « Ligne 3 », « Interligne 2 », « 1re ligne sous la portée »… */
export function placeSurPortee(n: Note, cle: Cle): string {
  const i = degre(n) - CLES[cle].bas;
  if (i < 0) {
    const k = Math.ceil(-i / 2);
    return i % 2 === 0 ? `${k}${k === 1 ? 're' : 'e'} ligne sous la portée` : k === 1 ? 'juste sous la portée' : `sous la ${k - 1}${k - 1 === 1 ? 're' : 'e'} ligne supplémentaire`;
  }
  if (i > 8) {
    const k = Math.ceil((i - 8) / 2);
    return i % 2 === 0 ? `${k}${k === 1 ? 're' : 'e'} ligne au-dessus` : k === 1 ? 'juste au-dessus de la portée' : `au-dessus de la ${k - 1}${k - 1 === 1 ? 're' : 'e'} ligne supplémentaire`;
  }
  return i % 2 === 0 ? `ligne ${i / 2 + 1}` : `interligne ${(i + 1) / 2}`;
}

/** Indice pour lire par écart depuis le repère le plus proche. */
export function indiceEcart(n: Note, cle: Cle, nom: (d: number) => string): string {
  const d = degre(n);
  const r = CLES[cle].reperes;
  if (r.includes(d)) return `C'est un repère en ${CLES[cle].label}.`;
  let proche = r[0]!;
  for (const x of r) if (Math.abs(x - d) < Math.abs(proche - d)) proche = x;
  const ecart = d - proche;
  const k = Math.abs(ecart);
  return `${k === 1 ? 'Une note' : `${k} notes`} ${ecart > 0 ? 'au-dessus' : 'en dessous'} du repère ${nom(proche)}.`;
}

/** Repère le plus proche d'un degré (à égalité, le plus grave). */
export function repereProche(d: number, cle: Cle): number {
  let proche = CLES[cle].reperes[0]!;
  for (const x of CLES[cle].reperes) if (Math.abs(x - d) < Math.abs(proche - d)) proche = x;
  return proche;
}

/** Le chemin note à note du repère le plus proche jusqu'au degré visé (les deux inclus). */
export function cheminDepuisRepere(d: number, cle: Cle): number[] {
  const r = repereProche(d, cle);
  const pas = d >= r ? 1 : -1;
  const out: number[] = [];
  for (let k = r; k !== d + pas; k += pas) out.push(k);
  return out;
}

/** Corde à vide correspondant à un repère (pour sa couleur), s'il y en a une. */
export const CORDE_DU_DEGRE: Record<number, 'do' | 'sol' | 're' | 'la'> = { 14: 'do', 18: 'sol', 22: 're', 26: 'la' };
