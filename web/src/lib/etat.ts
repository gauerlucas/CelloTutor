// Modèle de données de CelloTutor et règles pures (sans navigateur ni réseau),
// pour pouvoir les tester facilement.

export const VERSION_ETAT = 1;

export type Theme = 'auto' | 'clair' | 'sombre';
export type NomsNotes = 'latin' | 'anglo';

export interface Reglages {
  theme: Theme;
  /** Agrandissement du texte pour lire de loin, au pupitre (1 = normal). */
  taillePupitre: 1 | 1.2 | 1.4;
  nomsNotes: NomsNotes;
  volume: number; // 0 → 1
  dureeParDefaut: number; // minutes
}

/** État de répétition espacée d'un exercice (boîtes 0 → 5, comme dans l'ébauche B). */
export interface ItemRevision {
  boite: number;
  vus: number;
  erreurs: number;
  tempsMoyenMs: number;
  echeance: number; // horodatage ms
  dernier: number; // horodatage ms
}

export type EtatObjectif = 'actif' | 'pause' | 'abandonne';

export interface Objectif {
  morceauId: string;
  etat: EtatObjectif;
  depuis: number;
}

export interface Seance {
  id: string;
  debut: number;
  dureePrevueMin: number;
  dureeReelleMin: number;
  energie: 'fatigue' | 'normal' | 'forme';
  blocs: { id: string; titre: string; minutes: number; fait: boolean; cible?: string; type?: string }[];
  ressenti?: 1 | 2 | 3;
}

export interface Jour {
  minutes: number;
  reponses: number;
  justes: number;
  msTotal: number;
}

export interface DoigteNote {
  corde: number;
  position: string;
  doigt: string;
}

/** Ce que l'utilisateur a ajusté ou évalué sur un morceau. */
export interface EtatMorceau {
  /** Doigtés corrigés à la main, par indice de note jouée. */
  doigtes: Record<number, DoigteNote>;
  /** Numéros des mesures qui commencent un passage (sinon découpage automatique par 4). */
  coupures?: number[];
  /** Niveau atteint par passage : 0 découvert, 1 lent, 2 au tempo, 3 mémorisé. */
  passages: Record<number, number>;
  tempo?: number;
  cle?: 'fa' | 'ut' | 'sol' | 'origine';
}

export interface MorceauImporte {
  titre: string;
  compositeur: string;
  xml: string;
  ajouteLe: number;
}

export interface Etat {
  version: number;
  majLe: number; // horodatage de la dernière modification
  reglages: Reglages;
  items: Record<string, ItemRevision>;
  records: Record<string, { valeur: number; le: number }>;
  jours: Record<string, Jour>;
  objectifs: Objectif[];
  seances: Seance[];
  morceaux: Record<string, EtatMorceau>;
  importes: Record<string, MorceauImporte>;
}

export const REGLAGES_DEFAUT: Reglages = {
  theme: 'auto',
  taillePupitre: 1,
  nomsNotes: 'latin',
  volume: 0.6,
  dureeParDefaut: 60,
};

export function etatInitial(maintenant = Date.now()): Etat {
  return {
    version: VERSION_ETAT,
    majLe: maintenant,
    reglages: { ...REGLAGES_DEFAUT },
    items: {},
    records: {},
    jours: {},
    morceaux: {},
    importes: {},
    objectifs: [
      { morceauId: 'gluck-melodie', etat: 'actif', depuis: maintenant },
      { morceauId: 'faure-apres-un-reve', etat: 'actif', depuis: maintenant },
    ],
    seances: [],
  };
}

function estObjet(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

/**
 * Remet d'aplomb un état lu sur disque ou dans le navigateur : version ancienne,
 * champs manquants, fichier abîmé. Ne lève jamais d'erreur ; renvoie null si
 * le contenu n'est pas du tout un état CelloTutor.
 */
export function normaliser(brut: unknown): Etat | null {
  if (!estObjet(brut) || typeof brut.version !== 'number') return null;
  if (brut.version > VERSION_ETAT) return null; // créé par une version plus récente : ne pas l'écraser
  const base = etatInitial(0);
  const reglages = estObjet(brut.reglages) ? brut.reglages : {};
  const r: Reglages = { ...REGLAGES_DEFAUT };
  if (reglages.theme === 'auto' || reglages.theme === 'clair' || reglages.theme === 'sombre') r.theme = reglages.theme;
  if (reglages.taillePupitre === 1 || reglages.taillePupitre === 1.2 || reglages.taillePupitre === 1.4) r.taillePupitre = reglages.taillePupitre;
  if (reglages.nomsNotes === 'latin' || reglages.nomsNotes === 'anglo') r.nomsNotes = reglages.nomsNotes;
  if (typeof reglages.volume === 'number' && reglages.volume >= 0 && reglages.volume <= 1) r.volume = reglages.volume;
  if (typeof reglages.dureeParDefaut === 'number' && reglages.dureeParDefaut >= 5 && reglages.dureeParDefaut <= 240) r.dureeParDefaut = reglages.dureeParDefaut;
  return {
    version: VERSION_ETAT,
    majLe: typeof brut.majLe === 'number' ? brut.majLe : 0,
    reglages: r,
    items: estObjet(brut.items) ? (brut.items as Record<string, ItemRevision>) : {},
    records: estObjet(brut.records) ? (brut.records as Etat['records']) : {},
    jours: estObjet(brut.jours) ? (brut.jours as Record<string, Jour>) : {},
    morceaux: estObjet(brut.morceaux) ? (brut.morceaux as Record<string, EtatMorceau>) : {},
    importes: estObjet(brut.importes) ? (brut.importes as Record<string, MorceauImporte>) : {},
    objectifs: Array.isArray(brut.objectifs) ? (brut.objectifs as Objectif[]) : base.objectifs,
    seances: Array.isArray(brut.seances) ? (brut.seances as Seance[]) : [],
  };
}

/**
 * Choisit entre la copie du navigateur et celle du dossier : la plus récente gagne,
 * le dossier gagne en cas d'égalité (c'est la copie de référence).
 */
export function choisirPlusRecent(navigateur: Etat | null, dossier: Etat | null): Etat | null {
  if (!navigateur) return dossier;
  if (!dossier) return navigateur;
  return navigateur.majLe > dossier.majLe ? navigateur : dossier;
}
