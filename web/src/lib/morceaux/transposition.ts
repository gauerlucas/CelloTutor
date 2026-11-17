// Transposition d'une partition MusicXML : hauteurs, armure et altérations accidentelles
// réécrites, pour jouer un morceau plus grave (plus près de la 1re position) ou plus aigu.

import { DEMITONS } from '../musique/notes';
import { lireXml } from './partition';
import { courtPosition, doigterAuto } from './doigte';
import { position } from '../musique/violoncelle';

const LETTRES = 'CDEFGAB';

/** Pour chaque nombre de demi-tons (0–11), les écritures possibles : [degrés diatoniques, quintes ajoutées à l'armure]. */
const INTERVALLES: [number, number][][] = [
  [[0, 0]],
  [[1, -5], [0, 7]], // seconde mineure, unisson augmenté
  [[1, 2]],
  [[2, -3], [1, 9]],
  [[2, 4]],
  [[3, -1]],
  [[3, 6], [4, -6]], // quarte augmentée, quinte diminuée
  [[4, 1]],
  [[5, -4], [4, 8]],
  [[5, 3]],
  [[6, -2]],
  [[6, 5], [7, -7]],
];

/** Choisit l'écriture de l'intervalle qui donne l'armure la plus simple. */
export function intervalle(demiTons: number, quintes: number): { degres: number; quintes: number } {
  const oct = Math.floor(demiTons / 12), r = ((demiTons % 12) + 12) % 12;
  const [d, q] = [...INTERVALLES[r]!].sort((a, b) => Math.abs(quintes + a[1]) - Math.abs(quintes + b[1]))[0]!;
  return { degres: d + 7 * oct, quintes: q };
}

const enfant = (el: Element, nom: string) => Array.from(el.children).find((c) => c.localName === nom) ?? null;
const enfants = (el: Element, nom: string) => Array.from(el.children).filter((c) => c.localName === nom);

function fixer(doc: Document, parent: Element, nom: string, valeur: string | null, avant: string[] = []) {
  let el = enfant(parent, nom);
  if (valeur == null) {
    if (el) parent.removeChild(el);
    return;
  }
  if (!el) {
    el = doc.createElement(nom);
    const ref = Array.from(parent.children).find((c) => avant.includes(c.localName)) ?? null;
    parent.insertBefore(el, ref);
  }
  el.textContent = valeur;
}

/** Altération portée par l'armure pour une lettre (−1, 0, +1). */
export function alterationArmure(quintes: number, L: number): number {
  const DIESES = [3, 0, 4, 1, 5, 2, 6]; // fa do sol ré la mi si
  const BEMOLS = [6, 2, 5, 1, 4, 0, 3]; // si mi la ré sol do fa
  if (quintes > 0) return DIESES.slice(0, quintes).includes(L) ? 1 : 0;
  if (quintes < 0) return BEMOLS.slice(0, -quintes).includes(L) ? -1 : 0;
  return 0;
}

// Éléments d'une <note> qui suivent <accidental> (l'ordre du schéma MusicXML est strict).
const APRES_ALTERATION = ['time-modification', 'stem', 'notehead', 'notehead-text', 'staff', 'beam', 'notations', 'lyric', 'play', 'listen'];

const NOM_ALTERATION: Record<string, string> = { '-2': 'flat-flat', '-1': 'flat', '0': 'natural', '1': 'sharp', '2': 'double-sharp' };

/** Réécrit les altérations accidentelles d'après l'armure et la mémoire de la mesure. */
export function poserAlterations(doc: Document): void {
  const parties = Array.from(doc.documentElement.children).filter((c) => c.localName === 'part');
  for (const part of parties) {
    let quintes = 0;
    for (const m of enfants(part, 'measure')) {
      const memoire = new Map<string, number>();
      for (const el of Array.from(m.children)) {
        if (el.localName === 'attributes') {
          const k = enfant(el, 'key');
          const f = k ? enfant(k, 'fifths') : null;
          if (f) quintes = Number(f.textContent) || 0;
          continue;
        }
        if (el.localName !== 'note') continue;
        const p = enfant(el, 'pitch');
        if (!p) continue;
        const L = LETTRES.indexOf(enfant(p, 'step')?.textContent ?? 'C');
        const oct = enfant(p, 'octave')?.textContent ?? '4';
        const alter = Math.round(Number(enfant(p, 'alter')?.textContent ?? 0));
        const cle = `${L}${oct}`;
        const attendu = memoire.get(cle) ?? alterationArmure(quintes, L);
        const lieeAvant = enfants(el, 'tie').some((t) => t.getAttribute('type') === 'stop');
        const visible = alter !== attendu && !lieeAvant;
        memoire.set(cle, alter);
        if (visible) fixer(doc, el, 'accidental', NOM_ALTERATION[String(alter)] ?? null, APRES_ALTERATION);
        else fixer(doc, el, 'accidental', null);
      }
    }
  }
}

