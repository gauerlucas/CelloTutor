// Le planificateur : compose la séance du jour en blocs minutés, à partir du temps disponible,
// de l'énergie, de l'instrument, des révisions dues et des morceaux-objectifs actifs.
// Grille du cahier des charges (§3.1) ; fonction pure, testée.

import type { Etat } from './etat';
import { ficheMorceau } from './morceaux';
import { analyserMorceau, competencesPrioritaires, type AnalyseMorceau } from './morceaux/analyse';
import { GAMMES, gammeDeTonalite, relative, type Gamme } from './exercices/gammes';
import { clesPosition, clesDemanche } from './exercices/positions';
import { maitrise, nombreDus } from './revision';
import { NIVEAUX } from './morceaux/passages';

export type Energie = 'fatigue' | 'normal' | 'forme';
export type TypeBloc = 'echauffement' | 'lecture' | 'gamme' | 'technique' | 'morceau' | 'oreille' | 'cloture';

export interface Bloc {
  id: string;
  type: TypeBloc;
  titre: string;
  minutes: number;
  consigne: string;
  /** Adresse du module qui sert ce bloc. */
  lien: string;
  /** Ce qui est visé (passage, gamme, position…), pour reprendre un bloc reporté. */
  cible?: string;
}

const ORDRE: TypeBloc[] = ['echauffement', 'lecture', 'gamme', 'technique', 'morceau', 'oreille', 'cloture'];

/** Minutes de chaque bloc pour la colonne d'énergie, avant mise à l'échelle (grille §3.1). */
const GRILLE: Record<Energie, Record<TypeBloc, number>> = {
  fatigue: { echauffement: 4, lecture: 6, gamme: 5, technique: 0, morceau: 12, oreille: 0, cloture: 3 },
  normal: { echauffement: 6, lecture: 10, gamme: 10, technique: 10, morceau: 20, oreille: 4, cloture: 0 },
  forme: { echauffement: 10, lecture: 15, gamme: 15, technique: 20, morceau: 40, oreille: 10, cloture: 10 },
};

/** Séance sans instrument : lecture, manche à l'écran, oreille, lecture préparée d'un passage. */
const GRILLE_ECRAN: Partial<Record<TypeBloc, number>> = { lecture: 40, technique: 25, oreille: 15, morceau: 20 };

/** Au-delà, on coupe et on alterne (attention, tendinites). */
export const MAX_BLOC = 25;
const MIN_BLOC = 3;

export interface Demande {
  duree: number;
  energie: Energie;
  instrument: boolean;
}

/** Répartit des minutes entières proportionnellement aux poids (méthode du plus fort reste). */
export function repartir(total: number, poids: number[]): number[] {
  const somme = poids.reduce((a, b) => a + b, 0) || 1;
  const brut = poids.map((p) => (p * total) / somme);
  const out = brut.map(Math.floor);
  let reste = total - out.reduce((a, b) => a + b, 0);
  const ordre = brut.map((b, i) => [b - Math.floor(b), i] as const).sort((a, b) => b[0] - a[0]);
  for (const [, i] of ordre) {
    if (reste <= 0) break;
    out[i]!++;
    reste--;
  }
  return out;
}

function minutesParBloc(d: Demande): [TypeBloc, number][] {
  const grille = d.instrument ? GRILLE[d.energie] : GRILLE_ECRAN;
  let types = ORDRE.filter((t) => (grille[t] ?? 0) > 0);
  // Une séance courte garde l'essentiel : on retire d'abord ce qui tomberait sous le minimum.
  for (;;) {
    const m = repartir(d.duree, types.map((t) => grille[t]!));
    const trop = types.findIndex((t, i) => m[i]! < MIN_BLOC && t !== 'morceau');
    if (trop < 0 || types.length <= 2) return types.map((t, i) => [t, m[i]!]);
    // On retire le bloc le moins prioritaire parmi ceux trop courts.
    const priorite: TypeBloc[] = ['cloture', 'oreille', 'technique', 'echauffement', 'gamme', 'lecture'];
    const aRetirer = priorite.find((p) => types.includes(p) && m[types.indexOf(p)]! < MIN_BLOC) ?? types[trop]!;
    types = types.filter((t) => t !== aRetirer);
  }
}

