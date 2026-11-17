<script lang="ts">
  import { micro } from '../lib/audio/micro.svelte';
</script>

<div class="micro">
  {#if micro.actif}
    <span class="pastille" aria-hidden="true"></span><span>Micro actif</span>
    <button class="btn petit" onclick={() => micro.arreter()}>Couper</button>
  {:else}
    <button class="btn petit" onclick={() => micro.demarrer()}>🎤 Activer le micro</button>
    {#if micro.erreur}<span class="erreur">{micro.erreur}</span>{/if}
  {/if}
</div>

<style>
  .micro { display: inline-flex; align-items: center; gap: .5rem; font-size: .9rem; flex-wrap: wrap; }
  .pastille { width: .6em; height: .6em; border-radius: 50%; background: var(--bad); animation: pulse 1.4s infinite; }
  @keyframes pulse { 50% { opacity: .3; } }
  .erreur { color: var(--bad); }
  .petit { min-height: 2.2rem; padding: .3em .8em; font-size: .88rem; }
</style>
