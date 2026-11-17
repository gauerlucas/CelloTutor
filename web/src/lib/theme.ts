import type { Reglages } from './etat';

/** Applique le thème et la taille de texte sur <html>. */
export function appliquerAffichage(r: Reglages): void {
  const html = document.documentElement;
  if (r.theme === 'auto') html.removeAttribute('data-theme');
  else html.setAttribute('data-theme', r.theme === 'sombre' ? 'dark' : 'light');
  html.style.fontSize = `${r.taillePupitre * 100}%`;
}
