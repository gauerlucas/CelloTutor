// Répétition espacée (boîtes 0 → 5) et tirage des exercices, repris de l'ébauche « Atelier ».

import type { Etat, ItemRevision } from './etat';

export const JOURS_PAR_BOITE = [0, 1, 3, 7, 14, 30];
const JOUR = 864e5;
/** Au-delà, une bonne réponse est juste mais pas encore « automatique ». */
export const REPONSE_RAPIDE_MS = 2800;

export function noter(precedent: ItemRevision | undefined, juste: boolean, ms: number, maintenant: number, alea = Math.random()): ItemRevision {
  const x: ItemRevision = precedent ? { ...precedent } : { boite: 0, vus: 0, erreurs: 0, tempsMoyenMs: 0, echeance: 0, dernier: 0 };
  x.vus++;
  x.tempsMoyenMs = x.tempsMoyenMs ? Math.round(x.tempsMoyenMs * 0.7 + ms * 0.3) : ms;
  x.dernier = maintenant;
  if (juste) {
    if (ms < REPONSE_RAPIDE_MS || x.boite === 0) x.boite = Math.min(5, x.boite + 1);
    x.echeance = maintenant + JOURS_PAR_BOITE[x.boite]! * JOUR * (0.85 + alea * 0.3);
  } else {
    x.erreurs++;
    x.boite = Math.max(0, x.boite - 2);
    x.echeance = maintenant;
  }
  return x;
}

/** Note un exercice dans l'état et tient le journal du jour. */
export function enregistrerReponse(etat: Etat, cle: string, juste: boolean, ms: number, maintenant = Date.now()): ItemRevision {
  const it = noter(etat.items[cle], juste, ms, maintenant);
  etat.items[cle] = it;
  const j = jourDe(etat, maintenant);
  j.reponses++;
  if (juste) j.justes++;
  j.msTotal += ms;
  return it;
}

export function cleJour(t: number): string {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function jourDe(etat: Etat, t: number) {
  const k = cleJour(t);
  return (etat.jours[k] ??= { minutes: 0, reponses: 0, justes: 0, msTotal: 0 });
}

export const boiteDe = (etat: Etat, cle: string) => etat.items[cle]?.boite ?? null;

/** Part (0 → 100) des exercices d'une liste arrivés au moins à la boîte `min`. */
export function maitrise(etat: Etat, cles: string[], min = 3): number {
  if (!cles.length) return 0;
  return Math.round((100 * cles.filter((k) => (etat.items[k]?.boite ?? 0) >= min).length) / cles.length);
}

export const nombreDus = (etat: Etat, cles: string[], maintenant = Date.now()) =>
  cles.filter((k) => {
    const x = etat.items[k];
    return x && x.echeance <= maintenant && x.boite < 5;
  }).length;

/** État d'une série d'exercices dans un bloc. */
export interface File {
  dernier: string | null;
  aRevoir: { cle: string; apres: number }[];
  compte: number;
  nouveauxRestants: number;
}

export const nouvelleFile = (nouveaux = 5): File => ({ dernier: null, aRevoir: [], compte: 0, nouveauxRestants: nouveaux });

/**
 * Choisit l'exercice suivant : d'abord une erreur récente (2–3 exercices plus tard),
 * puis ce qui est dû, puis un peu de nouveau, sinon un tirage pondéré vers le moins su.
 */
export function choisir<T extends { cle: string }>(pool: T[], etat: Etat, f: File, maintenant = Date.now(), alea = Math.random): T | null {
  if (!pool.length) return null;
  f.compte++;
  const ri = f.aRevoir.findIndex((r) => f.compte >= r.apres);
  if (ri >= 0) {
    const r = f.aRevoir.splice(ri, 1)[0]!;
    const c = pool.find((p) => p.cle === r.cle);
    if (c && c.cle !== f.dernier) return c;
  }
  const dus = pool.filter((p) => {
    const x = etat.items[p.cle];
    return x && x.echeance <= maintenant && p.cle !== f.dernier;
  });
  if (dus.length) {
    dus.sort((a, b) => etat.items[a.cle]!.boite - etat.items[b.cle]!.boite || alea() - 0.5);
    return dus[0]!;
  }
  const jamais = pool.filter((p) => !etat.items[p.cle] && p.cle !== f.dernier);
  if (jamais.length && f.nouveauxRestants > 0) {
    f.nouveauxRestants--;
    return jamais[Math.floor(alea() * jamais.length)]!;
  }
  const cand = pool.filter((p) => p.cle !== f.dernier);
  const cc = cand.length ? cand : pool;
  const poids = cc.map((p) => {
    const x = etat.items[p.cle];
    return x ? 6 - x.boite + x.erreurs * 0.5 + 0.3 : 2.5;
  });
  let r = alea() * poids.reduce((a, b) => a + b, 0);
  for (let i = 0; i < cc.length; i++) {
    r -= poids[i]!;
    if (r <= 0) return cc[i]!;
  }
  return cc[cc.length - 1]!;
}

export function apresReponse(f: File, cle: string, juste: boolean, alea = Math.random): void {
  f.dernier = cle;
  if (!juste) f.aRevoir.push({ cle, apres: f.compte + 2 + Math.floor(alea() * 2) });
}

/** Garde le meilleur résultat (plus petit si `plusPetitMieux`). Renvoie vrai si c'est un nouveau record. */
export function proposerRecord(etat: Etat, cle: string, valeur: number, plusPetitMieux = true, maintenant = Date.now()): boolean {
  const r = etat.records[cle];
  if (!r || (plusPetitMieux ? valeur < r.valeur : valeur > r.valeur)) {
    etat.records[cle] = { valeur, le: maintenant };
    return true;
  }
  return false;
}
