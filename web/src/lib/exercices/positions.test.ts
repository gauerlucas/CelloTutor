import { describe, expect, it } from 'vitest';
import { aideCase, demanchesDe, gammeDePosition, itemsPosition, jugerArrivee, tousLesDemanches } from './positions';
import { nomNote } from '../musique/notes';
import { casesPour, libellePosition, position } from '../musique/violoncelle';

describe('positions', () => {
  it('1re position sur la corde de La : si, do, do♯, ré', () => {
    const notes = itemsPosition('nom', '1', true).filter((i) => i.corde === 3).map((i) => nomNote(i.note));
    expect(notes).toEqual(['Si', 'Do', 'Do♯', 'Ré']);
  });

  it('4e position : le 1er doigt sonne à l’unisson de la corde à vide plus aiguë', () => {
    const re4 = itemsPosition('nom', '4', true).find((i) => i.corde === 2 && i.doigt === '1')!;
    expect(re4.midi).toBe(57); // la, comme la corde de La à vide
  });

  it('sans altérations, on ne garde que les notes naturelles', () => {
    expect(itemsPosition('trouve', '1', false).every((i) => i.note.acc === 0)).toBe(true);
  });

  it('le pouce ne se travaille que sur Ré et La', () => {
    expect(new Set(itemsPosition('nom', 'pouce', true).map((i) => i.corde))).toEqual(new Set([2, 3]));
  });

  it('le libellé donne la note du 1er doigt sur la corde de La', () => {
    expect(libellePosition(position('4')!)).toBe('4e position — 1er doigt sur Mi (corde de La)');
  });

  it('trouve toutes les cases d’une hauteur', () => {
    expect(casesPour(57)).toEqual([
      { corde: 1, demiTons: 14 },
      { corde: 2, demiTons: 7 },
      { corde: 3, demiTons: 0 },
    ]);
  });

  it('la gamme d’une position est triée du grave à l’aigu', () => {
    const g = gammeDePosition('1', false).map((x) => x.midi);
    expect(g).toEqual([...g].sort((a, b) => a - b));
  });
});

describe('démanchés', () => {
  it('1re → 4e position avec le doigt-guide 1 sur La : de si à mi', () => {
    const d = demanchesDe('1', '4').find((x) => x.corde === 3 && x.doigtDepart === '1' && x.doigtArrivee === '1')!;
    expect(d.midiDepart).toBe(59);
    expect(d.midiArrivee).toBe(64);
  });

  it('toutes les clés sont uniques', () => {
    const cles = tousLesDemanches().map((d) => d.cle);
    expect(new Set(cles).size).toBe(cles.length);
  });

  it('juge l’arrivée à ±25 cents', () => {
    expect(jugerArrivee(64.2, 64)).toBe('juste');
    expect(jugerArrivee(64.4, 64)).toBe('haut');
    expect(jugerArrivee(63.6, 64)).toBe('bas');
  });
});

describe('aide : logique des positions', () => {
  it('3e position, corde de Ré : on récite Ré Mi Fa Sol, le doigt 3 est deux cases plus loin (La)', () => {
    const a = aideCase(position('3')!, 2, 7);
    expect(a.recit.map((n) => n.L)).toEqual([1, 2, 3, 4]);
    expect(a.repere).toMatchObject({ L: 4, acc: 0 });
    expect(a.correction).toBe(0);
    expect(a.chemin.map((c) => c.doigt)).toEqual(['1', '2', '3']);
    expect(a.chemin[2]!.note).toMatchObject({ L: 5, acc: 0 });
  });
  it('2e position, corde de Sol : la note récitée (Si) est un demi-ton trop haut → si♭', () => {
    const a = aideCase(position('2')!, 1, 3);
    expect(a.recit[a.recit.length - 1]).toMatchObject({ L: 6, acc: 0 });
    expect(a.correction).toBe(-1);
    expect(a.repere).toMatchObject({ L: 6, acc: -1 });
  });
  it('l’échelle va du sillet au-delà du 4e doigt', () => {
    const a = aideCase(position('1')!, 3, 4);
    expect(a.echelle[0]!.demiTons).toBe(0);
    expect(a.echelle.find((c) => c.doigt === '4')!.demiTons).toBe(5);
    expect(a.echelle.length).toBe(7);
  });
});
