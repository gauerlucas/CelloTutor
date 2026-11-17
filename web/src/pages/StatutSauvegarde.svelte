<script lang="ts">
  import { stockage } from '../lib/stockage.svelte';

  const textes = {
    chargement: { t: 'Chargement…', c: '' },
    dossier: { t: 'Enregistré dans le dossier', c: 'ok' },
    navigateur: { t: 'Enregistré dans le navigateur seulement', c: 'attention' },
    erreur: { t: 'Enregistrement impossible', c: 'erreur' },
  } as const;
  const info = $derived(textes[stockage.statut]);
  const detail = $derived(
    stockage.statut === 'dossier'
      ? `Assistant local actif. Fichier : ${stockage.assistant?.dossierDonnees ?? ''}`
      : stockage.statut === 'navigateur'
        ? "L'assistant local n'est pas lancé : la progression reste dans ce navigateur. Lance « Lancer CelloTutor » pour l'enregistrer dans le dossier."
        : '',
  );
</script>

<a class={`statut ${info.c}`} href="#/reglages" title={detail}>
  <span class="pastille" aria-hidden="true"></span><span role="status">{info.t}</span>
</a>

<style>
  .statut { display: inline-flex; align-items: center; gap: .45em; font-size: .8rem; color: var(--ink-soft); text-decoration: none; padding-bottom: .5rem; white-space: nowrap; }
  .pastille { width: .6em; height: .6em; border-radius: 50%; background: var(--rule); }
  .ok .pastille { background: var(--good); }
  .attention .pastille { background: var(--warn); }
  .erreur { color: var(--bad); }
  .erreur .pastille { background: var(--bad); }
</style>
