// Enregistrement de l'état : dans le navigateur (IndexedDB) et, quand l'assistant
// local tourne, dans le dossier donnees/ du PC.

import { normaliser, type Etat } from './etat';

const BASE = 'cellotutor';
const MAGASIN = 'etat';
const CLE = 'courant';

function ouvrirBase(): Promise<IDBDatabase> {
  return new Promise((ok, ko) => {
    const req = indexedDB.open(BASE, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(MAGASIN);
    req.onsuccess = () => ok(req.result);
    req.onerror = () => ko(req.error);
  });
}

export async function lireNavigateur(): Promise<Etat | null> {
  try {
    const db = await ouvrirBase();
    const brut = await new Promise<unknown>((ok, ko) => {
      const req = db.transaction(MAGASIN, 'readonly').objectStore(MAGASIN).get(CLE);
      req.onsuccess = () => ok(req.result);
      req.onerror = () => ko(req.error);
    });
    db.close();
    return normaliser(brut);
  } catch {
    return null; // navigation privée, stockage bloqué…
  }
}

export async function ecrireNavigateur(etat: Etat): Promise<boolean> {
  try {
    const db = await ouvrirBase();
    await new Promise<void>((ok, ko) => {
      const tx = db.transaction(MAGASIN, 'readwrite');
      tx.objectStore(MAGASIN).put(structuredClone(etat), CLE);
      tx.oncomplete = () => ok();
      tx.onerror = () => ko(tx.error);
    });
    db.close();
    return true;
  } catch {
    return false;
  }
}

export interface InfoAssistant {
  version: string;
  dossierDonnees: string;
}

/** L'assistant n'existe que si la page est servie par lui (http://127.0.0.1…). */
function assistantPossible(): boolean {
  return typeof location !== 'undefined' && location.protocol.startsWith('http');
}

export async function sonderAssistant(fetchFn: typeof fetch = fetch): Promise<InfoAssistant | null> {
  if (!assistantPossible()) return null;
  try {
    const r = await fetchFn('api/sante', { cache: 'no-store' });
    if (!r.ok) return null;
    const j = (await r.json()) as { ok?: boolean; version?: string; dossierDonnees?: string };
    return j.ok ? { version: j.version ?? '?', dossierDonnees: j.dossierDonnees ?? '' } : null;
  } catch {
    return null;
  }
}

export async function lireDossier(fetchFn: typeof fetch = fetch): Promise<Etat | null> {
  try {
    const r = await fetchFn('api/etat', { cache: 'no-store' });
    if (!r.ok || r.status === 204) return null; // 204 = pas encore de fichier
    return normaliser(await r.json());
  } catch {
    return null;
  }
}

export async function ecrireDossier(etat: Etat, fetchFn: typeof fetch = fetch): Promise<boolean> {
  try {
    const r = await fetchFn('api/etat', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(etat),
    });
    return r.ok;
  } catch {
    return false;
  }
}

/** Fichier téléchargeable, pour une sauvegarde manuelle ou le passage vers un autre appareil. */
export function exporterFichier(etat: Etat): void {
  const blob = new Blob([JSON.stringify(etat, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  const jour = new Date().toISOString().slice(0, 10);
  a.href = URL.createObjectURL(blob);
  a.download = `cellotutor-sauvegarde-${jour}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export async function importerFichier(fichier: File): Promise<Etat | null> {
  try {
    return normaliser(JSON.parse(await fichier.text()));
  } catch {
    return null;
  }
}
