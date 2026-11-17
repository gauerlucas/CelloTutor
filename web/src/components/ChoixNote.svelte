<script lang="ts">
  // Boutons de réponse : les sept noms de notes, avec dièse et bémol si demandé.
  import { NOMS_ANGLAIS, NOMS_LATINS, symboleAlteration, type StyleNoms } from '../lib/musique/notes';

  let {
    style = 'latin',
    alterations = false,
    etats = {},
    desactive = false,
    onchoix,
  }: {
    style?: StyleNoms;
    alterations?: boolean;
    etats?: Record<string, 'ok' | 'faux'>;
    desactive?: boolean;
    onchoix: (L: number, acc: number) => void;
  } = $props();

  let alt = $state(0);
  const noms = $derived(style === 'anglo' ? NOMS_ANGLAIS : NOMS_LATINS);

  function surTouche(e: KeyboardEvent) {
    if (desactive || (e.target as HTMLElement)?.tagName === 'INPUT') return;
    const i = '1234567'.indexOf(e.key);
    if (i >= 0) {
      onchoix(i, alterations ? alt : 0);
      alt = 0;
    }
  }
</script>

<svelte:window onkeydown={surTouche} />

<div class="choix">
  {#if alterations}
    <div class="seg alts" role="group" aria-label="Altération">
      <button aria-pressed={alt === -1} onclick={() => (alt = alt === -1 ? 0 : -1)}>♭ bémol</button>
      <button aria-pressed={alt === 0} onclick={() => (alt = 0)}>naturel</button>
      <button aria-pressed={alt === 1} onclick={() => (alt = alt === 1 ? 0 : 1)}>♯ dièse</button>
    </div>
  {/if}
  <div class="notes">
    {#each noms as n, i (i)}
      <button class={`btn ${etats[`${i}|${alterations ? alt : 0}`] ?? ''}`} disabled={desactive}
        onclick={() => { onchoix(i, alterations ? alt : 0); alt = 0; }}>
        <small>{i + 1}</small>{n}{alterations ? symboleAlteration(alt) : ''}
      </button>
    {/each}
  </div>
</div>

<style>
  .choix { display: flex; flex-direction: column; gap: .5rem; }
  .notes { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 5px; }
  .notes .btn { position: relative; font-size: 1.05rem; min-height: 3.2rem; padding: .4em .1em; }
  .notes small { position: absolute; top: 3px; left: 6px; font: .64rem var(--f-mono); color: var(--ink-soft); }
  .btn.ok { background: var(--good-bg); border-color: var(--good); color: var(--good); }
  .btn.faux { background: #f7e2de; border-color: var(--bad); color: var(--bad); }
  @media (hover: none) { .notes small { display: none; } }
</style>
