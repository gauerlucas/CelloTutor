// Notes, hauteurs et noms. Convention : octave scientifique (C4 = do central = MIDI 60) ;
// les noms affichés suivent l'usage français (Do3 = do central).

export interface Note {
  /** Degré dans la gamme : 0 Do … 6 Si. */
  L: number;
  /** Altération : -1 bémol, 0 naturel, 1 dièse (±2 possible). */
  acc: number;
  /** Octave scientifique. */
  oct: number;
}

export const DEMITONS = [0, 2, 4, 5, 7, 9, 11];
export const NOMS_LATINS = ['Do', 'Ré', 'Mi', 'Fa', 'Sol', 'La', 'Si'];
export const NOMS_ANGLAIS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const LETTRES: Record<string, number> = { C: 0, D: 1, E: 2, F: 3, G: 4, A: 5, B: 6 };

export type StyleNoms = 'latin' | 'anglo';

export function note(texte: string): Note {
  const m = /^([A-G])(#{1,2}|b{1,2})?(-?\d)$/.exec(texte);
  if (!m) throw new Error(`note invalide : ${texte}`);
  const acc = !m[2] ? 0 : m[2][0] === '#' ? m[2].length : -m[2].length;
  return { L: LETTRES[m[1]!]!, acc, oct: Number(m[3]) };
}

export const midi = (n: Note) => 12 * (n.oct + 1) + DEMITONS[n.L]! + n.acc;
export const degre = (n: Note) => n.L + 7 * n.oct;
export const hzDeMidi = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
export const midiDeHz = (f: number) => 69 + 12 * Math.log2(f / 440);
export const deDegre = (d: number, acc = 0): Note => ({ L: ((d % 7) + 7) % 7, oct: Math.floor(d / 7), acc });

/** Écart en cents entre une fréquence jouée et une hauteur MIDI visée. */
export const centsEcart = (f: number, cible: number) => Math.round((midiDeHz(f) - cible) * 100);

/**
 * Épelle une hauteur MIDI. `quintes` = armure (−3 pour trois bémols, +2 pour deux dièses…) :
 * les touches noires sont écrites en bémols dans les tonalités à bémols, en dièses sinon ;
 * sans armure (null), orthographe usuelle.
 */
export function deMidi(m: number, quintes: number | null = null): Note {
  const pc = ((m % 12) + 12) % 12;
  const oct = Math.floor(m / 12) - 1;
  const L = DEMITONS.indexOf(pc);
  if (L >= 0) return { L, acc: 0, oct };
  // Sans armure : l'orthographe la plus courante au violoncelle (do♯, mi♭, fa♯, sol♯, si♭).
  const bemol = quintes == null ? pc === 3 || pc === 10 : quintes < 0;
  if (bemol) return { L: DEMITONS.indexOf(pc + 1), acc: -1, oct };
  return { L: DEMITONS.indexOf(pc - 1), acc: 1, oct };
}

export const symboleAlteration = (a: number) => (a === 1 ? '♯' : a === -1 ? '♭' : a === 2 ? '𝄪' : a === -2 ? '𝄫' : '');
export const motAlteration = (a: number) => (a === 1 ? ' dièse' : a === -1 ? ' bémol' : '');

export function nomNote(n: Note, style: StyleNoms = 'latin', avecOctave = false): string {
  const base = (style === 'anglo' ? NOMS_ANGLAIS : NOMS_LATINS)[n.L]!;
  const oct = avecOctave ? String(style === 'anglo' ? n.oct : n.oct - 1) : '';
  return base + symboleAlteration(n.acc) + oct;
}

/** Nom pour la synthèse vocale ou les phrases : « si bémol ». */
export const nomParle = (n: Note) => NOMS_LATINS[n.L]!.toLowerCase() + motAlteration(n.acc);

/** Deux notes ont-elles le même nom (enharmonie ignorée) ? */
export const memeNom = (a: Note, b: Note) => a.L === b.L && a.acc === b.acc;

export const INTERVALLES = ['unisson', 'seconde', 'tierce', 'quarte', 'quinte', 'sixte', 'septième', 'octave'];
