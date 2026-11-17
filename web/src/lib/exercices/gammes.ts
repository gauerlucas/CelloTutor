// Gammes et arpèges : catalogue progressif, notes, doigtés (calculés comme pour un morceau)
// et choix de la gamme du jour d'après les morceaux-objectifs.

import { deMidi, type Note } from '../musique/notes';
import { doigterAuto, type Doigte } from '../morceaux/doigte';

export type ModeGamme = 'majeur' | 'mineur';

export interface Gamme {
  id: string;
  nom: string;
  mode: ModeGamme;
  /** Note de départ la plus grave jouable (midi). */
  depart: number;
  /** Armure en quintes (-1 = un bémol). */
  quintes: number;
  /** Ordre d'apprentissage. */
  rang: number;
}

// Mineur : forme mélodique en montant, naturelle en descendant (usage courant au violoncelle).
export const GAMMES: Gamme[] = [
  { id: 'do-majeur', nom: 'Do majeur', mode: 'majeur', depart: 36, quintes: 0, rang: 1 },
  { id: 'sol-majeur', nom: 'Sol majeur', mode: 'majeur', depart: 43, quintes: 1, rang: 2 },
  { id: 're-majeur', nom: 'Ré majeur', mode: 'majeur', depart: 38, quintes: 2, rang: 3 },
  { id: 'fa-majeur', nom: 'Fa majeur', mode: 'majeur', depart: 41, quintes: -1, rang: 4 },
  { id: 'la-mineur', nom: 'La mineur', mode: 'mineur', depart: 45, quintes: 0, rang: 5 },
  { id: 're-mineur', nom: 'Ré mineur', mode: 'mineur', depart: 38, quintes: -1, rang: 6 },
  { id: 'sib-majeur', nom: 'Si♭ majeur', mode: 'majeur', depart: 46, quintes: -2, rang: 7 },
  { id: 'la-majeur', nom: 'La majeur', mode: 'majeur', depart: 45, quintes: 3, rang: 8 },
  { id: 'mi-mineur', nom: 'Mi mineur', mode: 'mineur', depart: 40, quintes: 1, rang: 9 },
  { id: 'sol-mineur', nom: 'Sol mineur', mode: 'mineur', depart: 43, quintes: -2, rang: 10 },
  { id: 'do-mineur', nom: 'Do mineur', mode: 'mineur', depart: 36, quintes: -3, rang: 11 },
  { id: 'mib-majeur', nom: 'Mi♭ majeur', mode: 'majeur', depart: 39, quintes: -3, rang: 12 },
  { id: 'mi-majeur', nom: 'Mi majeur', mode: 'majeur', depart: 40, quintes: 4, rang: 13 },
  { id: 'si-mineur', nom: 'Si mineur', mode: 'mineur', depart: 47, quintes: 2, rang: 14 },
  { id: 'fa-mineur', nom: 'Fa mineur', mode: 'mineur', depart: 41, quintes: -4, rang: 15 },
];

export const gamme = (id: string) => GAMMES.find((g) => g.id === id);

const MAJEURE = [0, 2, 4, 5, 7, 9, 11];
const MELODIQUE = [0, 2, 3, 5, 7, 9, 11];
const NATURELLE = [0, 2, 3, 5, 7, 8, 10];

export interface NoteGamme {
  midi: number;
  note: Note;
}

/** Les notes de la gamme, montée puis descente, sur une à trois octaves. */
export function notesGamme(g: Gamme, octaves: 1 | 2 | 3 = 2): NoteGamme[] {
  const montee: number[] = [], descente: number[] = [];
  const haut = g.mode === 'majeur' ? MAJEURE : MELODIQUE;
  const bas = g.mode === 'majeur' ? MAJEURE : NATURELLE;
  for (let o = 0; o < octaves; o++) for (const d of haut) montee.push(g.depart + 12 * o + d);
  montee.push(g.depart + 12 * octaves);
  for (let o = octaves - 1; o >= 0; o--) for (let k = bas.length - 1; k >= 0; k--) descente.push(g.depart + 12 * o + bas[k]!);
  const epeler = (m: number, montant: boolean) => {
    // En mineur, les 6e et 7e degrés hauts s'écrivent avec dièse/bécarre, pas avec la note voisine.
    const n = deMidi(m, g.quintes);
    if (g.mode === 'mineur' && montant) {
      const deg = (((m - g.depart) % 12) + 12) % 12;
      if (deg === 9 || deg === 11) {
        const nat = deMidi(m - 1, g.quintes);
        if (nat.acc < 1) return { ...nat, acc: nat.acc + 1 };
      }
    }
    return n;
  };
  return [...montee.map((m) => ({ midi: m, note: epeler(m, true) })), ...descente.map((m) => ({ midi: m, note: epeler(m, false) }))];
}

/** Arpège de la tonique (1-3-5-8) sur le nombre d'octaves voulu, montée et descente. */
export function notesArpege(g: Gamme, octaves: 1 | 2 | 3 = 2): NoteGamme[] {
  const acc = g.mode === 'majeur' ? [0, 4, 7] : [0, 3, 7];
  const m: number[] = [];
  for (let o = 0; o < octaves; o++) for (const d of acc) m.push(g.depart + 12 * o + d);
  m.push(g.depart + 12 * octaves);
  const tout = [...m, ...m.slice(0, -1).reverse()];
  return tout.map((x) => ({ midi: x, note: deMidi(x, g.quintes) }));
}

/** Octaves jouables raisonnablement depuis le départ (jusqu'au la aigu de la 7e position). */
export const octavesMax = (g: Gamme): 1 | 2 | 3 => (g.depart + 36 <= 81 ? 3 : 2);

export function doigteGamme(notes: NoteGamme[]): Doigte[] {
  return doigterAuto(notes.map((n) => ({ midi: n.midi, duree: 1 })));
}

/** La gamme qui correspond à une tonalité (tonique en classe de hauteur et mode). */
export function gammeDeTonalite(tonique: number, mode: 'major' | 'minor'): Gamme | undefined {
  const m: ModeGamme = mode === 'minor' ? 'mineur' : 'majeur';
  return GAMMES.find((g) => g.mode === m && g.depart % 12 === tonique);
}

/** Relative majeure ou mineure d'une gamme. */
export function relative(g: Gamme): Gamme | undefined {
  const t = g.mode === 'majeur' ? (g.depart + 9) % 12 : (g.depart + 3) % 12;
  return GAMMES.find((x) => x.mode !== g.mode && x.depart % 12 === t);
}

export const cleGammeJustesse = (id: string) => `G|${id}`;
