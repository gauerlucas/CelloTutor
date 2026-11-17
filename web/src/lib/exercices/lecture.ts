// Lecture de notes (repris de l'ébauche « Atelier ») : étapes débloquées par clé, des repères
// aux lignes supplémentaires, puis lecture en suite chronométrée et notes des morceaux en cours.

import type { Etat } from '../etat';
import { CLES, type Cle } from '../musique/cles';
import { deDegre, type Note } from '../musique/notes';
import { maitrise } from '../revision';

export interface Etape {
  id: string;
  titre: string;
  /** Écarts (en degrés) depuis la ligne du bas de la portée. */
  ecarts: number[] | 'reperes';
}

export const ETAPES: Etape[] = [
  { id: 'reperes', titre: 'Repères', ecarts: 'reperes' },
  { id: 'lignes', titre: 'Lignes', ecarts: [0, 2, 4, 6, 8] },
  { id: 'interlignes', titre: 'Interlignes', ecarts: [-1, 1, 3, 5, 7, 9] },
  { id: 'portee', titre: 'Toute la portée', ecarts: [-1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9] },
  { id: 'supp', titre: 'Lignes supplémentaires', ecarts: [-6, -5, -4, -3, -2, 10, 11, 12, 13, 14] },
];

/** Tessiture du violoncelle en degrés : do grave (C2) au la aigu (A5). */
const DEG_MIN = 14, DEG_MAX = 40;

export const ORDRE_CLES: Cle[] = ['fa', 'ut', 'sol'];

export interface ItemLecture {
  cle: string;
  clef: Cle;
  d: number;
  note: Note;
}

export const cleLecture = (clef: Cle, d: number) => `L|${clef}|${d}`;

export function degresEtape(clef: Cle, e: Etape): number[] {
  const b = CLES[clef].bas;
  const ds = e.ecarts === 'reperes' ? CLES[clef].reperes : e.ecarts.map((x) => b + x);
  return ds.filter((d) => d >= DEG_MIN && d <= DEG_MAX);
}

export const itemsEtape = (clef: Cle, e: Etape): ItemLecture[] =>
  degresEtape(clef, e).map((d) => ({ cle: cleLecture(clef, d), clef, d, note: deDegre(d) }));

/** Toutes les clés d'exercice d'une clé (pour sa ceinture de maîtrise). */
export const clesLecture = (clef: Cle) => [...new Set(ETAPES.flatMap((e) => degresEtape(clef, e)))].map((d) => cleLecture(clef, d));

export const SEUIL_ETAPE = 70;

/** Maîtrise d'une étape (exercices arrivés au moins en boîte 2). */
export const maitriseEtape = (etat: Etat, clef: Cle, e: Etape) => maitrise(etat, itemsEtape(clef, e).map((i) => i.cle), 2);

/** Nombre d'étapes ouvertes pour une clé : la suivante s'ouvre quand la précédente est acquise. */
export function etapesOuvertes(etat: Etat, clef: Cle): number {
  let n = 1;
  while (n < ETAPES.length && maitriseEtape(etat, clef, ETAPES[n - 1]!) >= SEUIL_ETAPE) n++;
  return n;
}

/** Les items de toutes les étapes ouvertes (pour mélanger révisions et nouveautés). */
export function itemsOuverts(etat: Etat, clef: Cle): ItemLecture[] {
  const n = etapesOuvertes(etat, clef);
  const vus = new Set<string>();
  return ETAPES.slice(0, n).flatMap((e) => itemsEtape(clef, e)).filter((i) => !vus.has(i.cle) && vus.add(i.cle));
}

/** Tire une suite de notes pour la lecture chronométrée (jamais deux fois la même d'affilée). */
export function tirerSuite(pool: ItemLecture[], n = 8, alea = Math.random): ItemLecture[] {
  const out: ItemLecture[] = [];
  for (let k = 0; k < n && pool.length; k++) {
    let x = pool[Math.floor(alea() * pool.length)]!;
    if (pool.length > 1) while (out.length && x.d === out[out.length - 1]!.d) x = pool[Math.floor(alea() * pool.length)]!;
    out.push(x);
  }
  return out;
}

/** Notes par minute, à partir du temps total et du nombre de notes justes. */
export const notesParMinute = (justes: number, ms: number) => (ms > 0 ? Math.round((justes * 60000) / ms) : 0);
