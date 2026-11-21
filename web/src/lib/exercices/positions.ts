// Exercices de l'étape J1 : nommer les notes sous les doigts, trouver une note dans une
// position, enchaîner des démanchés. Fonctions pures (testées) ; l'affichage est dans la page.

import { CORDES, POSITIONS, casesDe, doigtPour, position, type Doigt, type Position } from '../musique/violoncelle';
import { deMidi, type Note } from '../musique/notes';

export interface ItemCase {
  cle: string;
  pos: string;
  corde: number;
  demiTons: number;
  doigt: Doigt;
  note: Note;
  midi: number;
}

export const cleNom = (pos: string, corde: number, demiTons: number) => `P|nom|${pos}|${corde}|${demiTons}`;
export const cleTrouve = (pos: string, corde: number, demiTons: number) => `P|trouve|${pos}|${corde}|${demiTons}`;

export function itemsPosition(type: 'nom' | 'trouve', posId: string, alterations: boolean): ItemCase[] {
  const p = position(posId);
  if (!p) return [];
  return casesDe(p, alterations).map((c) => ({
    cle: type === 'nom' ? cleNom(posId, c.corde, c.demiTons) : cleTrouve(posId, c.corde, c.demiTons),
    pos: posId,
    ...c,
  }));
}

/** Toutes les clés d'exercice d'une position (pour mesurer sa maîtrise). */
export const clesPosition = (posId: string) =>
  [...itemsPosition('nom', posId, true), ...itemsPosition('trouve', posId, true)].map((i) => i.cle);

// ---------------------------------------------------------------- démanchés

export interface Demanche {
  cle: string;
  de: string;
  vers: string;
  corde: number;
  doigtDepart: Doigt;
  doigtArrivee: Doigt;
  depart: number; // demi-tons depuis le sillet
  arrivee: number;
  midiDepart: number;
  midiArrivee: number;
}

/** Les trajets travaillés, du plus courant au plus lointain. */
export const TRAJETS: [string, string][] = [
  ['1', 'demi'], ['demi', '1'], ['1', '2'], ['2', '1'], ['1', '3'], ['3', '1'], ['2', '3'], ['3', '2'],
  ['3', '4'], ['4', '3'], ['1', '4'], ['4', '1'], ['4', '5'], ['5', '4'], ['4', '6'], ['6', '4'],
  ['5', '6'], ['6', '7'], ['7', '6'], ['4', '7'], ['7', '4'], ['3', '6'], ['6', '3'],
];

export const cleDemanche = (de: string, vers: string, corde: number, dd: Doigt, da: Doigt) => `D|${de}|${vers}|${corde}|${dd}|${da}`;

function fabriquer(de: Position, vers: Position, corde: number, dd: Doigt, da: Doigt): Demanche {
  const depart = de.ff + de.doigts[dd]!, arrivee = vers.ff + vers.doigts[da]!;
  return {
    cle: cleDemanche(de.id, vers.id, corde, dd, da),
    de: de.id, vers: vers.id, corde, doigtDepart: dd, doigtArrivee: da, depart, arrivee,
    midiDepart: CORDES[corde]!.midi + depart, midiArrivee: CORDES[corde]!.midi + arrivee,
  };
}

/**
 * Démanchés d'un trajet : même doigt (le doigt-guide glisse) puis doigt différent à l'arrivée,
 * sur les cordes de La et de Ré, les plus utilisées dans les morceaux.
 */
export function demanchesDe(de: string, vers: string, cordes = [3, 2]): Demanche[] {
  const a = position(de), b = position(vers);
  if (!a || !b) return [];
  const out: Demanche[] = [];
  for (const corde of cordes) {
    for (const d of ['1', '2', '3', '4'] as Doigt[]) out.push(fabriquer(a, b, corde, d, d));
    const monte = b.ff > a.ff;
    out.push(fabriquer(a, b, corde, monte ? '1' : '4', monte ? '4' : '1'));
    out.push(fabriquer(a, b, corde, monte ? '2' : '3', monte ? '1' : '4'));
  }
  return out;
}

