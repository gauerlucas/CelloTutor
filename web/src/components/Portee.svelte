<script lang="ts" module>
  import type { Note } from '../lib/musique/notes';
  export interface NotePortee {
    n: Note;
    /** Classe d'état : 'ok', 'faux', 'cible', 'fantome'… */
    etat?: string;
    etiquette?: string;
    couleurEtiquette?: string;
    /** Nom écrit juste à droite de la tête de note (là où l'œil regarde). */
    nom?: string;
    /** Petite tête (notes de passage d'un chemin). */
    petite?: boolean;
    /** Apparition retardée (ms), pour dérouler un chemin note à note. */
    delai?: number;
    /** La tête de note se change en ce nom, écrit à sa place exacte sur la portée. */
    morph?: string;
    petitMorph?: boolean;
    /** Moment du changement en nom (ms), si différent de l'apparition. */
    delaiMorph?: number;
  }
</script>

<script lang="ts">
  import { CLES, type Cle } from '../lib/musique/cles';
  import { degre, symboleAlteration } from '../lib/musique/notes';

  let {
    notes = [],
    cle = 'fa',
    aides = false,
    curseur = null,
    espacement = 60,
    largeurMin = 0,
    hauteur = 168,
    titre,
    nomCle = true,
    onnote,
  }: {
    notes?: (NotePortee | null)[];
    cle?: Cle;
    aides?: boolean;
    curseur?: number | null;
    espacement?: number;
    largeurMin?: number;
    hauteur?: number;
    titre?: string;
    nomCle?: boolean;
    onnote?: (i: number) => void;
  } = $props();

  const CORDE_PAR_DEGRE: Record<number, string> = { 14: 'do', 18: 'sol', 22: 're', 26: 'la' };
  const NOM_CORDE: Record<string, string> = { do: 'Do', sol: 'Sol', re: 'Ré', la: 'La' };
  const s = 14, bas = 116, x0 = 96;
  const b = $derived(CLES[cle].bas);
  const L = $derived(Math.max(largeurMin, x0 + notes.length * espacement + 16));
  const y = (d: number) => bas - ((d - b) * s) / 2;

  function lignesSupp(d: number): number[] {
    const out: number[] = [];
    if (d <= b - 2) for (let k = b - 2; k >= d; k -= 2) out.push(k);
    if (d >= b + 10) for (let k = b + 10; k <= d; k += 2) out.push(k);
    return out;
  }
</script>

