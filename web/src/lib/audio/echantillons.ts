// Son réaliste : échantillons de violoncelle enregistrés (pack Freesound « real cello notes »),
// une note sur deux ou trois ; les notes manquantes sont obtenues en transposant l'échantillon le
// plus proche (lecture accélérée ou ralentie), et les notes longues bouclent sur la partie tenue.

export interface Echantillon {
  midi: number;
  /** Fichier dans src/sons/violoncelle/. */
  fichier: string;
  /** Boucle sur la partie tenue (secondes), préparée sans clic. */
  boucle: [number, number];
  /** Gain pour égaliser les volumes. */
  gain: number;
  /** Écart de justesse de l'enregistrement (cents), corrigé à la lecture. */
  cents?: number;
}

const FICHIERS = import.meta.glob('../../sons/violoncelle/*.mp3', { query: '?url', import: 'default', eager: true }) as Record<string, string>;
const MANIFESTE = import.meta.glob('../../sons/violoncelle/index.json', { import: 'default', eager: true }) as Record<string, Echantillon[]>;

export const LISTE: Echantillon[] = Object.values(MANIFESTE)[0] ?? [];

const urlDe = (fichier: string) => Object.entries(FICHIERS).find(([k]) => k.endsWith('/' + fichier))?.[1];

export interface Charge extends Echantillon {
  buffer: AudioBuffer;
}

let charges: Charge[] = [];
let enCours: Promise<void> | null = null;

/** Échantillons disponibles dans cette version de l'appli. */
export const echantillonsPresents = () => LISTE.length > 0;
/** Échantillons décodés et prêts à jouer. */
export const echantillonsPrets = () => charges.length > 0;

/** Décode les échantillons (une fois) ; sans effet s'il n'y en a pas. */
export function chargerEchantillons(c: BaseAudioContext): Promise<void> {
  if (enCours) return enCours;
  enCours = (async () => {
    const out: Charge[] = [];
    for (const e of LISTE) {
      const url = urlDe(e.fichier);
      if (!url) continue;
      try {
        const brut = await (await fetch(url)).arrayBuffer();
        out.push({ ...e, buffer: await c.decodeAudioData(brut) });
      } catch {
        /* échantillon illisible : on s'en passe */
      }
    }
    charges = out.sort((a, b) => a.midi - b.midi);
  })();
  return enCours;
}

/**
 * Choisit l'échantillon pour une note : le plus proche ; à égale distance, l'échantillon plus
 * grave joué un peu plus vite (comme la répartition habituelle des échantillonneurs).
 */
export function choisir<T extends { midi: number }>(liste: T[], m: number): T | null {
  let meilleur: T | null = null, score = Infinity;
  for (const e of liste) {
    const d = m - e.midi;
    const s = Math.abs(d) + (d < 0 ? 0.25 : 0);
    if (s < score) {
      score = s;
      meilleur = e;
    }
  }
  return meilleur;
}

/** Programme une note échantillonnée ; renvoie false si aucun échantillon n'est prêt. */
export function jouerEchantillon(c: AudioContext, sortie: AudioNode, m: number, t: number, duree: number, force: number): boolean {
  const e = choisir(charges, m);
  if (!e) return false;
  const src = c.createBufferSource();
  src.buffer = e.buffer;
  const vitesse = Math.pow(2, (m - e.midi - (e.cents ?? 0) / 100) / 12);
  src.playbackRate.value = vitesse;
  const [d, f] = e.boucle;
  const longueur = e.buffer.duration / vitesse;
  if (duree + 0.3 > longueur && f > d + 0.1) {
    src.loop = true;
    src.loopStart = d;
    src.loopEnd = f;
  }
  const g = c.createGain();
  const a = e.gain * (0.55 + 0.45 * force);
  const fin = t + duree;
  // Les attaques enregistrées sont gardées ; la fin est un relâché d'archet court.
  g.gain.setValueAtTime(a, t);
  g.gain.setValueAtTime(a, Math.max(t + 0.02, fin - 0.04));
  g.gain.exponentialRampToValueAtTime(0.0001, fin + 0.22);
  src.connect(g);
  g.connect(sortie);
  src.start(t);
  src.stop(fin + 0.3);
  return true;
}
