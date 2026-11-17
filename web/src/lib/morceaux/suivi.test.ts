// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { deflateRawSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { etatInitial } from '../etat';
import { changerObjectif, importerMorceau, lireZip, objectifsActifs, statutObjectif, supprimerImporte } from './suivi';

/** Fabrique une petite archive zip (fichiers compressés) pour les tests. */
function zip(fichiers: Record<string, string>): Uint8Array {
  const enc = new TextEncoder();
  const locaux: Uint8Array[] = [], centraux: Uint8Array[] = [];
  let decalage = 0;
  for (const [nom, texte] of Object.entries(fichiers)) {
    const n = enc.encode(nom), d = deflateRawSync(enc.encode(texte));
    const l = new Uint8Array(30 + n.length + d.length), lv = new DataView(l.buffer);
    lv.setUint32(0, 0x04034b50, true); lv.setUint16(8, 8, true); lv.setUint32(18, d.length, true); lv.setUint16(26, n.length, true);
    l.set(n, 30); l.set(d, 30 + n.length);
    const c = new Uint8Array(46 + n.length), cv = new DataView(c.buffer);
    cv.setUint32(0, 0x02014b50, true); cv.setUint16(10, 8, true); cv.setUint32(20, d.length, true); cv.setUint16(28, n.length, true); cv.setUint32(42, decalage, true);
    c.set(n, 46);
    locaux.push(l); centraux.push(c); decalage += l.length;
  }
  const tailleC = centraux.reduce((s, c) => s + c.length, 0);
  const fin = new Uint8Array(22), fv = new DataView(fin.buffer);
  fv.setUint32(0, 0x06054b50, true); fv.setUint16(10, centraux.length, true); fv.setUint32(12, tailleC, true); fv.setUint32(16, decalage, true);
  const out = new Uint8Array(decalage + tailleC + 22);
  let p = 0;
  for (const x of [...locaux, ...centraux, fin]) { out.set(x, p); p += x.length; }
  return out;
}

describe('objectifs', () => {
  it('pause, reprise, abandon et ajout d’un nouveau morceau', () => {
    const e = etatInitial(0);
    changerObjectif(e, 'gluck-melodie', 'pause', 5);
    expect(statutObjectif(e, 'gluck-melodie')).toBe('pause');
    changerObjectif(e, 'faure-apres-un-reve', 'abandonne', 6);
    changerObjectif(e, 'autre', 'actif', 7);
    expect(objectifsActifs(e)).toEqual(['autre']);
    changerObjectif(e, 'autre', null);
    expect(objectifsActifs(e)).toEqual([]);
  });
});

describe('import', () => {
  const xml = readFileSync(resolve(process.cwd(), '../contenu/morceaux/gluck-melodie/partition.musicxml'), 'utf8');

  it('importe un MusicXML et le retire proprement', () => {
    const e = etatInitial(0);
    const id = importerMorceau(e, xml, 1000);
    expect(id).toMatch(/^imp-melodie-/);
    expect(e.importes[id]!.compositeur).toContain('Gluck');
    changerObjectif(e, id, 'actif');
    supprimerImporte(e, id);
    expect(e.importes[id]).toBeUndefined();
    expect(statutObjectif(e, id)).toBeNull();
  });

  it('lit une archive .mxl', async () => {
    const z = zip({ 'META-INF/container.xml': '<container><rootfiles><rootfile full-path="score.xml"/></rootfiles></container>', 'score.xml': xml });
    const f = await lireZip(z, (n) => n.endsWith('.xml'));
    expect(f.get('score.xml')).toBe(xml);
  });
});