/** Coupe les blocs trop longs et intercale les morceaux suivants pour alterner. */
export function couperLongs(blocs: Bloc[]): Bloc[] {
  const out: Bloc[] = [];
  const restes: Bloc[] = [];
  for (const b of blocs) {
    if (b.minutes <= MAX_BLOC) {
      out.push(b);
      if (restes.length) out.push(restes.shift()!);
      continue;
    }
    const n = Math.ceil(b.minutes / MAX_BLOC);
    const parts = repartir(b.minutes, Array(n).fill(1));
    out.push({ ...b, minutes: parts[0]!, titre: `${b.titre} (1/${n})` });
    parts.slice(1).forEach((m, k) => restes.push({ ...b, id: `${b.id}-${k + 2}`, minutes: m, titre: `${b.titre} (${k + 2}/${n})` }));
  }
  // Ce qui n'a pas pu être intercalé passe avant la clôture.
  const iCloture = out.findIndex((b) => b.type === 'cloture');
  if (iCloture >= 0) out.splice(iCloture, 0, ...restes);
  else out.push(...restes);
  return out;
}

export interface Contexte {
  analyses: AnalyseMorceau[];
  /** Cibles des blocs non faits de la dernière séance (à reprendre en priorité). */
  reportes: string[];
  maintenant: number;
}

export function contexteDe(etat: Etat, maintenant = Date.now()): Contexte {
  const actifs = etat.objectifs.filter((o) => o.etat === 'actif').map((o) => ficheMorceau(o.morceauId, etat)).filter((f) => f != null);
  const analyses = actifs.map((f) => analyserMorceau(f, etat)).filter((a): a is AnalyseMorceau => a != null);
  const derniere = etat.seances[etat.seances.length - 1];
  const reportes = derniere ? derniere.blocs.filter((b) => !b.fait && b.cible).map((b) => b.cible!) : [];
  return { analyses, reportes, maintenant };
}

const jourNumero = (t: number) => Math.floor(t / 86400000);

/** Gamme du jour : liée à la tonalité d'un morceau-objectif (en alternant avec sa relative). */
export function gammeDuJour(etat: Etat, ctx: Contexte): Gamme {
  const j = jourNumero(ctx.maintenant);
  if (ctx.analyses.length) {
    const a = ctx.analyses[j % ctx.analyses.length]!;
    const g = gammeDeTonalite(a.tonique, a.partition.mode);
    if (g) return j % 3 === 2 ? relative(g) ?? g : g;
  }
  // Sans objectif : la gamme la moins travaillée parmi les premières du catalogue.
  const candidates = GAMMES.slice(0, 8);
  return [...candidates].sort((x, y) => (etat.items[`G|${x.id}`]?.vus ?? 0) - (etat.items[`G|${y.id}`]?.vus ?? 0) || x.rang - y.rang)[0]!;
}

const POSITIONS_ORDRE = ['1', 'demi', '4', '2', '3', '5', '6', '7', 'pouce'];
const DEMANCHES_ORDRE: [string, string][] = [['1', '4'], ['1', '2'], ['1', '3'], ['3', '4'], ['4', '5'], ['4', '6'], ['4', '7'], ['6', '7']];

