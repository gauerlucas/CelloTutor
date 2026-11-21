import { describe, expect, it } from 'vitest';
import { etatInitial } from '../etat';
import { clesLecture, ETAPES, etapesOuvertes, itemsEtape, itemsOuverts, notesParMinute, tirerSuite } from './lecture';
import { GAMMES, gammeDeTonalite, notesArpege, notesGamme, relative } from './gammes';
import { nomNote } from '../musique/notes';

describe('lecture', () => {
  it('les lignes de la clé de fa : sol, si, ré, fa, la', () => {
    expect(itemsEtape('fa', ETAPES[1]!).map((i) => nomNote(i.note))).toEqual(['Sol', 'Si', 'Ré', 'Fa', 'La']);
  });
  it('seule la première étape est ouverte au départ ; la suivante s’ouvre à 70 %', () => {
    const e = etatInitial(0);
    expect(etapesOuvertes(e, 'fa')).toBe(1);
    for (const i of itemsEtape('fa', ETAPES[0]!)) e.items[i.cle] = { boite: 2, vus: 3, erreurs: 0, tempsMoyenMs: 1000, echeance: 0, dernier: 0 };
    expect(etapesOuvertes(e, 'fa')).toBeGreaterThanOrEqual(2); // repères et lignes se recoupent
    expect(itemsOuverts(e, 'fa').length).toBeGreaterThan(itemsEtape('fa', ETAPES[0]!).length);
  });
  it('les notes restent dans la tessiture du violoncelle', () => {
    for (const c of ['fa', 'ut', 'sol'] as const) expect(clesLecture(c).every((k) => { const d = Number(k.split('|')[2]); return d >= 14 && d <= 40; })).toBe(true);
  });
  it('une suite ne répète jamais deux fois la même note', () => {
    const s = tirerSuite(itemsEtape('fa', ETAPES[3]!), 30);
    expect(s.every((x, i) => i === 0 || x.d !== s[i - 1]!.d)).toBe(true);
  });
  it('notes par minute', () => expect(notesParMinute(8, 12000)).toBe(40));
});

describe('gammes', () => {
  it('ré mineur mélodique : do dièse et si bécarre en montant, do et si bémol en descendant', () => {
    const n = notesGamme(GAMMES.find((g) => g.id === 're-mineur')!, 1).map((x) => nomNote(x.note));
    expect(n).toEqual(['Ré', 'Mi', 'Fa', 'Sol', 'La', 'Si', 'Do♯', 'Ré', 'Do', 'Si♭', 'La', 'Sol', 'Fa', 'Mi', 'Ré']);
  });
  it('si bémol majeur s’écrit avec des bémols', () => {
    expect(notesGamme(GAMMES.find((g) => g.id === 'sib-majeur')!, 1).slice(0, 8).map((x) => nomNote(x.note))).toEqual(['Si♭', 'Do', 'Ré', 'Mi♭', 'Fa', 'Sol', 'La', 'Si♭']);
  });
  it('tonalité → gamme, et relative', () => {
    const dm = gammeDeTonalite(2, 'minor')!;
    expect(dm.id).toBe('re-mineur');
    expect(relative(dm)!.id).toBe('fa-majeur');
    expect(gammeDeTonalite(0, 'minor')!.id).toBe('do-mineur');
  });
  it('arpège de do majeur sur 2 octaves', () => {
    expect(notesArpege(GAMMES[0]!, 2).map((x) => x.midi)).toEqual([36, 40, 43, 48, 52, 55, 60, 55, 52, 48, 43, 40, 36]);
  });
});

import { cheminDepuisRepere, repereProche } from '../musique/cles';

describe('chemin depuis le repère', () => {
  it('monte du La (clé de fa) jusqu’au Mi au-dessus de la portée', () => {
    // A3 = 26 ; E4 = 30
    expect(cheminDepuisRepere(30, 'fa')).toEqual([26, 27, 28, 29, 30]);
  });
  it('descend quand le repère est au-dessus', () => expect(cheminDepuisRepere(21, 'fa')).toEqual([22, 21]));
  it('un repère se réduit à lui-même', () => expect(cheminDepuisRepere(18, 'fa')).toEqual([18]));
  it('à égalité, prend le repère le plus grave', () => expect(repereProche(16, 'fa')).toBe(14));
});
