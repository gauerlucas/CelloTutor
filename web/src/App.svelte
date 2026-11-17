<script lang="ts">
  import { onMount } from 'svelte';
  import { ROUTES, routeDepuisHash } from './lib/routes';
  import { stockage } from './lib/stockage.svelte';
  import { appliquerAffichage } from './lib/theme';
  import Aujourdhui from './pages/Aujourdhui.svelte';
  import Reglages from './pages/Reglages.svelte';
  import AVenir from './pages/AVenir.svelte';
  import StatutSauvegarde from './pages/StatutSauvegarde.svelte';

  let route = $state(routeDepuisHash(location.hash));

  onMount(() => {
    const surHash = () => (route = routeDepuisHash(location.hash));
    addEventListener('hashchange', surHash);
    void stockage.charger();
    return () => removeEventListener('hashchange', surHash);
  });

  $effect(() => appliquerAffichage(stockage.etat.reglages));
  $effect(() => {
    document.title = route.id === 'aujourdhui' ? 'CelloTutor' : `${route.titre} · CelloTutor`;
  });
</script>

<header class="haut">
  <div class="haut-in">
    <a class="marque" href="#/aujourdhui">CelloTutor</a>
    <nav aria-label="Sections">
      {#each ROUTES as r (r.id)}
        <a href={`#/${r.id}`} aria-current={route.id === r.id ? 'page' : undefined}>{r.titre}</a>
      {/each}
    </nav>
    <StatutSauvegarde />
  </div>
</header>

<main class="contenu">
  {#if route.id === 'aujourdhui'}
    <Aujourdhui />
  {:else if route.id === 'reglages'}
    <Reglages />
  {:else}
    <AVenir {route} />
  {/if}
</main>

<style>
  .haut { position: sticky; top: 0; z-index: 5; background: var(--paper); border-bottom: 1px solid var(--rule); }
  .haut-in { max-width: 1040px; margin: 0 auto; padding: .5rem 16px 0; display: flex; flex-wrap: wrap; align-items: center; gap: .2rem 1.2rem; }
  .marque { font-family: var(--f-display); font-weight: 700; font-size: 1.35rem; color: var(--ink); text-decoration: none; padding-bottom: .5rem; }
  nav { display: flex; gap: 2px; overflow-x: auto; flex: 1 1 auto; min-width: 0; }
  nav a { font-weight: 700; font-size: .95rem; padding: .55rem .6rem; color: var(--ink-soft); text-decoration: none; border-bottom: 3px solid transparent; white-space: nowrap; }
  nav a:hover { color: var(--ink); }
  nav a[aria-current='page'] { color: var(--ink); border-bottom-color: var(--accent); }
  .contenu { max-width: 1040px; margin: 0 auto; padding: 1.5rem 16px 4rem; }
</style>
