import { describe, expect, it } from 'vitest';
import { choisir } from './echantillons';

describe('choix de l’échantillon', () => {
  const liste = [{ midi: 36 }, { midi: 40 }, { midi: 45 }];
  it('prend l’échantillon de la note quand il existe', () => expect(choisir(liste, 40)?.midi).toBe(40));
  it('prend le plus proche sinon', () => expect(choisir(liste, 44)?.midi).toBe(45));
  it('à égale distance, prend l’échantillon plus grave', () => expect(choisir(liste, 38)?.midi).toBe(36));
  it('liste vide : rien', () => expect(choisir([], 50)).toBeNull());
});
