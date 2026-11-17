// Navigation par l'adresse (#/positions…), qui fonctionne aussi en ouvrant le fichier directement.

export interface Route {
  id: string;
  titre: string;
  /** Étape du plan où la section arrive (affichée tant qu'elle n'est pas faite). */
  etape?: string;
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
  { id: 'morceaux', titre: 'Morceaux', etape: 'J2', resume: 'Bibliothèque, morceaux-objectifs, lecteur avec partition, son, boucle et manche synchronisé.' },
  { id: 'lecture', titre: 'Lecture', etape: 'J4', resume: 'Lire vite en clé de fa, puis d’ut et de sol, par repères et par écarts.' },
  { id: 'gammes', titre: 'Gammes', etape: 'J4', resume: 'Gammes et arpèges sur bourdon, avec la justesse mesurée au micro.' },
  { id: 'oreille', titre: 'Oreille', etape: 'J4', resume: 'Cordes à vide, justesse en cents, imaginer la note avant de la jouer.' },
  { id: 'progression', titre: 'Progression', etape: 'J3', resume: 'Journal des séances, ceintures de maîtrise, records et courbes.' },
  { id: 'reglages', titre: 'Réglages', resume: 'Affichage, son, sauvegarde.', largeur: 'etroite' },
];

export function routeDepuisHash(hash: string): Route {
  const id = hash.replace(/^#\/?/, '').split(/[/?]/)[0] ?? '';
  return ROUTES.find((r) => r.id === id) ?? ROUTES[0]!;
}
