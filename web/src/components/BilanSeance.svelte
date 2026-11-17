<script lang="ts">
  // Bilan de fin de séance : ce qui a été fait, ce qui est reporté, et le ressenti en un clic.
  import { seance } from '../lib/seance.svelte';
  const b = $derived(seance.bilan);
</script>

{#if b}
  <div class="voile" role="presentation">
    <div class="carte bilan" role="dialog" aria-modal="true" aria-labelledby="titre-bilan">
      <h2 id="titre-bilan">Séance terminée</h2>
      <p><b>{b.minutes} min</b> de travail, {b.faits} bloc{b.faits > 1 ? 's' : ''} sur {b.total}.</p>
      {#if b.reportes.length}
        <p class="discret">Reporté à la prochaine séance : {b.reportes.join(', ')}.</p>
      {/if}
      <p>Comment c’était ?</p>
      <div class="choix">
        <button class="btn" onclick={() => seance.noter(1)}>Difficile</button>
        <button class="btn" onclick={() => seance.noter(2)}>Correcte</button>
        <button class="btn primaire" onclick={() => seance.noter(3)}>Bonne</button>
      </div>
      <button class="btn lien" onclick={() => seance.fermerBilan()}>Fermer sans noter</button>
    </div>
  </div>
{/if}

<style>
  .voile { position: fixed; inset: 0; background: rgba(20, 16, 12, .45); display: grid; place-items: center; z-index: 20; padding: 16px; }
  .bilan { max-width: 30rem; width: 100%; display: flex; flex-direction: column; gap: .6rem; }
  .bilan h2 { margin: 0; }
  .bilan p { margin: 0; }
  .choix { display: flex; gap: .5rem; flex-wrap: wrap; }
  .lien { align-self: flex-start; background: transparent; border: 0; text-decoration: underline; padding: 0; font-size: .88rem; }
</style>
