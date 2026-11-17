// Gravure de la partition avec Verovio : on prépare d'abord le MusicXML (clé choisie, doigtés,
// positions aux démanchés), puis on récupère le SVG et la carte des temps pour suivre la lecture.

import type { VerovioToolkit } from 'verovio/esm';
import { courtPosition, type Doigte } from './doigte';
import { lireXml, notesAttaquees } from './partition';
import type { Cle } from '../musique/cles';

let boite: Promise<VerovioToolkit> | null = null;

/** Charge Verovio une seule fois (le moteur pèse quelques Mo : on ne le charge qu'au besoin). */
export function verovio(): Promise<VerovioToolkit> {
  boite ??= (async () => {
    const [{ default: creerModule }, { VerovioToolkit: Toolkit }] = await Promise.all([import('verovio/wasm'), import('verovio/esm')]);
    const module = await creerModule();
    return new Toolkit(module);
  })();
  boite.catch(() => (boite = null));
  return boite;
}

const CLEFS: Record<Cle, [string, string]> = { fa: ['F', '4'], ut: ['C', '4'], sol: ['G', '2'] };

const creer = (doc: Document, nom: string, texte?: string) => {
  const el = doc.createElement(nom);
  if (texte != null) el.textContent = texte;
  return el;
};

const enfant = (el: Element, nom: string) => Array.from(el.children).find((c) => c.localName === nom) ?? null;

function sousElement(doc: Document, parent: Element, nom: string, avant: string[] = []): Element {
  let el = enfant(parent, nom);
  if (!el) {
    el = creer(doc, nom);
    const ref = Array.from(parent.children).find((c) => avant.includes(c.localName));
    parent.insertBefore(el, ref ?? null);
  }
  return el;
}

// Ordre des éléments d'une <note> qui suivent <notations> (le schéma MusicXML est strict).
const APRES_NOTATIONS = ['lyric', 'play', 'listen'];

export interface OptionsGravure {
  cle: Cle | 'origine';
  doigtes: Doigte[];
  /** Écrire la position au-dessus des notes où la main change de position. */
  positions: boolean;
}

/** Réécrit le MusicXML : clé, doigtés et indications de position. */
export function preparerXml(xml: string, o: OptionsGravure): string {
  const doc = lireXml(xml);
  if (o.cle !== 'origine') {
    const [signe, ligne] = CLEFS[o.cle];
    for (const clef of Array.from(doc.getElementsByTagName('clef'))) {
      for (const c of Array.from(clef.children)) clef.removeChild(c);
      clef.appendChild(creer(doc, 'sign', signe));
      clef.appendChild(creer(doc, 'line', ligne));
    }
  }
  let posPrec: string | null = null, cordePrec: number | null = null;
  notesAttaquees(doc).forEach((note, i) => {
    const d = o.doigtes[i];
    if (!d) return;
    const notations = sousElement(doc, note, 'notations', APRES_NOTATIONS);
    const tech = sousElement(doc, notations, 'technical');
    for (const c of Array.from(tech.children)) if (c.localName === 'fingering' || c.localName === 'string') tech.removeChild(c);
    tech.appendChild(creer(doc, 'fingering', d.doigt === 'p' ? 'p' : d.doigt));
    if (d.corde !== cordePrec) tech.appendChild(creer(doc, 'string', String(4 - d.corde)));
    cordePrec = d.corde;
    if (o.positions && d.position && d.position !== posPrec) {
      const dir = creer(doc, 'direction');
      dir.setAttribute('placement', 'above');
      const dt = creer(doc, 'direction-type');
      const w = creer(doc, 'words', courtPosition(d.position));
      w.setAttribute('font-size', '7');
      w.setAttribute('font-style', 'italic');
      dt.appendChild(w);
      dir.appendChild(dt);
      note.parentNode!.insertBefore(dir, note);
    }
    if (d.position) posPrec = d.position;
  });
  return new XMLSerializer().serializeToString(doc);
}

export interface Gravure {
  pages: string[];
  /** Pour chaque note attaquée, l'identifiant de son élément dans le SVG (ou null). */
  ids: (string | null)[];
}

interface EntreeTemps {
  qstamp: number;
  tstamp: number;
  on?: string[];
}

/** Grave la partition à la largeur donnée (en pixels) et relie chaque note à son élément SVG. */
export async function graver(xml: string, debuts: number[], largeur: number, echelle = 40): Promise<Gravure> {
  const tk = await verovio();
  tk.setOptions({
    pageWidth: Math.max(600, Math.round((largeur * 100) / echelle)),
    pageHeight: 60000,
    adjustPageHeight: true,
    scale: echelle,
    breaks: 'auto',
    header: 'none',
    footer: 'none',
    pageMarginTop: 30,
    pageMarginBottom: 30,
    pageMarginLeft: 20,
    pageMarginRight: 20,
    spacingSystem: 14,
    svgViewBox: true,
  });
  if (!tk.loadData(xml)) throw new Error('Verovio n’a pas pu lire la partition.');
  const pages: string[] = [];
  for (let p = 1; p <= tk.getPageCount(); p++) pages.push(tk.renderToSVG(p));
  const carte = tk.renderToTimemap({ includeMeasures: false }) as unknown as EntreeTemps[];
  const parTemps = carte.filter((e) => e.on?.length).map((e) => ({ q: e.qstamp, on: e.on! }));
  const ids = debuts.map((q) => {
    const e = parTemps.find((x) => Math.abs(x.q - q) < 1e-3);
    return e ? e.on[0]! : null;
  });
  return { pages, ids };
}