/**
 * Transpose une partition de `demiTons` (négatif = plus grave). Les doigtés écrits sont retirés :
 * ils ne valent plus pour les nouvelles hauteurs (l'appli en recalcule).
 */
export function transposerXml(xml: string, demiTons: number): string {
  if (!demiTons) return xml;
  const doc = lireXml(xml);
  const premiereArmure = doc.getElementsByTagName('fifths')[0];
  const q0 = premiereArmure ? Number(premiereArmure.textContent) || 0 : 0;
  const iv = intervalle(demiTons, q0);
  for (const f of Array.from(doc.getElementsByTagName('fifths'))) {
    let q = (Number(f.textContent) || 0) + iv.quintes;
    if (q > 7) q -= 12;
    if (q < -7) q += 12;
    f.textContent = String(q);
  }
  for (const p of Array.from(doc.getElementsByTagName('pitch'))) {
    const L = LETTRES.indexOf(enfant(p, 'step')?.textContent ?? 'C');
    const oct = Number(enfant(p, 'octave')?.textContent ?? 4);
    const alter = Number(enfant(p, 'alter')?.textContent ?? 0);
    const midi = 12 * (oct + 1) + DEMITONS[L]! + alter + demiTons;
    const d = L + 7 * oct + iv.degres;
    const nL = ((d % 7) + 7) % 7, nOct = Math.floor(d / 7);
    const nAlter = midi - (12 * (nOct + 1) + DEMITONS[nL]!);
    fixer(doc, p, 'step', LETTRES[nL]!);
    fixer(doc, p, 'alter', nAlter ? String(nAlter) : null, ['octave']);
    fixer(doc, p, 'octave', String(nOct));
  }
  for (const t of Array.from(doc.getElementsByTagName('technical'))) {
    for (const c of Array.from(t.children)) if (c.localName === 'fingering' || c.localName === 'string') t.removeChild(c);
  }
  poserAlterations(doc);
  return new XMLSerializer().serializeToString(doc);
}

export interface ChoixTransposition {
  demiTons: number;
  libelle: string;
}

/** Les transpositions proposées, de l'octave en dessous à la quarte au-dessus. */
export const TRANSPOSITIONS: ChoixTransposition[] = [
  { demiTons: -12, libelle: 'Une octave plus bas' },
  { demiTons: -10, libelle: 'Septième mineure plus bas' },
  { demiTons: -9, libelle: 'Sixte majeure plus bas' },
  { demiTons: -8, libelle: 'Sixte mineure plus bas' },
  { demiTons: -7, libelle: 'Quinte plus bas' },
  { demiTons: -5, libelle: 'Quarte plus bas' },
  { demiTons: -4, libelle: 'Tierce majeure plus bas' },
  { demiTons: -3, libelle: 'Tierce mineure plus bas' },
  { demiTons: -2, libelle: 'Un ton plus bas' },
  { demiTons: -1, libelle: 'Un demi-ton plus bas' },
  { demiTons: 0, libelle: 'Hauteur d’origine' },
  { demiTons: 1, libelle: 'Un demi-ton plus haut' },
  { demiTons: 2, libelle: 'Un ton plus haut' },
  { demiTons: 3, libelle: 'Tierce mineure plus haut' },
  { demiTons: 5, libelle: 'Quarte plus haut' },
];

export interface Suggestion {
  demiTons: number;
  /** Position la plus haute utilisée par le doigté calculé (libellé court). */
  plusHaute: string;
  /** Part des notes jouées au-delà de la 4e position (0 → 100). */
  aigues: number;
}

/**
 * Cherche la transposition qui garde le morceau le plus près des premières positions, sans
 * descendre sous le do grave. Les petites transpositions sont préférées à égalité.
 */
export function suggererTransposition(notes: { midi: number; duree: number }[]): Suggestion[] {
  const grave = Math.min(...notes.map((n) => n.midi));
  const ffDe = (p: string) => (p.startsWith('P') ? Number(p.slice(1)) : position(p)?.ff ?? 0);
  return TRANSPOSITIONS.filter((t) => grave + t.demiTons >= 36)
    .map((t) => {
      const d = doigterAuto(notes.map((n) => ({ midi: n.midi + t.demiTons, duree: n.duree })));
      const ffs = d.map((x) => (x.position ? ffDe(x.position) : 0));
      const aigues = Math.round((100 * ffs.filter((f) => f > 7).length) / notes.length);
      const max = d.reduce((m, x) => (x.position && ffDe(x.position) > ffDe(m) ? x.position : m), 'demi');
      const cout = ffs.reduce((s, f) => s + (f > 12 ? 3 : f > 7 ? 1 : 0), 0) / notes.length + Math.abs(t.demiTons) * 0.004;
      return { demiTons: t.demiTons, plusHaute: courtPosition(max), aigues, cout };
    })
    .sort((a, b) => a.cout - b.cout)
    .map(({ demiTons, plusHaute, aigues }) => ({ demiTons, plusHaute, aigues }));
}
