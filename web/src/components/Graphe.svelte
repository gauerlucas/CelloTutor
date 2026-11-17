<script lang="ts">
  // Petit graphique à une seule série (barres ou courbe), avec info-bulle au survol.
  // Une série par graphique : jamais deux échelles sur le même axe.
  let {
    points,
    forme = 'barres',
    unite = '',
    titre,
    max = null,
  }: {
    points: { etiquette: string; valeur: number | null; detail?: string }[];
    forme?: 'barres' | 'courbe';
    unite?: string;
    titre: string;
    max?: number | null;
  } = $props();

  const W = 520, H = 170, G = 34, D = 8, HAUT = 14, BAS = 26;
  const vmax = $derived(max ?? Math.max(1, ...points.map((p) => p.valeur ?? 0)));
  const pas = $derived((W - G - D) / Math.max(1, points.length));
  const x = (i: number) => G + pas * i + pas / 2;
  const y = (v: number) => H - BAS - (v / vmax) * (H - BAS - HAUT);
  const graduations = $derived([0, vmax / 2, vmax].map((v) => Math.round(v * 10) / 10));
  const pasEtiquettes = $derived(Math.ceil(points.length / 8));
  let survol = $state<number | null>(null);
  const chemin = $derived.by(() => {
    let d = '', ouvert = false;
    points.forEach((p, i) => {
      if (p.valeur == null) { ouvert = false; return; }
      d += `${ouvert ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p.valeur).toFixed(1)} `;
      ouvert = true;
    });
    return d;
  });
  const fmt = (v: number) => `${Math.round(v * 10) / 10}`.replace('.', ',');
</script>

<figure class="graphe">
  <figcaption>{titre}</figcaption>
  <div class="zone">
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={titre}>
      {#each graduations as g (g)}
        <line class="grille" x1={G} x2={W - D} y1={y(g)} y2={y(g)} />
        <text class="axe" x={G - 6} y={y(g) + 4} text-anchor="end">{fmt(g)}</text>
      {/each}
      {#if forme === 'barres'}
        {#each points as p, i (i)}
          {#if p.valeur}
            {@const l = Math.min(28, pas - 4)}
            {@const h = H - BAS - y(p.valeur)}
            <path class="barre" class:actif={survol === i}
              d={`M${x(i) - l / 2} ${H - BAS} V${y(p.valeur) + Math.min(4, h)} q0 -${Math.min(4, h)} ${Math.min(4, l / 2)} -${Math.min(4, h)} H${x(i) + l / 2 - Math.min(4, l / 2)} q${Math.min(4, l / 2)} 0 ${Math.min(4, l / 2)} ${Math.min(4, h)} V${H - BAS} Z`} />
          {/if}
        {/each}
      {:else}
        <path class="ligne" d={chemin} />
        {#each points as p, i (i)}
          {#if p.valeur != null}<circle class="pt" class:actif={survol === i} cx={x(i)} cy={y(p.valeur)} r={survol === i ? 5 : 3.5} />{/if}
        {/each}
      {/if}
      {#each points as p, i (i)}
        {#if (i % pasEtiquettes === 0 && points.length - 1 - i >= pasEtiquettes / 2) || i === points.length - 1}
          <text class="axe" x={x(i)} y={H - 8} text-anchor="middle">{p.etiquette}</text>
        {/if}
        <rect class="cible" x={x(i) - pas / 2} y={HAUT - 10} width={pas} height={H - BAS - HAUT + 10}
          role="presentation" onmouseenter={() => (survol = i)} onmouseleave={() => (survol = null)} />
      {/each}
      {#if survol != null && points[survol]}
        <line class="repere" x1={x(survol)} x2={x(survol)} y1={HAUT} y2={H - BAS} />
      {/if}
    </svg>
    {#if survol != null && points[survol]}
      {@const p = points[survol]!}
      <div class="bulle" style={`left:${(x(survol) / W) * 100}%`}>
        <b>{p.valeur == null ? '—' : `${fmt(p.valeur)} ${unite}`}</b><span>{p.detail ?? p.etiquette}</span>
      </div>
    {/if}
  </div>
</figure>

<style>
  .graphe { margin: 0; }
  figcaption { font-weight: 700; font-size: .92rem; margin-bottom: .3rem; }
  .zone { position: relative; }
  svg { display: block; width: 100%; height: auto; }
  .grille { stroke: var(--rule); stroke-width: 1; }
  .axe { font: 10px var(--f-mono); fill: var(--ink-soft); }
  .barre { fill: var(--accent); opacity: .85; }
  .barre.actif { opacity: 1; }
  .ligne { fill: none; stroke: var(--accent); stroke-width: 2; stroke-linejoin: round; stroke-linecap: round; }
  .pt { fill: var(--accent); stroke: var(--surface); stroke-width: 2; }
  .cible { fill: transparent; }
  .repere { stroke: var(--ink-soft); stroke-width: 1; stroke-dasharray: 3 3; pointer-events: none; }
  .bulle { position: absolute; top: -6px; transform: translate(-50%, -100%); background: var(--surface); border: 1px solid var(--rule); border-radius: 6px; padding: .25rem .5rem; font-size: .8rem; white-space: nowrap; pointer-events: none; display: flex; flex-direction: column; box-shadow: 0 2px 6px rgba(0,0,0,.12); }
</style>
