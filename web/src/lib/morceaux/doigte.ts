// Doigtés d'un morceau : ceux de la partition ou du fichier fourni, sinon un doigté calculé
// (programmation dynamique sur corde, position et doigt), puis les corrections de l'utilisateur.

import { CORDES, POSITIONS, position, type Doigt } from '../musique/violoncelle';
import type { DoigteNote } from '../etat';

export interface Doigte {
  corde: number;
  /** Identifiant de position ('demi', '1'…'7', 'P12'…) ; '' pour une corde à vide. */
  position: string;
  doigt: Doigt;
}

interface Candidat extends Doigte {
  ff: number | null;
  demiTons: number;
  extension: boolean;
}

const POSITIONS_MANCHE = POSITIONS.filter((p) => !p.pouce);
const FF_POUCE = [12, 13, 14, 15, 16, 17, 19];

/** Toutes les façons raisonnables de jouer une hauteur. */
export function candidats(midi: number): Candidat[] {
  const out: Candidat[] = [];
  for (const c of CORDES) {
    const dt = midi - c.midi;
    if (dt < 0 || dt > 26) continue;
    if (dt === 0) {
      out.push({ corde: c.i, position: '', doigt: '0', ff: null, demiTons: 0, extension: false });
      continue;
    }
    for (const p of POSITIONS_MANCHE) {
      const off = dt - p.ff;
      if (off >= 0 && off <= 3) out.push({ corde: c.i, position: p.id, doigt: String(off + 1) as Doigt, ff: p.ff, demiTons: dt, extension: false });
      else if (off === 4 && p.ff <= 7) out.push({ corde: c.i, position: p.id, doigt: '4', ff: p.ff, demiTons: dt, extension: true });
    }
    if (c.i >= 1) {
      for (const ff of FF_POUCE) {
        const off = dt - ff;
        if (off < 0 || off > 6) continue;
        const doigt: Doigt = off === 0 ? 'p' : off <= 2 ? '1' : off <= 4 ? '2' : '3';
        out.push({ corde: c.i, position: `P${ff}`, doigt, ff, demiTons: dt, extension: off === 1 || off === 4 || off === 6 });
      }
    }
  }
  return out;
}

function coutPropre(c: Candidat): number {
  let k = 0;
  if (c.doigt === '0') k += 0.4;
  if (c.position.startsWith('P')) k += 0.7 + (c.corde < 2 ? 1.5 : 0);
  if (c.extension) k += 0.9;
  if (c.doigt === '4') k += 0.15;
  if (c.demiTons > 7) k += 0.025 * (c.demiTons - 7) * (c.corde < 3 ? 2 : 1);
  return k;
}

function coutPassage(a: Candidat, b: Candidat, dureeA: number): number {
  let k = 0;
  const ecartCordes = Math.abs(a.corde - b.corde);
  if (ecartCordes) k += 0.5 + 1.2 * (ecartCordes - 1);
  const ouverte = a.doigt === '0' || b.doigt === '0';
  if (ouverte) {
    // Une corde à vide au milieu d'un passage aigu casse la couleur.
    const ff = a.ff ?? b.ff ?? 0;
    if (ff >= 7) k += 1.6;
  } else if (a.position !== b.position) {
    k += 2 + 0.1 * Math.abs((a.ff ?? 0) - (b.ff ?? 0));
    if (b.position.startsWith('P') && !a.position.startsWith('P')) k += 1; // poser le pouce
    if (a.doigt === b.doigt) k -= 0.3; // le doigt-guide glisse : démanché plus sûr
    if (dureeA < 0.5) k += 1; // démancher sur une note brève est risqué
    if (ecartCordes) k += 0.6; // changer de corde et de position à la fois
    if (b.position.startsWith('P') && a.position.startsWith('P') && ecartCordes) k += 0.5;
  }
  return k;
}

export interface NotePourDoigte {
  midi: number;
  duree: number;
  doigtEcrit?: string;
  cordeEcrite?: number;
}

