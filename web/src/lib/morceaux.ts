// Catalogue des morceaux fournis avec l'appli. Les partitions elles-mêmes arrivent à l'étape J2.

export interface FicheMorceau {
  id: string;
  titre: string;
  compositeur: string;
  tonalite: string;
  source: string;
}

export const CATALOGUE: FicheMorceau[] = [
  {
    id: 'gluck-melodie',
    titre: 'Mélodie (Danse des Esprits bienheureux)',
    compositeur: 'C. W. Gluck',
    tonalite: 'Ré mineur',
    source: 'Version de l’enregistrement de Camille Thomas, doigtés vérifiés',
  },
  {
    id: 'faure-apres-un-reve',
    titre: 'Après un rêve, op. 7 nº 1',
    compositeur: 'G. Fauré',
    tonalite: 'Do mineur',
    source: 'Ligne de chant, édition Choudens 1880 (Mutopia, domaine public)',
  },
];

export const ficheMorceau = (id: string) => CATALOGUE.find((m) => m.id === id);
