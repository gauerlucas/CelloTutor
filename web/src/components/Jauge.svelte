<script lang="ts">
  // Aiguille de justesse : écart en cents par rapport à la note visée.
  let { cents = null, tolerance = 15, libelle = '' }: { cents?: number | null; tolerance?: number; libelle?: string } = $props();
  const angle = $derived(cents == null ? 0 : Math.max(-50, Math.min(50, cents)) * 1.6);
  const juste = $derived(cents != null && Math.abs(cents) <= tolerance);
  const arc = (a0: number, a1: number, r = 150) => {
    const p = (a: number) => [210 + r * Math.sin((a * Math.PI) / 180), 200 - r * Math.cos((a * Math.PI) / 180)];
    const [x0, y0] = p(a0), [x1, y1] = p(a1);
    return `M${x0} ${y0} A${r} ${r} 0 0 1 ${x1} ${y1}`;
  };
</script>

<svg class="jauge" viewBox="0 0 420 240" role="img" aria-label={cents == null ? 'Aucun son' : `Écart : ${cents} cents`}>
  <path class="arc" d={arc(-80, 80)} />
  <path class="arc-ok" d={arc(-tolerance * 1.6, tolerance * 1.6)} />
  {#each [-50, -25, 0, 25, 50] as c (c)}
    {@const a = (c * 1.6 * Math.PI) / 180}
    <text x={210 + 178 * Math.sin(a)} y={204 - 178 * Math.cos(a)}>{c > 0 ? '+' + c : c}</text>
  {/each}
  <line class={`aiguille ${juste ? 'juste' : ''}`} x1="210" y1="200" x2="210" y2="62" style={`transform: rotate(${angle}deg); transform-origin: 210px 200px; opacity: ${cents == null ? 0.25 : 1}`} />
  <text class="grand" x="210" y="160">{libelle}</text>
  <text class="cents" x="210" y="190">{cents == null ? '—' : `${cents > 0 ? '+' : ''}${cents} cents`}</text>
</svg>

<style>
  .jauge { display: block; width: 100%; max-width: 380px; height: auto; margin: 0 auto; }
  .arc { fill: none; stroke: var(--rule); stroke-width: 14; }
  .arc-ok { fill: none; stroke: var(--good); stroke-width: 14; opacity: .6; }
  .aiguille { stroke: var(--ink); stroke-width: 3; stroke-linecap: round; transition: transform .12s; }
  .aiguille.juste { stroke: var(--good); }
  text { font: 11px var(--f-mono); fill: var(--ink-soft); text-anchor: middle; }
  .grand { font: 700 34px var(--f-display); fill: var(--ink); }
  .cents { font-size: 14px; fill: var(--ink); }
</style>
