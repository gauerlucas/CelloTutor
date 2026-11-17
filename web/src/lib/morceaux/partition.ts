// Lecture d'une partition MusicXML (une seule voix, comme une partie de violoncelle) en un
// modèle simple : les notes attaquées, leur temps, leur hauteur, et le doigté écrit s'il y en a.

import { DEMITONS } from '../musique/notes';

export interface NoteMorceau {
  /** Indice parmi les notes attaquées (les liaisons de prolongation sont fusionnées). */
  i: number;
  /** Numéro de mesure (1 = première mesure écrite). */
  mesure: number;
  /** Début et durée en noires depuis le début du morceau. */
  debut: number;
  duree: number;
  midi: number;
  /** Lettre (0 = do … 6 = si) et altération telles qu'écrites. */
  L: number;
  acc: number;
  oct: number;
  doigtEcrit?: string;
  /** Corde écrite, 0 = Do … 3 = La. */
  cordeEcrite?: number;
}

export interface MesureMorceau {
  numero: number;
  debut: number;
  duree: number;
}

export interface Partition {
  titre: string;
  compositeur: string;
  quintes: number;
  mode: 'major' | 'minor';
  temps: number;
  unite: number;
  /** Noires par minute indiquées sur la partition. */
  tempo: number;
  cleOrigine: 'fa' | 'ut' | 'sol';
  mesures: MesureMorceau[];
  notes: NoteMorceau[];
}

const LETTRES = 'CDEFGAB';

const enfant = (el: Element, nom: string) => Array.from(el.children).find((c) => c.localName === nom) ?? null;
const enfants = (el: Element, nom: string) => Array.from(el.children).filter((c) => c.localName === nom);
const texte = (el: Element | null, nom: string) => (el ? enfant(el, nom)?.textContent?.trim() ?? null : null);
const nombre = (el: Element | null, nom: string, defaut: number) => {
  const t = texte(el, nom);
  const n = t == null ? NaN : Number(t);
  return Number.isFinite(n) ? n : defaut;
};

export class ErreurPartition extends Error {}

export function lireXml(xml: string): Document {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new ErreurPartition('Le fichier n’est pas un MusicXML lisible.');
  if (doc.documentElement.localName !== 'score-partwise') {
    throw new ErreurPartition(doc.documentElement.localName === 'score-timewise'
      ? 'Partition « timewise » : exporte-la en MusicXML « partwise » (le format habituel).'
      : 'Ce fichier n’est pas une partition MusicXML.');
  }
  return doc;
}

/** La première partie (`<part>`) du document : CelloTutor travaille une voix à la fois. */
export const premierePartie = (doc: Document) => {
  const p = Array.from(doc.documentElement.children).find((c) => c.localName === 'part');
  if (!p) throw new ErreurPartition('La partition ne contient aucune partie.');
  return p;
};

/** Les éléments `<note>` attaqués (ni silences, ni accords, ni fins de liaison), dans l'ordre. */
export function notesAttaquees(doc: Document): Element[] {
  const out: Element[] = [];
  for (const m of enfants(premierePartie(doc), 'measure')) {
    for (const n of enfants(m, 'note')) {
      if (enfant(n, 'rest') || enfant(n, 'chord') || enfant(n, 'grace') || !enfant(n, 'pitch')) continue;
      if (enfants(n, 'tie').some((t) => t.getAttribute('type') === 'stop')) continue;
      out.push(n);
    }
  }
  return out;
}

