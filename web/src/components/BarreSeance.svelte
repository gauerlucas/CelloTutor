<script lang="ts">
  // Barre de la séance guidée, sous l'en-tête, visible sur toutes les pages pendant la séance.
  import { mmss, seance } from '../lib/seance.svelte';

  let { routeId }: { routeId: string } = $props();
  const b = $derived(seance.bloc);
  const restant = $derived(b ? b.minutes * 60 - b.ecoule : 0);
  // Le bloc vit dans une autre section que la page affichée : on propose d'y revenir.
  const ailleurs = $derived(b ? b.lien.split('/')[1] !== routeId : false);
</script>

{#if b}
  <div class="barre" role="region" aria-label="Séance en cours">
    <span class="num">{seance.indice + 1}/{seance.plan.length}</span>
    <div class="quoi">
      <b>{b.titre}</b>
      <span class="consigne">{b.consigne}</span>
    </div>
    <span class={`chrono ${restant < 0 ? 'depasse' : ''}`} title="Temps restant sur ce bloc">
      {restant >= 0 ? mmss(restant) : `+${mmss(-restant)}`}
    </span>
    {#if ailleurs}<a class="btn" href={b.lien}>Revenir au bloc</a>{/if}
    <button class="btn" onclick={() => seance.basculerPause()}>{seance.enPause ? '▶ Reprendre' : '⏸ Pause'}</button>
    <button class="btn" onclick={() => seance.reporter()} title="Passer ce bloc : il sera proposé la prochaine fois">Reporter</button>
    <button class="btn primaire" onclick={() => seance.suivant()}>{seance.indice + 1 < seance.plan.length ? 'Fait, bloc suivant' : 'Fait, terminer'}</button>
    <button class="btn discret-btn" onclick={() => seance.terminer()}>Arrêter la séance</button>
  </div>
{/if}

<style>
  .barre { display: flex; flex-wrap: wrap; align-items: center; gap: .4rem .8rem; padding: .45rem clamp(16px, 2.5vw, 40px); background: var(--accent-soft); border-top: 1px solid var(--rule); }
  .num { font: .85rem var(--f-mono); color: var(--ink-soft); }
  .quoi { flex: 1 1 18rem; min-width: 0; display: flex; flex-direction: column; line-height: 1.25; }
  .consigne { font-size: .85rem; color: var(--ink-soft); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .chrono { font: 700 1.3rem var(--f-mono); min-width: 4.5rem; text-align: right; }
  .chrono.depasse { color: var(--bad); }
  .btn { font-size: .88rem; padding: .35em .8em; }
  .discret-btn { background: transparent; }
</style>
