<script lang="ts">
  import { stockage } from '../lib/stockage.svelte';
  import { ficheMorceau } from '../lib/morceaux';

  const DUREES = [15, 30, 45, 60, 90, 120];
  const ENERGIES = [
    { id: 'fatigue', t: 'Fatigué' },
    { id: 'normal', t: 'Normal' },
    { id: 'forme', t: 'En forme' },
  ] as const;

  let duree = $state(stockage.etat.reglages.dureeParDefaut);
  let energie = $state<'fatigue' | 'normal' | 'forme'>('normal');
  let instrument = $state(true);

  // Si les réglages arrivent du dossier après l'affichage, on reprend la durée par défaut.
  $effect(() => {
    duree = stockage.etat.reglages.dureeParDefaut;
  });

  const actifs = $derived(stockage.etat.objectifs.filter((o) => o.etat === 'actif'));
  const libelleDuree = (m: number) => (m < 60 ? `${m} min` : m % 60 ? `${Math.floor(m / 60)} h ${m % 60}` : `${m / 60} h`);
</script>

<h1>Séance du jour</h1>

<section class="carte choix" aria-labelledby="titre-choix">
  <h2 id="titre-choix" class="sr">Préparer la séance</h2>
  <div class="ligne">
    <span class="etiquette">Temps disponible</span>
    <div class="seg" role="group" aria-label="Temps disponible">
      {#each DUREES as d (d)}
        <button aria-pressed={duree === d} onclick={() => (duree = d)}>{libelleDuree(d)}</button>
      {/each}
    </div>
  </div>
  <div class="ligne">
    <span class="etiquette">Énergie</span>
    <div class="seg" role="group" aria-label="Énergie">
      {#each ENERGIES as e (e.id)}
        <button aria-pressed={energie === e.id} onclick={() => (energie = e.id)}>{e.t}</button>
      {/each}
    </div>
  </div>
  <div class="ligne">
    <span class="etiquette">Violoncelle en main</span>
    <div class="seg" role="group" aria-label="Violoncelle en main">
      <button aria-pressed={instrument} onclick={() => (instrument = true)}>Oui</button>
      <button aria-pressed={!instrument} onclick={() => (instrument = false)}>Non, écran seul</button>
    </div>
  </div>
  <button class="btn primaire" disabled title="Le planificateur arrive à l'étape J3">Composer la séance</button>
  <p class="discret">Le planificateur, qui compose les blocs à partir de ces choix, arrive à l'étape J3. En attendant, cette page sert à vérifier les fondations : affichage, réglages et sauvegarde.</p>
</section>

<h2>Morceaux-objectifs du moment</h2>
{#if actifs.length}
  <ul class="objectifs">
    {#each actifs as o (o.morceauId)}
      {@const f = ficheMorceau(o.morceauId)}
      <li class="carte">
        <b>{f?.titre ?? o.morceauId}</b>
        <span class="discret">{f?.compositeur} · {f?.tonalite}</span>
      </li>
    {/each}
  </ul>
  <p class="discret">Tu pourras en ajouter, en mettre en pause ou en remplacer à l'étape J2, sans rien perdre de ta progression.</p>
{:else}
  <p class="discret">Aucun objectif : les séances suivront le socle général.</p>
{/if}

<style>
  .choix { display: flex; flex-direction: column; gap: 1rem; align-items: flex-start; }
  .ligne { display: flex; flex-wrap: wrap; align-items: center; gap: .4rem 1rem; }
  .ligne .etiquette { min-width: 11rem; }
  .choix p { margin: 0; }
  .objectifs { list-style: none; padding: 0; display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: .7rem; }
  .objectifs li { display: flex; flex-direction: column; gap: .2rem; max-width: none; }
  .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
</style>
