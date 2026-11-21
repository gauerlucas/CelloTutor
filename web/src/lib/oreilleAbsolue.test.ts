import { describe, expect, it } from 'vitest';
import { etatInitial } from './etat';
import { DEGRE_MAX, DEGRE_MIN, cleOA, lettresOuvertes, tirerDegre } from './oreilleAbsolue';

const sure = { boite: 3, vus: 6, erreurs: 0, tempsMoyenMs: 1500, echeance: 0, dernier: 0 };

describe('oreille absolue', () => {
  it('commence par do et sol, puis ouvre ré quand les deux sont acquises', () => {
    const e = etatInitial(0);
    expect(lettresOuvertes(e)).toEqual([0, 4]);
    e.items[cleOA(0)] = sure;
    expect(lettresOuvertes(e)).toEqual([0, 4]);
    e.items[cleOA(4)] = sure;
    expect(lettresOuvertes(e)).toEqual([0, 4, 1]);
  });
  it('tire une lettre ouverte, dans la tessiture, sans répéter le même degré', () => {
    const e = etatInitial(0);
    for (let i = 0; i < 200; i++) {
      const d = tirerDegre(e, [0, 4], 21);
      expect([0, 4]).toContain(d % 7);
      expect(d).toBeGreaterThanOrEqual(DEGRE_MIN);
      expect(d).toBeLessThanOrEqual(DEGRE_MAX);
      expect(d).not.toBe(21);
    }
  });
  it('fait revenir plus souvent la note la moins sûre', () => {
    const e = etatInitial(0);
    e.items[cleOA(0)] = { ...sure, boite: 5 };
    let sol = 0;
    for (let i = 0; i < 1000; i++) if (tirerDegre(e, [0, 4], null) % 7 === 4) sol++;
    expect(sol).toBeGreaterThan(750);
  });
});