/** Doigté calculé pour une suite de notes (une ligne mélodique). */
export function doigterAuto(notes: NotePourDoigte[]): Doigte[] {
  if (!notes.length) return [];
  const listes = notes.map((n) => {
    let cs = candidats(n.midi);
    if (n.cordeEcrite != null) {
      const f = cs.filter((c) => c.corde === n.cordeEcrite);
      if (f.length) cs = f;
    }
    if (n.doigtEcrit) {
      const f = cs.filter((c) => c.doigt === n.doigtEcrit);
      if (f.length) cs = f;
    }
    if (!cs.length) {
      // Hors tessiture : on la place quand même sur la corde de La, au plus près.
      cs = [{ corde: 3, position: 'P19', doigt: '3', ff: 19, demiTons: n.midi - 57, extension: false }];
    }
    return cs;
  });
  const couts: number[][] = [listes[0]!.map(coutPropre)];
  const prec: number[][] = [listes[0]!.map(() => -1)];
  for (let i = 1; i < listes.length; i++) {
    const ci: number[] = [], pi: number[] = [];
    for (const b of listes[i]!) {
      let meilleur = Infinity, arg = 0;
      listes[i - 1]!.forEach((a, j) => {
        const k = couts[i - 1]![j]! + coutPassage(a, b, notes[i - 1]!.duree);
        if (k < meilleur) {
          meilleur = k;
          arg = j;
        }
      });
      ci.push(meilleur + coutPropre(b));
      pi.push(arg);
    }
    couts.push(ci);
    prec.push(pi);
  }
  const dernier = couts[couts.length - 1]!;
  let j = dernier.indexOf(Math.min(...dernier));
  const out: Doigte[] = new Array(notes.length);
  for (let i = notes.length - 1; i >= 0; i--) {
    const c = listes[i]![j]!;
    out[i] = { corde: c.corde, position: c.position, doigt: c.doigt };
    j = prec[i]![j]!;
  }
  return out;
}

/** « 4e » → '4', « P14 » → 'P14', « ½ » → 'demi' (format des fichiers de doigtés fournis). */
export function idPosition(libelle: string): string {
  const t = libelle.trim();
  if (/^P\d+$/.test(t)) return t;
  if (t === '½' || t === 'demi' || t === '1/2') return 'demi';
  const m = /^(\d)/.exec(t);
  return m ? m[1]! : '';
}

export interface DoigteFourni {
  corde: number;
  position: string;
  doigt: number | string;
  demiTons: number;
}

/**
 * Doigtés définitifs d'un morceau : correction de l'utilisateur, sinon doigté fourni, sinon
 * doigté calculé (qui respecte les doigts et cordes écrits sur la partition).
 */
export function doigtesMorceau(notes: NotePourDoigte[], fournis: DoigteFourni[] | null, corrections: Record<number, DoigteNote> = {}): Doigte[] {
  const auto = doigterAuto(notes);
  return notes.map((n, i) => {
    const c = corrections[i];
    if (c) return { corde: c.corde, position: c.position, doigt: c.doigt as Doigt };
    const f = fournis?.[i];
    if (f && CORDES[f.corde] && CORDES[f.corde]!.midi + f.demiTons === n.midi) {
      const d = String(f.doigt) as Doigt;
      return { corde: f.corde, position: d === '0' ? '' : idPosition(f.position), doigt: d };
    }
    return auto[i]!;
  });
}

/** Demi-tons depuis le sillet d'une note doigtée. */
export const demiTonsDe = (midi: number, d: Doigte) => midi - CORDES[d.corde]!.midi;

/** Libellé court d'une position : « 4e », « ½ », « pouce ». */
export function courtPosition(id: string): string {
  if (!id) return 'corde à vide';
  if (id.startsWith('P')) return 'pouce';
  const p = position(id);
  return p ? (p.id === 'demi' ? '½ position' : p.label.replace(' position', '')) : id;
}

/** Les positions possibles pour jouer une note sur une corde donnée (pour l'éditeur). */
export function choixSurCorde(midi: number, corde: number): Doigte[] {
  return candidats(midi).filter((c) => c.corde === corde).map(({ corde: co, position: p, doigt }) => ({ corde: co, position: p, doigt }));
}
