<script lang="ts">
  import type { Route } from '../lib/routes';
  let { route }: { route: Route } = $props();
</script>

<h1>{route.titre}</h1>
<p class="intro">{route.resume}</p>
<div class="carte">
  <p class="etiquette">En construction</p>
  <p>Cette section arrive à l'étape <b>{route.etape}</b> du plan de la V1.</p>
</div>

<style>
  .intro { font-size: 1.08rem; color: var(--ink-soft); }
  .carte p { margin: .2em 0; }
</style>