export function analyser(xml: string): Partition {
  const doc = lireXml(xml);
  const racine = doc.documentElement;
  const titre = texte(enfant(racine, 'work'), 'work-title') ?? texte(racine, 'movement-title') ?? 'Sans titre';
  const ident = enfant(racine, 'identification');
  const createur = ident ? enfants(ident, 'creator').find((c) => c.getAttribute('type') === 'composer') ?? enfant(ident, 'creator') : null;

  let divisions = 1, quintes = 0, mode: 'major' | 'minor' = 'major', temps = 4, unite = 4, tempo = 0;
  let cleOrigine: Partition['cleOrigine'] | null = null;
  const mesures: MesureMorceau[] = [];
  const notes: NoteMorceau[] = [];
  let t = 0; // en noires
  let derniere: NoteMorceau | null = null;

  enfants(premierePartie(doc), 'measure').forEach((m, k) => {
    const debutMesure = t;
    let curseur = t, fin = t;
    let derniereDuree = 0;
    for (const el of Array.from(m.children)) {
      switch (el.localName) {
        case 'attributes': {
          divisions = nombre(el, 'divisions', divisions);
          const key = enfant(el, 'key');
          if (key) {
            quintes = nombre(key, 'fifths', quintes);
            if (texte(key, 'mode') === 'minor') mode = 'minor';
          }
          const time = enfant(el, 'time');
          if (time) {
            temps = nombre(time, 'beats', temps);
            unite = nombre(time, 'beat-type', unite);
          }
          const clef = enfant(el, 'clef');
          if (clef && !cleOrigine) {
            const s = texte(clef, 'sign');
            cleOrigine = s === 'F' ? 'fa' : s === 'C' ? 'ut' : 'sol';
          }
          break;
        }
        case 'direction': {
          const son = enfant(el, 'sound');
          const tp = son?.getAttribute('tempo');
          if (tp && !tempo) tempo = Number(tp) || 0;
          if (!tempo) {
            for (const dt of enfants(el, 'direction-type')) {
              const metro = enfant(dt, 'metronome');
              if (metro) {
                const unit = texte(metro, 'beat-unit');
                const pm = nombre(metro, 'per-minute', 0);
                const facteur = unit === 'half' ? 2 : unit === 'eighth' ? 0.5 : 1;
                tempo = pm * facteur * (enfant(metro, 'beat-unit-dot') ? 1.5 : 1);
              }
            }
          }
          break;
        }
        case 'backup':
          curseur -= nombre(el, 'duration', 0) / divisions;
          break;
        case 'forward':
          curseur += nombre(el, 'duration', 0) / divisions;
          fin = Math.max(fin, curseur);
          break;
        case 'note': {
          if (enfant(el, 'grace')) break;
          const duree = nombre(el, 'duration', 0) / divisions;
          const voix = texte(el, 'voice');
          if (voix && voix !== '1') {
            // On ne garde que la première voix ; les autres avancent quand même le curseur.
            if (!enfant(el, 'chord')) curseur += duree;
            fin = Math.max(fin, curseur);
            break;
          }
          const accord = !!enfant(el, 'chord');
          const debut = accord ? curseur - derniereDuree : curseur;
          if (!accord) {
            curseur += duree;
            derniereDuree = duree;
          }
          fin = Math.max(fin, curseur);
          const pitch = enfant(el, 'pitch');
          if (enfant(el, 'rest') || !pitch || accord) break; // d'un accord, on ne garde que la première note écrite
          const step = texte(pitch, 'step') ?? 'C';
          const L = Math.max(0, LETTRES.indexOf(step));
          const acc = Math.round(nombre(pitch, 'alter', 0));
          const oct = nombre(pitch, 'octave', 4);
          const midi = 12 * (oct + 1) + DEMITONS[L]! + acc;
          const ties = enfants(el, 'tie').map((x) => x.getAttribute('type'));
          if (ties.includes('stop') && derniere && derniere.midi === midi) {
            derniere.duree += duree;
            break;
          }
          const notations = enfant(el, 'notations');
          const tech = notations ? enfant(notations, 'technical') : null;
          const doigt = tech ? texte(tech, 'fingering') : null;
          const corde = tech ? texte(tech, 'string') : null;
          const n: NoteMorceau = { i: notes.length, mesure: k + 1, debut, duree, midi, L, acc, oct };
          if (doigt) n.doigtEcrit = doigt === 'p' || doigt === '0' ? doigt : doigt.replace(/\D/g, '').slice(0, 1) || undefined;
          if (corde && /^[1-4]$/.test(corde)) n.cordeEcrite = 4 - Number(corde);
          notes.push(n);
          derniere = n;
          break;
        }
      }
    }
    const dureeTheorique = (temps * 4) / unite;
    const duree = fin - debutMesure > 1e-6 ? fin - debutMesure : dureeTheorique;
    mesures.push({ numero: k + 1, debut: debutMesure, duree });
    t = debutMesure + duree;
  });

  if (!notes.length) throw new ErreurPartition('Aucune note trouvée dans la première partie.');
  return {
    titre,
    compositeur: createur?.textContent?.trim() ?? '',
    quintes, mode, temps, unite,
    tempo: tempo || 72,
    cleOrigine: cleOrigine ?? 'fa',
    mesures, notes,
  };
}

/** Tonalité en toutes lettres : « Ré mineur ». */
export function nomTonalite(quintes: number, mode: 'major' | 'minor'): string {
  const majeures = ['Do♭', 'Sol♭', 'Ré♭', 'La♭', 'Mi♭', 'Si♭', 'Fa', 'Do', 'Sol', 'Ré', 'La', 'Mi', 'Si', 'Fa♯', 'Do♯'];
  const mineures = ['La♭', 'Mi♭', 'Si♭', 'Fa', 'Do', 'Sol', 'Ré', 'La', 'Mi', 'Si', 'Fa♯', 'Do♯', 'Sol♯', 'Ré♯', 'La♯'];
  const q = Math.max(-7, Math.min(7, quintes)) + 7;
  return mode === 'minor' ? `${mineures[q]} mineur` : `${majeures[q]} majeur`;
}

/** Tonique (classe de hauteur 0–11) d'une armure. */
export function toniqueDe(quintes: number, mode: 'major' | 'minor'): number {
  const maj = (((quintes * 7) % 12) + 12) % 12;
  return mode === 'minor' ? (maj + 9) % 12 : maj;
}
