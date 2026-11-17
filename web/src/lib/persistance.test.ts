import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { etatInitial } from './etat';
import { ecrireDossier, ecrireNavigateur, lireDossier, lireNavigateur } from './persistance';

describe('stockage navigateur', () => {
  it('relit ce qui a été écrit', async () => {
    expect(await lireNavigateur()).toBeNull();
    const e = etatInitial(1234);
    e.reglages.theme = 'sombre';
    expect(await ecrireNavigateur(e)).toBe(true);
    expect(await lireNavigateur()).toEqual(e);
  });
});

describe('échanges avec l’assistant', () => {
  function fauxAssistant() {
    let fichier: string | null = null;
    const fn = (async (_url: string, init?: RequestInit) => {
      if (init?.method === 'PUT') {
        fichier = String(init.body);
        return new Response('{"ok":true}', { status: 200 });
      }
      return fichier ? new Response(fichier, { status: 200 }) : new Response(null, { status: 204 });
    }) as typeof fetch;
    return fn;
  }

  it('renvoie null quand il n’y a pas encore de fichier', async () => {
    expect(await lireDossier(fauxAssistant())).toBeNull();
  });

  it('écrit puis relit l’état', async () => {
    const f = fauxAssistant();
    const e = etatInitial(42);
    expect(await ecrireDossier(e, f)).toBe(true);
    expect(await lireDossier(f)).toEqual(e);
  });

  it('signale l’échec si l’assistant est injoignable', async () => {
    const enPanne = (async () => {
      throw new TypeError('Failed to fetch');
    }) as typeof fetch;
    expect(await ecrireDossier(etatInitial(), enPanne)).toBe(false);
    expect(await lireDossier(enPanne)).toBeNull();
  });
});
