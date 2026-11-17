<script lang="ts">
  import { onMount } from 'svelte';
  import { ROUTES, modeDe, parametresDepuisHash, paramsPositions, routeDepuisHash } from './lib/routes';
  import { stockage } from './lib/stockage.svelte';
  import { appliquerAffichage } from './lib/theme';
  import Aujourdhui from './pages/Aujourdhui.svelte';
  import Reglages from './pages/Reglages.svelte';
  import Positions from './pages/Positions.svelte';
  import Morceaux from './pages/Morceaux.svelte';
  import Progression from './pages/Progression.svelte';
  import Lecture from './pages/Lecture.svelte';
  import Oreille from './pages/Oreille.svelte';
  import Gammes from './pages/Gammes.svelte';
  import StatutSauvegarde from './pages/StatutSauvegarde.svelte';
  import BarreSeance from './components/BarreSeance.svelte';
  import BilanSeance from './components/BilanSeance.svelte';
  import { seance } from './lib/seance.svelte';

  let route = $state(routeDepuisHash(location.hash));
  let params = $state(parametresDepuisHash(location.hash));

  onMount(() => {
    const surHash = () => {
      route = routeDepuisHash(location.hash);
      params = parametresDepuisHash(location.hash);
    };
    addEventListener('hashchange', surHash);
    void stockage.charger();
    seance.restaurer();
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
  <BarreSeance routeId={route.id} />
</header>
<BilanSeance />

<main class="contenu" class:etroite={route.largeur === 'etroite'}>
  {#if route.id === 'aujourdhui'}
    <Aujourdhui />
  {:else if route.id === 'reglages'}
    <Reglages />
  {:else if route.id === 'positions'}
    {#key params.join('/')}
      <Positions {...paramsPositions(params)} />
    {/key}
  {:else if route.id === 'morceaux'}
    <Morceaux id={params[0] ?? null} passage={params[1] ? Number(params[1]) - 1 : null} />
  {:else if route.id === 'lecture'}
    {#key params.join('/')}<Lecture modeInitial={modeDe(params[0], ['nommer', 'suite', 'morceaux', 'revisions'], 'nommer')} />{/key}
  {:else if route.id === 'oreille'}
    {#key params.join('/')}<Oreille modeInitial={modeDe(params[0], ['cordes', 'justesse', 'imagine'], 'cordes')} />{/key}
  {:else if route.id === 'gammes'}
    {#key params.join('/')}<Gammes idInitial={params[0] ?? null} />{/key}
  {:else if route.id === 'progression'}
    <Progression />
  {/if}
</main>

<style>
  .haut { position: sticky; top: 0; z-index: 5; background: var(--paper); border-bottom: 1px solid var(--rule); }
  .haut-in { padding: .5rem clamp(16px, 2.5vw, 40px) 0; display: flex; flex-wrap: wrap; align-items: center; gap: .2rem 1.2rem; }
  .marque { font-family: var(--f-display); font-weight: 700; font-size: 1.35rem; color: var(--ink); text-decoration: none; padding-bottom: .5rem; }
  nav { display: flex; gap: 2px; overflow-x: auto; flex: 1 1 auto; min-width: 0; }
  nav a { font-weight: 700; font-size: .95rem; padding: .55rem .6rem; color: var(--ink-soft); text-decoration: none; border-bottom: 3px solid transparent; white-space: nowrap; }
  nav a:hover { color: var(--ink); }
  nav a[aria-current='page'] { color: var(--ink); border-bottom-color: var(--accent); }
  .contenu { padding: 1.5rem clamp(16px, 2.5vw, 40px) 4rem; }
  .contenu.etroite { max-width: calc(1040px + 2 * clamp(16px, 2.5vw, 40px)); margin: 0 auto; }
</style>