/** Ce que travaille le bloc technique : d'abord ce que demandent les objectifs, sinon le socle. */
export function choixTechnique(etat: Etat, ctx: Contexte): { titre: string; lien: string; cible: string; pourquoi: string } {
  const reporte = ctx.reportes.find((c) => c.startsWith('tech:'));
  const prio = competencesPrioritaires(ctx.analyses);
  const c = prio.find((x) => `tech:${x.cle}` === reporte) ?? prio[0];
  if (c) return { titre: c.libelle, lien: c.lien, cible: `tech:${c.cle}`, pourquoi: `demandé par ${ctx.analyses.length > 1 ? 'tes morceaux-objectifs' : 'ton morceau-objectif'}` };
  for (const p of POSITIONS_ORDRE) {
    if (maitrise(etat, clesPosition(p), 2) < 60) return { titre: `Notes en ${p === 'demi' ? '½ position' : p === 'pouce' ? 'position du pouce' : p === '1' ? '1re position' : `${p}e position`}`, lien: `#/positions/nom/${p}`, cible: `tech:pos:${p}`, pourquoi: 'prochaine étape du socle' };
  }
  for (const [a, b] of DEMANCHES_ORDRE) {
    if (maitrise(etat, clesDemanche(a, b), 2) < 60) return { titre: `Démanché ${a} ↔ ${b}`, lien: `#/positions/demanche/${a}-${b}`, cible: `tech:dem:${a}-${b}`, pourquoi: 'prochaine étape du socle' };
  }
  return { titre: 'Démanchés selon tes révisions', lien: '#/positions/demanche', cible: 'tech:revision', pourquoi: 'entretien' };
}

interface ChoixMorceau { titre: string; lien: string; cible: string; consigne: string }

