// Navigation par l'adresse (#/positions…), qui fonctionne aussi en ouvrant le fichier directement.

export interface Route {
  id: string;
  titre: string;
  resume: string;
  /**
   * Largeur de la page. « pleine » (par défaut) occupe tout l'écran : au pupitre, on veut
   * voir partition, manche et consignes ensemble, sans défiler ni changer de page.
   * « etroite » garde une colonne centrée pour les pages courtes (accueil, réglages).
   */
  largeur?: 'pleine' | 'etroite';
}

export const ROUTES: Route[] = [
  { id: 'aujourdhui', titre: "Aujourd'hui", resume: 'La séance du jour, construite selon ton temps et ton énergie.', largeur: 'etroite' },
  { id: 'positions', titre: 'Positions', resume: 'Cartographie du manche de la ½ à la 7ᵉ position, nom des notes sous les doigts, démanchés.' },
  { id: 'morceaux', titre: 'Morceaux', resume: 'Bibliothèque, morceaux-objectifs, lecteur avec partition, son, boucle et manche synchronisé.' },
  { id: 'lecture', titre: 'Lecture', resume: 'Lire vite en clé de fa, puis d’ut et de sol, par repères et par écarts.' },
  { id: 'gammes', titre: 'Gammes', resume: 'Gammes et arpèges sur bourdon, avec la justesse mesurée au micro.' },
  { id: 'oreille', titre: 'Oreille', resume: 'Cordes à vide, justesse en cents, imaginer la note avant de la jouer.' },
  { id: 'progression', titre: 'Progression', resume: 'Journal des séances, ceintures de maîtrise, records et courbes.' },
  { id: 'reglages', titre: 'Réglages', resume: 'Affichage, son, sauvegarde.', largeur: 'etroite' },
];

export function routeDepuisHash(hash: string): Route {
  const id = hash.replace(/^#\/?/, '').split(/[/?]/)[0] ?? '';
  return ROUTES.find((r) => r.id === id) ?? ROUTES[0]!;
}

/** Ce qui suit la section dans l'adresse : #/morceaux/gluck-melodie → ['gluck-melodie']. */
export function parametresDepuisHash(hash: string): string[] {
  return hash.replace(/^#\/?/, '').split('?')[0]!.split('/').slice(1).filter(Boolean).map(decodeURIComponent);
}

type ModePositions = 'explorer' | 'nom' | 'trouve' | 'demanche';

/** #/positions/nom/4 ou #/positions/demanche/1-4 → réglages d'ouverture de la page Positions. */
export function paramsPositions(p: string[]): { modeInitial?: ModePositions; posInitiale?: string; trajetInitial?: [string, string] | null } {
  const modes: ModePositions[] = ['explorer', 'nom', 'trouve', 'demanche'];
  const mode = modes.find((m) => m === p[0]);
  if (!mode) return {};
  if (mode === 'demanche') {
    const t = p[1]?.split('-');
    return { modeInitial: mode, trajetInitial: t?.length === 2 ? [t[0]!, t[1]!] : null };
  }
  return p[1] ? { modeInitial: mode, posInitiale: p[1] } : { modeInitial: mode };
}

/** Premier paramètre de l'adresse s'il fait partie des valeurs permises, sinon la valeur par défaut. */
export function modeDe<const T extends string>(p: string | undefined, permis: readonly T[], defaut: NoInfer<T>): T {
  return permis.find((m) => m === p) ?? defaut;
}
