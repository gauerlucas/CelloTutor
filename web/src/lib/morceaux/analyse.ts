// Analyse complète d'un morceau (partition, doigtés, passages, préparation de chaque passage),
// mise en cache : elle sert à la bibliothèque, au planificateur et à la page Progression.

import type { Etat } from '../etat';
import type { FicheMorceau } from '../morceaux';
import { doigtesMorceau, type Doigte } from './doigte';
import { analyser, toniqueDe, type Partition } from './partition';
import { competencesDe, decouper, preparation, reperesDe, SEUIL_PRET, type Competence, type Passage, type Preparation } from './passages';

export interface PassageAnalyse extends Passage {
  niveau: number;
  competences: Competence[];
  prep: Preparation;
  /** Difficulté brute (démanchés, notes brèves, aigu, pouce) pour classer les passages. */
  difficulte: number;
  debloque: boolean;
}

export interface AnalyseMorceau {
  fiche: FicheMorceau;
  partition: Partition;
  doigtes: Doigte[];
  passages: PassageAnalyse[];
  /** Part des passages débloqués (0 → 100). */
  debloques: number;
  /** Avancement : moyenne des niveaux des passages (0 → 100). */
  avancement: number;
  tonique: number;
}

const cachePartitions = new Map<string, { xml: string; p: Partition }>();
const cacheDoigtes = new Map<string, { cle: string; d: Doigte[] }>();

function partitionDe(f: FicheMorceau): Partition {
  const c = cachePartitions.get(f.id);
  if (c && c.xml === f.xml) return c.p;
  const p = analyser(f.xml);
  cachePartitions.set(f.id, { xml: f.xml, p });
  return p;
}

/** Analyse un morceau ; renvoie null si sa partition est illisible. */
export function analyserMorceau(f: FicheMorceau, etat: Etat): AnalyseMorceau | null {
  let partition: Partition;
  try {
    partition = partitionDe(f);
  } catch {
    return null;
  }
  const suivi = etat.morceaux[f.id];
  const cle = JSON.stringify(suivi?.doigtes ?? {}) + f.xml.length;
  let d = cacheDoigtes.get(f.id);
  if (!d || d.cle !== cle) {
    d = { cle, d: doigtesMorceau(partition.notes, f.doigtes ?? null, suivi?.doigtes ?? {}) };
    cacheDoigtes.set(f.id, d);
  }
  const doigtes = d.d;
  const passages = decouper(partition.mesures, partition.notes, suivi?.coupures).map((p): PassageAnalyse => {
    const competences = competencesDe(p, doigtes);
    const prep = preparation(etat, competences);
    const r = reperesDe(p, partition.notes, doigtes);
    const pouce = doigtes.slice(p.debutNote, p.finNote).filter((x) => x.position.startsWith('P')).length;
    const difficulte = r.demanches * 2 + (r.plusBreve < 0.5 ? 3 : 0) + (r.plusBreve < 0.25 ? 3 : 0) + Math.max(0, r.aigu - 69) * 0.3 + (pouce ? 4 : 0);
    const niveau = suivi?.passages[p.n] ?? 0;
    return { ...p, niveau, competences, prep, difficulte, debloque: niveau > 0 || prep.pret >= SEUIL_PRET };
  });
  const n = passages.length || 1;
  return {
    fiche: f,
    partition,
    doigtes,
    passages,
    debloques: Math.round((100 * passages.filter((p) => p.debloque).length) / n),
    avancement: Math.round((100 * passages.reduce((s, p) => s + p.niveau, 0)) / (3 * n)),
    tonique: toniqueDe(partition.quintes, partition.mode),
  };
}

/**
 * Couche « objectifs » : les compétences à travailler en priorité, tirées des passages les plus
 * accessibles des morceaux-objectifs (classement à rebours des partitions).
 */
export function competencesPrioritaires(analyses: AnalyseMorceau[], max = 6): (Competence & { maitrise: number })[] {
  const vues = new Map<string, Competence & { maitrise: number; rang: number }>();
  for (const a of analyses) {
    const ordre = [...a.passages].filter((p) => p.niveau === 0).sort((x, y) => y.prep.pret - x.prep.pret || x.difficulte - y.difficulte);
    ordre.forEach((p, rang) => {
      for (const c of p.prep.aTravailler) {
        const v = vues.get(c.cle);
        if (!v || rang < v.rang) vues.set(c.cle, { ...c, rang });
      }
    });
  }
  return [...vues.values()].sort((a, b) => a.rang - b.rang || a.maitrise - b.maitrise).slice(0, max);
}
