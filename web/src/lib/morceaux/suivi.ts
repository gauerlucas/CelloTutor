// Suivi des morceaux : état de travail par morceau, objectifs (actif, en pause, abandonné),
// import d'une partition MusicXML (.musicxml, .xml ou .mxl compressé).

import type { Etat, EtatMorceau, EtatObjectif } from '../etat';
import { analyser } from './partition';

export function etatDe(etat: Etat, id: string): EtatMorceau {
  return (etat.morceaux[id] ??= { doigtes: {}, passages: {} });
}

export const statutObjectif = (etat: Etat, id: string): EtatObjectif | null =>
  etat.objectifs.find((o) => o.morceauId === id)?.etat ?? null;

/** Fait d'un morceau un objectif, le met en pause, l'abandonne, ou le retire (null). */
export function changerObjectif(etat: Etat, id: string, statut: EtatObjectif | null, maintenant = Date.now()): void {
  const o = etat.objectifs.find((x) => x.morceauId === id);
  if (statut === null) etat.objectifs = etat.objectifs.filter((x) => x.morceauId !== id);
  else if (o) {
    if (o.etat !== statut) {
      o.etat = statut;
      o.depuis = maintenant;
    }
  } else etat.objectifs.push({ morceauId: id, etat: statut, depuis: maintenant });
}

export const objectifsActifs = (etat: Etat) => etat.objectifs.filter((o) => o.etat === 'actif').map((o) => o.morceauId);

const slug = (t: string) =>
  t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || 'morceau';

/** Ajoute une partition importée ; lève une ErreurPartition si elle est illisible. */
export function importerMorceau(etat: Etat, xml: string, maintenant = Date.now()): string {
  const p = analyser(xml);
  const id = `imp-${slug(p.titre)}-${maintenant.toString(36)}`;
  etat.importes[id] = { titre: p.titre, compositeur: p.compositeur, xml, ajouteLe: maintenant };
  return id;
}

export function supprimerImporte(etat: Etat, id: string): void {
  delete etat.importes[id];
  delete etat.morceaux[id];
  etat.objectifs = etat.objectifs.filter((o) => o.morceauId !== id);
}

// ---------------------------------------------------------------- fichiers .mxl (zip)

async function inflerBrut(donnees: Uint8Array): Promise<Uint8Array> {
  const flux = new Blob([donnees]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(flux).arrayBuffer());
}

/** Extrait les fichiers d'une archive zip (sans dépendance), seulement ceux demandés. */
export async function lireZip(octets: Uint8Array, garder: (nom: string) => boolean): Promise<Map<string, string>> {
  const v = new DataView(octets.buffer, octets.byteOffset, octets.byteLength);
  let fin = -1;
  for (let i = octets.length - 22; i >= Math.max(0, octets.length - 65558); i--) {
    if (v.getUint32(i, true) === 0x06054b50) {
      fin = i;
      break;
    }
  }
  if (fin < 0) throw new Error('Archive .mxl illisible.');
  const nombre = v.getUint16(fin + 10, true);
  let p = v.getUint32(fin + 16, true);
  const out = new Map<string, string>();
  const dec = new TextDecoder();
  for (let k = 0; k < nombre; k++) {
    if (v.getUint32(p, true) !== 0x02014b50) break;
    const methode = v.getUint16(p + 10, true);
    const taille = v.getUint32(p + 20, true);
    const lnom = v.getUint16(p + 28, true), lextra = v.getUint16(p + 30, true), lcomm = v.getUint16(p + 32, true);
    const local = v.getUint32(p + 42, true);
    const nom = dec.decode(octets.subarray(p + 46, p + 46 + lnom));
    p += 46 + lnom + lextra + lcomm;
    if (!garder(nom)) continue;
    const debut = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
    const brut = octets.subarray(debut, debut + taille);
    const contenu = methode === 0 ? brut : methode === 8 ? await inflerBrut(brut) : null;
    if (contenu) out.set(nom, dec.decode(contenu));
  }
  return out;
}

/** Lit un fichier choisi par l'utilisateur et renvoie le texte MusicXML. */
export async function lireFichierPartition(f: File): Promise<string> {
  const octets = new Uint8Array(await f.arrayBuffer());
  const estZip = octets[0] === 0x50 && octets[1] === 0x4b;
  if (!estZip) return new TextDecoder().decode(octets);
  const fichiers = await lireZip(octets, (n) => n.endsWith('.xml') || n.endsWith('.musicxml'));
  const conteneur = fichiers.get('META-INF/container.xml');
  const racine = conteneur ? /full-path="([^"]+)"/.exec(conteneur)?.[1] : undefined;
  const xml = (racine && fichiers.get(racine)) ?? [...fichiers.entries()].find(([n]) => !n.startsWith('META-INF/'))?.[1];
  if (!xml) throw new Error('Aucune partition trouvée dans l’archive .mxl.');
  return xml;
}