export const tousLesDemanches = () => TRAJETS.flatMap(([a, b]) => demanchesDe(a, b));

/** Clés d'exercice de démanché entre deux positions (dans les deux sens). */
export const clesDemanche = (a: string, b: string) => [...demanchesDe(a, b), ...demanchesDe(b, a)].map((d) => d.cle);

/** Évalue une note entendue à l'arrivée d'un démanché. */
export function jugerArrivee(midiEntendu: number, cible: number, tolerance = 25): 'juste' | 'haut' | 'bas' {
  const c = (midiEntendu - cible) * 100;
  return Math.abs(c) <= tolerance ? 'juste' : c > 0 ? 'haut' : 'bas';
}

/** Les notes d'une position, corde par corde, de la plus grave à la plus aiguë (pour la portée). */
export function gammeDePosition(posId: string, alterations: boolean): { midi: number; note: Note; corde: number; doigt: Doigt }[] {
  const p = position(posId);
  if (!p) return [];
  return casesDe(p, alterations)
    .sort((x, y) => x.midi - y.midi || x.corde - y.corde)
    .map((c) => ({ midi: c.midi, note: c.note, corde: c.corde, doigt: c.doigt }));
}

export { POSITIONS, doigtPour, deMidi };

// ---------------------------------------------------------------- aide : la logique d'une position

export interface CaseEchelle { demiTons: number; note: Note; doigt: Doigt | null }
export interface AideCase {
  /** Notes récitées depuis la corde à vide jusqu'au 1er doigt (ou au pouce). */
  recit: Note[];
  /** Note du 1er doigt (ou du pouce) : le repère de la position sur cette corde. */
  repere: Note;
  /** Écart entre la note récitée et le repère réel (−1 : un demi-ton plus bas…). */
  correction: number;
  /** Du repère au doigt demandé, case par case. */
  chemin: { doigt: Doigt | null; note: Note; demiTons: number }[];
  /** La corde, case par case, du sillet jusqu'au bout de la main. */
  echelle: CaseEchelle[];
}

const NUMERO: Record<string, number> = { '1': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7 };

/**
 * Comment retrouver la note d'un doigt sans solfège :
 * 1. le repère : en Ne position, le 1er doigt est N notes au-dessus de la corde à vide
 *    (on récite : Ré, Mi, Fa, Sol… → 3e position = Sol), parfois un demi-ton plus bas ;
 * 2. chaque doigt suivant avance d'une case, c'est-à-dire d'un demi-ton.
 */
export function aideCase(p: Position, corde: number, demiTons: number): AideCase {
  const vide = CORDES[corde]!.midi;
  const nVide = deMidi(vide);
  const repere = deMidi(vide + p.ff);
  const n = NUMERO[p.id];
  const recit: Note[] = [];
  let correction = 0;
  if (n !== undefined) {
    for (let k = 0; k <= n; k++) {
      const L = nVide.L + k;
      recit.push({ L: L % 7, acc: 0, oct: nVide.oct + Math.floor(L / 7) });
    }
    const DEMI = [0, 2, 4, 5, 7, 9, 11];
    const der = recit[recit.length - 1]!;
    const midiRecite = 12 * (der.oct + 1) + DEMI[der.L]!;
    correction = vide + p.ff - midiRecite;
  }
  const [a, b] = [Math.min(p.ff, demiTons), Math.max(p.ff, demiTons)];
  const chemin = [];
  for (let d = a; d <= b; d++) chemin.push({ doigt: doigtPour(p, d), note: deMidi(vide + d), demiTons: d });
  if (demiTons < p.ff) chemin.reverse();
  const fin = Math.max(p.ff + Math.max(...Object.values(p.doigts).map((x) => x ?? 0)) + 1, demiTons + 1);
  const echelle: CaseEchelle[] = [];
  for (let d = 0; d <= fin; d++) echelle.push({ demiTons: d, note: deMidi(vide + d), doigt: doigtPour(p, d) });
  return { recit, repere, correction, chemin, echelle };
}