<svg viewBox={`0 0 ${L} ${hauteur}`} role="img" aria-label={titre ?? `Portée en ${CLES[cle].label}`} class="portee">
  {#if curseur != null && curseur < notes.length}
    <rect class="curseur" x={x0 + curseur * espacement + 4} y="6" width={espacement - 8} height={hauteur - 12} rx="8" />
  {/if}
  {#each [0, 1, 2, 3, 4] as i (i)}
    {@const d = b + 2 * i}
    {@const corde = aides ? CORDE_PAR_DEGRE[d] : undefined}
    <line class={`ligne ${corde ? 'repere c-' + corde : ''}`} x1="4" x2={L - 6} y1={bas - i * s} y2={bas - i * s} />
    {#if corde}<text class={`lab c-${corde}`} x="6" y={bas - i * s - 3}>{NOM_CORDE[corde]}</text>{/if}
  {/each}
 {#if nomCle}<text class="nom-cle" x={L - 8} y="12" text-anchor="end">{CLES[cle].label}</text>{/if}
  {#if cle === 'fa'}
    <circle class="plein" cx="38" cy={bas - 42} r="6" />
    <path class="cle" d={`M35 ${bas - 45} C38 ${bas - 61} 69 ${bas - 62} 70 ${bas - 41} C71 ${bas - 19} 54 ${bas - 4} 30 ${bas + 8}`} />
    <circle class="plein" cx="81" cy={bas - 49} r="3" /><circle class="plein" cx="81" cy={bas - 35} r="3" />
  {:else if cle === 'ut'}
    {@const yc = bas - 42}
    <rect class="plein" x="26" y={bas - 57} width="6" height="58" /><rect class="plein" x="36" y={bas - 57} width="2" height="58" />
    <path class="cle" d={`M42 ${yc} C58 ${yc - 1} 64 ${yc - 24} 51 ${yc - 28} C44 ${yc - 30} 40 ${yc - 23} 43 ${yc - 17}`} />
    <path class="cle" d={`M42 ${yc} C58 ${yc + 1} 64 ${yc + 24} 51 ${yc + 28} C44 ${yc + 30} 40 ${yc + 23} 43 ${yc + 17}`} />
  {:else}
    {@const yc = bas - 14}
    <path class="cle" d={`M52 ${yc} C52 ${yc - 8} 42 ${yc - 11} 37 ${yc - 3} C32 ${yc + 6} 38 ${yc + 15} 47 ${yc + 14} C59 ${yc + 13} 64 ${yc + 1} 56 ${yc - 10} C48 ${yc - 21} 36 ${yc - 26} 36 ${yc - 42} C36 ${yc - 56} 44 ${yc - 66} 48 ${yc - 64} C55 ${yc - 58} 51 ${yc - 42} 45 ${yc - 28} L55 ${yc + 36} C57 ${yc + 47} 45 ${yc + 50} 42 ${yc + 42}`} />
    <circle class="plein" cx="44" cy={yc + 41} r="3.4" />
  {/if}
  {#each notes as it, j (j)}
    {#if it}
      {@const d = degre(it.n)}
      {@const cx = x0 + j * espacement + espacement / 2}
      {@const cy = y(d)}
      {@const anim = it.delai != null ? `animation-delay:${it.delai}ms` : ''}
      <g class={it.delai != null ? 'apparait' : ''} style={anim}>
      {#each lignesSupp(d) as k (k)}
        {@const corde = aides ? CORDE_PAR_DEGRE[k] : undefined}
        <line class={`ligne ${corde ? 'repere c-' + corde : ''}`} x1={cx - 14} x2={cx + 14} y1={y(k)} y2={y(k)} />
      {/each}
      {#if it.n.acc}<text class={`alt ${it.etat ?? ''} ${it.morph ? 'morphe' : ''}`} style={it.morph ? `animation-delay:${(it.delaiMorph ?? it.delai ?? 0) + 220}ms` : ''} x={cx - 13} y={cy + 7} text-anchor="end">{symboleAlteration(it.n.acc)}</text>{/if}
      <ellipse class={`tete ${it.etat ?? ''} ${it.morph ? 'morphe' : ''}`} style={it.morph ? `animation-delay:${(it.delaiMorph ?? it.delai ?? 0) + 220}ms` : ''} {cx} {cy} rx={it.petite ? 6.4 : 8.6} ry={it.petite ? 4.6 : 6.2} transform={`rotate(-22 ${cx} ${cy})`} />
      {#if it.morph}
        <text class={`morph ${it.petitMorph ? 'petit' : ''}`} x={cx} y={cy} text-anchor="middle" dominant-baseline="central"
          style={`fill:var(--n${it.n.L});animation-delay:${(it.delaiMorph ?? it.delai ?? 0) + 220}ms`}>{it.morph}</text>
      {/if}
      {#if it.nom}
        <text class={`nom ${it.etat ?? ''} ${it.petite ? 'petit' : ''}`} x={cx + (it.petite ? 9 : 12)} y={cy - (it.petite ? 7 : 9)}>{it.nom}</text>
      {/if}
      </g>
      {#if it.etiquette}<text class="etiq" x={cx} y={hauteur - 5} text-anchor="middle" style={it.couleurEtiquette ? `fill:${it.couleurEtiquette}` : ''}>{it.etiquette}</text>{/if}
      {#if onnote}
        <rect class="zone" x={cx - espacement / 2} y="0" width={espacement} height={hauteur} role="button" tabindex="0" aria-label={`Note ${j + 1}`}
          onclick={() => onnote(j)} onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && onnote(j)} />
      {/if}
    {/if}
  {/each}
</svg>

<style>
  .portee { display: block; width: 100%; height: auto; max-height: 260px; }
  .ligne { stroke: var(--ink); stroke-width: 1.3; }
  .repere { stroke-width: 2.4; }
  .c-do { stroke: var(--s-do); fill: var(--s-do); }
  .c-sol { stroke: var(--s-sol); fill: var(--s-sol); }
  .c-re { stroke: var(--s-re); fill: var(--s-re); }
  .c-la { stroke: var(--s-la); fill: var(--s-la); }
  text.lab { stroke: none; font: 700 10px var(--f-body); }
  .nom-cle { font: 10px var(--f-mono); fill: var(--ink-soft); }
  .cle { fill: none; stroke: var(--ink); stroke-width: 3.4; stroke-linecap: round; stroke-linejoin: round; }
  .plein { fill: var(--ink); }
  .tete { fill: var(--ink); transition: fill .15s; }
  .alt { fill: var(--ink); font-size: 22px; font-family: "Segoe UI Symbol", "Noto Music", serif; }
  .tete.ok, .alt.ok { fill: var(--good); }
  .tete.faux, .alt.faux { fill: var(--bad); }
  .tete.cible, .alt.cible { fill: var(--accent); }
  .tete.fantome { fill: none; stroke: var(--ink-soft); stroke-width: 1.4; stroke-dasharray: 3 2; }
  .tete.pas { fill: var(--ink-soft); }
  .tete.rep-do { fill: var(--s-do); } .tete.rep-sol { fill: var(--s-sol); }
  .tete.rep-re { fill: var(--s-re); } .tete.rep-la { fill: var(--s-la); }
  .tete.rep-autre { fill: var(--accent); }
  .nom { font: 700 17px var(--f-body); fill: var(--ink); paint-order: stroke; stroke: var(--surface); stroke-width: 4px; }
  .nom.petit { font-size: 12px; font-weight: 600; fill: var(--ink-soft); }
  .nom.faux, .nom.ok { font-size: 22px; }
  .nom.faux { fill: var(--bad); } .nom.ok { fill: var(--good); }
  .nom.rep-do { fill: var(--s-do); } .nom.rep-sol { fill: var(--s-sol); } .nom.rep-re { fill: var(--s-re); } .nom.rep-la { fill: var(--s-la); } .nom.rep-autre { fill: var(--accent); }
  .tete.morphe, .alt.morphe { animation: fond .35s ease-in forwards; }
  @keyframes fond { to { opacity: .13; } }
  .morph { font: 800 26px var(--f-body); paint-order: stroke; stroke: var(--surface); stroke-width: 5px; opacity: 0;
    transform-box: fill-box; transform-origin: center; animation: morph .38s cubic-bezier(.2, 1.4, .5, 1) forwards; }
  .morph.petit { font-size: 17px; font-weight: 700; stroke-width: 4px; }
  @keyframes morph { from { opacity: 0; transform: scale(.25); } to { opacity: 1; transform: scale(1); } }
  @media (prefers-reduced-motion: reduce) { .morph { animation: none; opacity: 1; } .tete.morphe { animation: none; opacity: .13; } }
  .apparait { opacity: 0; animation: apparait .25s ease-out forwards; }
  @keyframes apparait { from { opacity: 0; transform: translateY(3px); } to { opacity: 1; transform: none; } }
  @media (prefers-reduced-motion: reduce) { .apparait { animation: none; opacity: 1; } }
  .etiq { font: 700 12px var(--f-body); fill: var(--ink-soft); }
  .curseur { fill: var(--accent-soft); }
  .zone { fill: transparent; cursor: pointer; }
  .zone:hover { fill: var(--accent); opacity: .06; }
</style>