/** Passages du jour : connus si fatigué, un nouveau passage débloqué sinon, filage si en forme. */
export function choixMorceau(ctx: Contexte, energie: Energie, instrument: boolean): ChoixMorceau {
  if (!ctx.analyses.length) {
    return { titre: 'Morceau libre', lien: '#/morceaux', cible: 'morceau:libre', consigne: 'Aucun morceau-objectif en ce moment : choisis un morceau de ta bibliothèque, ou fais-en un objectif.' };
  }
  const j = jourNumero(ctx.maintenant);
  const reporte = ctx.reportes.find((c) => c.startsWith('morceau:'));
  const a = ctx.analyses.find((x) => reporte?.startsWith(`morceau:${x.fiche.id}:`)) ?? ctx.analyses[j % ctx.analyses.length]!;
  const id = encodeURIComponent(a.fiche.id);
  const connus = a.passages.filter((p) => p.niveau > 0 && p.niveau < 3);
  const nouveaux = a.passages.filter((p) => p.niveau === 0 && p.debloque).sort((x, y) => x.difficulte - y.difficulte);
  const lien = (n: number) => `#/morceaux/${id}/${n + 1}`;
  const nomP = (n: number) => `m. ${a.passages[n]!.de}–${a.passages[n]!.a}`;
  const court = a.fiche.titre.split(/[(,]/)[0]!.trim();

  if (!instrument) {
    const p = nouveaux[0] ?? connus[0] ?? a.passages[0]!;
    return { titre: `${court} : lecture préparée`, lien: lien(p.n), cible: `morceau:${a.fiche.id}:${p.n}`, consigne: `Passage ${nomP(p.n)} : écoute-le en suivant le manche, puis nomme chaque note avant qu’elle sonne (flèches ← →).` };
  }
  const reprendre = reporte ? a.passages.find((p) => reporte === `morceau:${a.fiche.id}:${p.n}`) : undefined;
  if (energie === 'fatigue' || (!nouveaux.length && connus.length)) {
    const p = reprendre ?? [...connus].sort((x, y) => x.niveau - y.niveau)[0];
    if (p) return { titre: `${court} : passage connu`, lien: lien(p.n), cible: `morceau:${a.fiche.id}:${p.n}`, consigne: `Passage ${nomP(p.n)} (${NIVEAUX[p.niveau]!.toLowerCase()}) : en boucle, lentement, en soignant le son. Rien de nouveau aujourd’hui.` };
    const p0 = a.passages[0]!;
    return { titre: `${court} : écoute`, lien: lien(p0.n), cible: `morceau:${a.fiche.id}:${p0.n}`, consigne: `Écoute le passage ${nomP(p0.n)} en suivant le manche ; joue seulement les notes longues.` };
  }
  const p = reprendre ?? nouveaux[0];
  if (p) {
    const filage = energie === 'forme' && connus.length >= 2 ? ' Termine par un filage de tous les passages connus.' : '';
    return { titre: `${court} : nouveau passage`, lien: lien(p.n), cible: `morceau:${a.fiche.id}:${p.n}`, consigne: `Passage ${nomP(p.n)} : écoute-le, nomme les notes, puis joue-le lentement en boucle (tempo à 60 %).${filage}` };
  }
  // Rien de débloqué : on prépare le passage le plus accessible, en écoute et lecture.
  const proche = [...a.passages].sort((x, y) => y.prep.pret - x.prep.pret || x.difficulte - y.difficulte)[0]!;
  return { titre: `${court} : préparer un passage`, lien: lien(proche.n), cible: `morceau:${a.fiche.id}:${proche.n}`, consigne: `Le passage ${nomP(proche.n)} n’est pas encore débloqué : écoute-le, suis-le au manche, et joue les notes de la position que tu connais.` };
}

/** Compose la séance. */
export function composerSeance(etat: Etat, d: Demande, ctx: Contexte = contexteDe(etat)): Bloc[] {
  const g = gammeDuJour(etat, ctx);
  const dusLecture = nombreDus(etat, Object.keys(etat.items).filter((k) => k.startsWith('L|')), ctx.maintenant);
  const blocs: Bloc[] = [];
  for (const [type, minutes] of minutesParBloc(d)) {
    const b = { id: type, type, minutes } as const;
    switch (type) {
      case 'echauffement':
        blocs.push({ ...b, titre: 'Échauffement', lien: '#/oreille/cordes', consigne: 'Accorde-toi, puis cordes à vide en notes longues : un archet entier par note, son plein et régulier.' });
        break;
      case 'lecture':
        blocs.push({
          ...b, titre: 'Lecture de notes', lien: d.energie === 'fatigue' ? '#/lecture/revisions' : '#/lecture',
          consigne: d.energie === 'fatigue'
            ? `Révisions seulement${dusLecture ? ` (${dusLecture} notes dues)` : ''} : pas de nouvelles notes ce soir.`
            : d.energie === 'forme' ? 'Révisions puis nouvelles notes ; termine par une lecture en suite chronométrée.' : `Révisions${dusLecture ? ` (${dusLecture} dues)` : ''}, puis quelques nouvelles notes.`,
        });
        break;
      case 'gamme':
        blocs.push({
          ...b, titre: `Gamme : ${g.nom}`, lien: `#/gammes/${g.id}`, cible: `gamme:${g.id}`,
          consigne: d.energie === 'fatigue' ? 'Lentement, sur bourdon, une note par archet : écoute la justesse.' : d.energie === 'forme' ? 'Gamme sur bourdon puis au métronome, et l’arpège ; vérifie la justesse au micro.' : 'Sur bourdon, puis au métronome ; vérifie la justesse au micro.',
        });
        break;
      case 'technique': {
        const t = choixTechnique(etat, ctx);
        blocs.push({ ...b, titre: t.titre, lien: t.lien, cible: t.cible, consigne: d.instrument ? `Positions et démanchés (${t.pourquoi}) : nomme, trouve, puis joue.` : `Au manche, à l’écran (${t.pourquoi}) : nomme et trouve les notes.` });
        break;
      }
      case 'morceau': {
        const m = choixMorceau(ctx, d.energie, d.instrument);
        blocs.push({ ...b, titre: m.titre, lien: m.lien, cible: m.cible, consigne: m.consigne });
        break;
      }
      case 'oreille':
        blocs.push({ ...b, titre: 'Oreille', lien: d.instrument ? '#/oreille/justesse' : '#/oreille/imagine', consigne: d.instrument ? 'Justesse au micro : tiens chaque note jusqu’à ce que l’aiguille se stabilise au centre.' : 'Imagine la note avant de l’entendre, puis vérifie.' });
        break;
      case 'cloture':
        blocs.push({ ...b, titre: 'Pour le plaisir', lien: '#/morceaux', consigne: 'Joue ce que tu aimes, sans t’arrêter sur les fautes. Puis note la séance.' });
        break;
    }
  }
  return couperLongs(blocs);
}

export const totalMinutes = (b: Bloc[]) => b.reduce((s, x) => s + x.minutes, 0);

