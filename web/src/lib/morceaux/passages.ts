// Découpage d'un morceau en passages et compétences demandées par chacun : positions,
// démanchés, tessiture, rythme. Sert à dire ce qui est prêt et ce qu'il faut préparer.

import type { Etat } from '../etat';
import { clesDemanche, clesPosition, TRAJETS } from '../exercices/positions';
import { maitrise } from '../revision';
import type { Doigte } from './doigte';
import type { MesureMorceau, NoteMorceau } from './partition';

export interface Passage {
  n: number;
  /** Mesures de début et de fin, incluses. */
  de: number;
  a: number;
  /** Indices des notes (début inclus, fin exclue). */
  debutNote: number;
  finNote: number;
}

/** Coupe toutes les `taille` mesures, ou aux mesures choisies par l'utilisateur. */
export function decouper(mesures: MesureMorceau[], notes: NoteMorceau[], coupures?: number[], taille = 4): Passage[] {
  const total = mesures.length;
  if (!total) return [];
  let debuts = coupures?.length ? [...new Set([1, ...coupures])].filter((m) => m >= 1 && m <= total).sort((a, b) => a - b) : [];
  if (!debuts.length) for (let m = 1; m <= total; m += taille) debuts.push(m);
  // Une dernière tranche trop courte rejoint la précédente.
  if (!coupures?.length && debuts.length > 1 && total - debuts[debuts.length - 1]! + 1 < Math.ceil(taille / 2)) debuts = debuts.slice(0, -1);
  return debuts.map((de, k) => {
    const a = (debuts[k + 1] ?? total + 1) - 1;
    const debutNote = notes.findIndex((x) => x.mesure >= de);
    const apres = notes.findIndex((x) => x.mesure > a);
    return { n: k, de, a, debutNote: debutNote < 0 ? notes.length : debutNote, finNote: apres < 0 ? notes.length : apres };
  });
}

export interface Competence {
  cle: string;
  libelle: string;
  /** Lien vers l'exercice qui la travaille. */
  lien: string;
  cles: string[];
}

const idExercice = (pos: string) => (pos.startsWith('P') ? 'pouce' : pos);
const nomPos = (pos: string) =>
  pos.startsWith('P') ? 'pouce' : pos === 'demi' ? '½ pos.' : pos === '1' ? '1re pos.' : `${pos}e pos.`;
const court = (pos: string) => (pos.startsWith('P') ? 'P' : pos === 'demi' ? '½' : pos);

/** Ce que demande un passage, avec les clés d'exercices qui permettent de le préparer. */
export function competencesDe(p: Passage, doigtes: Doigte[]): Competence[] {
  const out = new Map<string, Competence>();
  let prec: string | null = null;
  for (let i = p.debutNote; i < p.finNote; i++) {
    const pos = doigtes[i]?.position;
    if (!pos) continue; // corde à vide
    const id = idExercice(pos);
    if (!out.has(`pos:${id}`)) {
      out.set(`pos:${id}`, { cle: `pos:${id}`, libelle: `Notes en ${nomPos(pos)}`, lien: `#/positions/nom/${id}`, cles: clesPosition(id) });
    }
    if (prec && prec !== id) {
      const sens = TRAJETS.some(([a, b]) => (a === prec && b === id) || (a === id && b === prec));
      const k = `dem:${[prec, id].sort().join('-')}`;
      if (sens && !out.has(k)) {
        out.set(k, { cle: k, libelle: `Démanché ${court(prec)} ↔ ${court(id)}`, lien: `#/positions/demanche/${prec}-${id}`, cles: clesDemanche(prec, id) });
      }
    }
    prec = id;
  }
  return [...out.values()];
}

export interface Preparation {
  /** 0 → 100 : maîtrise de la compétence la plus faible. */
  pret: number;
  aTravailler: (Competence & { maitrise: number })[];
}

/** Seuil à partir duquel une compétence est jugée suffisante pour aborder le passage. */
export const SEUIL_PRET = 60;

export function preparation(etat: Etat, comps: Competence[]): Preparation {
  const m = comps.map((c) => ({ ...c, maitrise: maitrise(etat, c.cles, 2) }));
  return {
    pret: m.length ? Math.min(...m.map((x) => x.maitrise)) : 100,
    aTravailler: m.filter((x) => x.maitrise < SEUIL_PRET).sort((a, b) => a.maitrise - b.maitrise),
  };
}

export const NIVEAUX = ['À découvrir', 'Lent, sûr', 'Au tempo', 'Mémorisé'] as const;

/** Repères chiffrés d'un passage : tessiture, note la plus brève, nombre de démanchés. */
export function reperesDe(p: Passage, notes: NoteMorceau[], doigtes: Doigte[]) {
  const ns = notes.slice(p.debutNote, p.finNote);
  let demanches = 0;
  let prec: string | null = null;
  for (let i = p.debutNote; i < p.finNote; i++) {
    const pos = doigtes[i]?.position;
    if (!pos) continue;
    if (prec && pos !== prec) demanches++;
    prec = pos;
  }
  return {
    notes: ns.length,
    grave: ns.length ? Math.min(...ns.map((x) => x.midi)) : 0,
    aigu: ns.length ? Math.max(...ns.map((x) => x.midi)) : 0,
    plusBreve: ns.length ? Math.min(...ns.map((x) => x.duree)) : 0,
    demanches,
  };
}
