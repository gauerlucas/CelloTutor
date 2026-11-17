// Catalogue des morceaux fournis avec l'appli, plus ceux que l'utilisateur importe.
// Aucun morceau n'est central : les objectifs se choisissent, se mettent en pause ou s'abandonnent.

import gluckXml from '../../../contenu/morceaux/gluck-melodie/partition.musicxml?raw';
import gluckDoigtes from '../../../contenu/morceaux/gluck-melodie/doigtes.json';
import faureXml from '../../../contenu/morceaux/faure-apres-un-reve/partition.musicxml?raw';
import type { Etat } from './etat';
import type { DoigteFourni } from './morceaux/doigte';

export interface Conseil {
  t: string;
  txt: string;
  dark?: boolean;
}

export interface FicheMorceau {
  id: string;
  titre: string;
  compositeur: string;
  tonalite: string;
  source: string;
  xml: string;
  /** Doigtés vérifiés, un par note attaquée (sinon doigté calculé). */
  doigtes?: DoigteFourni[];
  /** Conseils par mesure (numéro de mesure → conseil). */
  conseils?: Record<string, Conseil>;
  importe?: boolean;
}

export const CATALOGUE: FicheMorceau[] = [
  {
    id: 'gluck-melodie',
    titre: 'Mélodie (Danse des Esprits bienheureux)',
    compositeur: 'C. W. Gluck',
    tonalite: 'Ré mineur',
    source: 'Version de l’enregistrement de Camille Thomas, doigtés vérifiés',
    xml: gluckXml,
    doigtes: gluckDoigtes.doigtes as DoigteFourni[],
    conseils: gluckDoigtes.conseils as Record<string, Conseil>,
  },
  {
    id: 'faure-apres-un-reve',
    titre: 'Après un rêve, op. 7 nº 1',
    compositeur: 'G. Fauré',
    tonalite: 'Do mineur',
    source: 'Ligne de chant, édition Choudens 1880 (Mutopia, domaine public), à la hauteur écrite. Doigté calculé, à corriger à ta main.',
    xml: faureXml,
  },
];

/** Fiche d'un morceau, qu'il soit fourni ou importé. */
export function ficheMorceau(id: string, etat?: Etat): FicheMorceau | undefined {
  const f = CATALOGUE.find((m) => m.id === id);
  if (f || !etat) return f;
  const imp = etat.importes[id];
  return imp ? { id, titre: imp.titre, compositeur: imp.compositeur, tonalite: '', source: 'Importé', xml: imp.xml, importe: true } : undefined;
}

export const tousLesMorceaux = (etat: Etat): FicheMorceau[] =>
  [...CATALOGUE, ...Object.keys(etat.importes).map((id) => ficheMorceau(id, etat)!)];
