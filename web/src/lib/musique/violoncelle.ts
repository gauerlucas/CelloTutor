// Le violoncelle : cordes, positions de la main gauche, cases du manche.

import { deMidi, nomNote, type Note, type StyleNoms } from './notes';

export interface Corde {
  /** Indice 0 = Do (la plus grave) … 3 = La. */
  i: number;
  id: 'do' | 'sol' | 're' | 'la';
  nom: string;
  midi: number;
  couleur: string;
}

export const CORDES: Corde[] = [
  { i: 0, id: 'do', nom: 'Do', midi: 36, couleur: 'var(--s-do)' },
  { i: 1, id: 'sol', nom: 'Sol', midi: 43, couleur: 'var(--s-sol)' },
  { i: 2, id: 're', nom: 'Ré', midi: 50, couleur: 'var(--s-re)' },
  { i: 3, id: 'la', nom: 'La', midi: 57, couleur: 'var(--s-la)' },
];

export type Doigt = '0' | '1' | '2' | '3' | '4' | 'p';

export interface Position {
  id: string;
  label: string;
  court: string;
  /** Demi-tons entre la corde à vide et le 1er doigt (ou le pouce). */
  ff: number;
  /** Doigt → demi-tons depuis ff, main fermée. */
  doigts: Partial<Record<Doigt, number>>;
  pouce?: boolean;
}

// Nommage « logique de la gamme » : le 1er doigt monte d'un degré par position.
// La note du 1er doigt sur la corde de La est toujours affichée à côté (décision du cahier des charges).
export const POSITIONS: Position[] = [
  { id: 'demi', label: 'demi-position', court: '½', ff: 1, doigts: { '1': 0, '2': 1, '3': 2, '4': 3 } },
  { id: '1', label: '1re position', court: '1', ff: 2, doigts: { '1': 0, '2': 1, '3': 2, '4': 3 } },
  { id: '2', label: '2e position', court: '2', ff: 3, doigts: { '1': 0, '2': 1, '3': 2, '4': 3 } },
  { id: '3', label: '3e position', court: '3', ff: 5, doigts: { '1': 0, '2': 1, '3': 2, '4': 3 } },
  { id: '4', label: '4e position', court: '4', ff: 7, doigts: { '1': 0, '2': 1, '3': 2, '4': 3 } },
  { id: '5', label: '5e position', court: '5', ff: 8, doigts: { '1': 0, '2': 1, '3': 2, '4': 3 } },
  { id: '6', label: '6e position', court: '6', ff: 10, doigts: { '1': 0, '2': 1, '3': 2, '4': 3 } },
  { id: '7', label: '7e position', court: '7', ff: 12, doigts: { '1': 0, '2': 1, '3': 2, '4': 3 } },
  { id: 'pouce', label: 'position du pouce', court: 'P', ff: 12, doigts: { p: 0, '1': 2, '2': 3, '3': 5 }, pouce: true },
];

/** Position du pouce posé à `ff` demi-tons du sillet (P12 = sur l'octave, P14, P15…). */
export const positionPouce = (ff: number): Position => ({
  id: `P${ff}`, label: 'position du pouce', court: 'P', ff, doigts: { p: 0, '1': 2, '2': 3, '3': 5 }, pouce: true,
});

/** Retrouve une position par son identifiant ; « P14 » donne une position du pouce sur mesure. */
export function position(id: string): Position | undefined {
  const p = POSITIONS.find((x) => x.id === id);
  if (p) return p;
  const m = /^P(\d{1,2})$/.exec(id);
  return m ? positionPouce(Number(m[1])) : undefined;
}

/** « 4e position — mi sur la corde de La » */
export function libellePosition(p: Position, style: StyleNoms = 'latin'): string {
  const n = deMidi(CORDES[3]!.midi + p.ff);
  const doigt = p.pouce ? 'pouce' : '1er doigt';
  return `${p.label} — ${doigt} sur ${nomNote(n, style)} (corde de La)`;
}

export interface Case {
  corde: number;
  /** Demi-tons depuis le sillet (0 = corde à vide). */
  demiTons: number;
}

export const midiDeCase = (c: Case) => CORDES[c.corde]!.midi + c.demiTons;

export function doigtPour(p: Position, demiTons: number): Doigt | null {
  for (const [d, off] of Object.entries(p.doigts) as [Doigt, number][]) if (p.ff + off === demiTons) return d;
  return null;
}

/** Cordes jouables dans une position (le pouce se pratique surtout sur Ré et La). */
export const cordesDe = (p: Position) => (p.pouce ? [2, 3] : [0, 1, 2, 3]);

/** Toutes les cases couvertes par la main dans une position (main fermée). */
export function casesDe(p: Position, avecAlterations = true, quintes: number | null = null): (Case & { doigt: Doigt; note: Note; midi: number })[] {
  const out: (Case & { doigt: Doigt; note: Note; midi: number })[] = [];
  for (const corde of cordesDe(p)) {
    for (const [d, off] of Object.entries(p.doigts) as [Doigt, number][]) {
      const demiTons = p.ff + off;
      const m = CORDES[corde]!.midi + demiTons;
      const n = deMidi(m, quintes);
      if (!avecAlterations && n.acc) continue;
      out.push({ corde, demiTons, doigt: d, note: n, midi: m });
    }
  }
  return out;
}

/** Où trouver une hauteur : toutes les cases possibles jusqu'à 19 demi-tons du sillet. */
export function casesPour(m: number, maxDemiTons = 19): Case[] {
  return CORDES.map((c) => ({ corde: c.i, demiTons: m - c.midi })).filter((c) => c.demiTons >= 0 && c.demiTons <= maxDemiTons);
}

export const TESSITURE = { min: 36, max: 81 };
