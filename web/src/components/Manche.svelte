<script lang="ts" module>
  export interface Marque {
    corde: number;
    demiTons: number;
    /** 'cible', 'ok', 'faux', 'actif', 'depart', 'arrivee' */
    etat?: string;
    texte?: string;
  }
</script>

<script lang="ts">
  // Manche vu par le musicien (repris de l'ébauche « Atelier ») : sillet en bas, chevalet en haut,
  // corde de La à gauche ; espacement presque proportionnel au vrai manche.
  import { CORDES, POSITIONS, doigtPour, position as trouverPosition, cordesDe } from '../lib/musique/violoncelle';
  import { deMidi, nomNote, type StyleNoms } from '../lib/musique/notes';

  let {
    marques = [],
    cadre = null,
    doigts = false,
    noms = false,
    alterations = true,
    style = 'latin',
    maitrise = null,
    interactif = false,
    oncase,
    titre = "Manche du violoncelle vu par le musicien : sillet en bas, corde de La à gauche",
  }: {
    marques?: Marque[];
    cadre?: string | null;
    doigts?: boolean;
    noms?: boolean;
    alterations?: boolean;
    style?: StyleNoms;
    maitrise?: Record<string, number> | null;
    interactif?: boolean;
    oncase?: (corde: number, demiTons: number) => void;
    titre?: string;
  } = $props();

  const W = 320, H = 600, SILLET = 574, HAUT = 72, MAX = 19, CX = 160, CHEVALET = 30;
  const XB = [262, 194, 126, 58];
  const EPAISSEUR = [5, 4, 3, 2.2];
  const REEL = (n: number) => 1 - Math.pow(2, -n / 12);
  const yDemi = (n: number) => SILLET - (0.7 * REEL(n) / REEL(MAX) + (0.3 * n) / MAX) * (SILLET - HAUT);
  const persp = (y: number) => 1 - 0.5 * ((SILLET - y) / (SILLET - CHEVALET));
  const xCorde = (c: number, y: number) => CX + (XB[c]! - CX) * persp(y);
  const xBord = (cote: number, y: number) => CX + cote * (128 * persp(y) + 6);
  const rayon = (y: number) => 6.4 + 4.2 * persp(y);
  const yHaut = CHEVALET + 26;
  const yCaisse = yDemi(8);

  const pos = $derived(cadre ? trouverPosition(cadre) : null);
  const marqueDe = $derived(new Map(marques.map((m) => [`${m.corde}-${m.demiTons}`, m])));

  const forme = $derived.by(() => {
    if (!pos) return '';
    const offs = Object.values(pos.doigts) as number[];
    const yb = yDemi(pos.ff + Math.min(...offs)) + 13, ya = yDemi(pos.ff + Math.max(...offs)) - 13;
    const cs = cordesDe(pos);
    const g = Math.max(...cs), d = Math.min(...cs);
    return `M${xCorde(g, yb) - 15} ${yb} L${xCorde(g, ya) - 15} ${ya} L${xCorde(d, ya) + 15} ${ya} L${xCorde(d, yb) + 15} ${yb} Z`;
  });

  interface Point { c: number; n: number; x: number; y: number; r: number; classe: string; texte: string | null; petit: boolean }
  const points = $derived.by(() => {
    const out: Point[] = [];
    for (let c = 0; c < 4; c++) {
      for (let n = 0; n <= MAX; n++) {
        const y = n === 0 ? 30 : yDemi(n), x = n === 0 ? xCorde(c, 30) : xCorde(c, y), r = n === 0 ? 7 : rayon(y);
        const m = marqueDe.get(`${c}-${n}`);
        let classe = 'pt' + (n === 0 ? ' vide' : '');
        let texte: string | null = null, petit = false;
        const bx = maitrise ? maitrise[`${c}-${n}`] : undefined;
        if (m?.etat) classe += ` ${m.etat} vu`;
        else if (bx != null) classe += ` m${bx} vu`;
        if (doigts && pos && cordesDe(pos).includes(c)) {
          const dg = doigtPour(pos, n);
          if (dg) {
            texte = dg === 'p' ? 'P' : dg;
            classe += ' vu';
          }
        }
        if (m?.texte != null && m.texte !== '') texte = m.texte;
        if (texte == null && noms && n > 0) {
          const nn = deMidi(CORDES[c]!.midi + n);
          if (alterations || !nn.acc) {
            texte = nomNote(nn, style);
            petit = true;
            classe += ' nomme';
          }
        }
        out.push({ c, n, x, y, r, classe, texte, petit });
      }
    }
    return out;
  });
</script>

<svg class="manche" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={titre}>
  <path class="touche" d={`M${xBord(-1, SILLET)} ${SILLET} L${xBord(-1, yHaut)} ${yHaut} L${xBord(1, yHaut)} ${yHaut} L${xBord(1, SILLET)} ${SILLET} Z`} />
  <rect class="sillet" x={xBord(-1, SILLET) - 3} y={SILLET - 2} width={xBord(1, SILLET) - xBord(-1, SILLET) + 6} height="7" rx="2" />
  <path class="caisse" d={`M${xBord(-1, yCaisse) + 2} ${yCaisse - 5} Q${CX} ${yCaisse + 9} ${xBord(1, yCaisse) - 2} ${yCaisse - 5}`} />
  {#each Array.from({ length: MAX }, (_, i) => i + 1) as n (n)}
    <line class="demi" x1={xBord(-1, yDemi(n)) + 3} x2={xBord(1, yDemi(n)) - 3} y1={yDemi(n)} y2={yDemi(n)} />
  {/each}
  {#each [[12, 5], [7, 3.5], [5, 3.5], [19, 3]] as [n, r] (n)}
    <circle class="harm" cx={CX} cy={yDemi(n!)} r={r} />
  {/each}
  {#each POSITIONS.filter((p) => !p.pouce) as p (p.id)}
    <line class="rep" x1={xBord(-1, yDemi(p.ff)) - 12} x2={xBord(-1, yDemi(p.ff)) - 2} y1={yDemi(p.ff)} y2={yDemi(p.ff)} />
    <text class={`rep-lab ${cadre === p.id ? 'on' : ''}`} x={xBord(-1, yDemi(p.ff)) - 16} y={yDemi(p.ff) + 4} text-anchor="end">{p.court}</text>
  {/each}
  <text class={`rep-lab ${cadre === 'pouce' ? 'on' : ''}`} x={xBord(1, yDemi(12)) + 16} y={yDemi(12) + 4}>P</text>
  {#if forme}<path class="cadre" d={forme} />{/if}
  {#each CORDES as c (c.i)}
    <line class="corde" x1={xCorde(c.i, SILLET + 4)} x2={xCorde(c.i, 48)} y1={SILLET + 4} y2="48" stroke-width={EPAISSEUR[c.i]} />
    <text class="nom-corde" x={xCorde(c.i, 30)} y="13" text-anchor="middle" style={`fill:${c.couleur}`}>{c.nom}</text>
  {/each}
  {#each points as p (p.c + '-' + p.n)}
    <circle class={p.classe} cx={p.x} cy={p.y} r={p.r} />
    {#if p.texte != null}
      <text class={`txt ${p.petit ? 'petit' : ''} ${p.n === 0 ? 'sur-vide' : ''} ${/cible|actif|depart|arrivee|ok|faux/.test(p.classe) ? 'clair' : ''}`}
        x={p.x} y={p.y + (p.petit ? 3 : 4)} text-anchor="middle">{p.texte}</text>
    {/if}
    {#if interactif && oncase}
      <circle class="zone" cx={p.x} cy={p.y} r={p.r + 4} role="button" tabindex="0"
        aria-label={`Corde de ${CORDES[p.c]!.nom}, ${p.n === 0 ? 'à vide' : p.n + ' demi-tons'}`}
        onclick={() => oncase(p.c, p.n)} onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && oncase(p.c, p.n)} />
    {/if}
  {/each}
</svg>

<style>
  .manche { display: block; height: min(calc(100vh - 170px), 760px); width: auto; max-width: 100%; touch-action: manipulation; }
  @media (max-width: 700px) { .manche { height: auto; width: 100%; max-width: 380px; } }
  .touche { fill: #2a1f1a; stroke: #4a3a31; stroke-width: 2; }
  .sillet { fill: #efe6cf; }
  .caisse { fill: none; stroke: #efe6cf; stroke-width: 1.5; stroke-dasharray: 6 4; opacity: .75; }
  .demi { stroke: rgba(255,255,255,.14); stroke-width: 1; }
  .harm { fill: none; stroke: #f4efe6; stroke-width: 1.2; opacity: .5; }
  .rep { stroke: var(--rule); stroke-width: 1; }
  .rep-lab { font: 11px var(--f-mono); fill: var(--ink-soft); }
  .rep-lab.on { fill: var(--ink); font-weight: 700; }
  .cadre { fill: var(--accent); opacity: .22; stroke: var(--accent); stroke-width: 1.5; }
  .corde { stroke: #d9dde0; stroke-linecap: round; }
  .nom-corde { font: 700 13px var(--f-body); }
  .pt { fill: #f4efe6; opacity: .2; transition: opacity .12s, fill .12s; }
  .pt.vide { fill: none; stroke: var(--ink-soft); stroke-width: 1.4; opacity: .9; }
  .pt.vu { opacity: .92; }
  .pt.nomme { opacity: .55; }
  .pt.cible, .pt.actif { fill: var(--accent); opacity: 1; stroke: #fff; stroke-width: 2; }
  .pt.depart { fill: var(--s-sol); opacity: 1; stroke: #fff; stroke-width: 2; }
  .pt.arrivee { fill: var(--s-la); opacity: 1; stroke: #fff; stroke-width: 2; }
  .pt.ok { fill: var(--good); opacity: 1; }
  .pt.faux { fill: var(--bad); opacity: 1; }
  .pt.vide.cible, .pt.vide.ok, .pt.vide.faux, .pt.vide.actif { fill: none; stroke-width: 3; }
  .pt.vide.cible, .pt.vide.actif { stroke: var(--accent); }
  .pt.vide.ok { stroke: var(--good); }
  .pt.vide.faux { stroke: var(--bad); }
  .pt.m0 { fill: #c9cfc7; opacity: .9; } .pt.m1 { fill: #b9c6de; opacity: 1; } .pt.m2 { fill: #7f9bc9; opacity: 1; }
  .pt.m3 { fill: #5f9f79; opacity: 1; } .pt.m4 { fill: #3f8a5f; opacity: 1; } .pt.m5 { fill: #28764a; opacity: 1; }
  .txt { font: 700 12px var(--f-body); fill: #2a1f1a; pointer-events: none; }
  .txt.petit { font-size: 8.5px; letter-spacing: -.2px; }
  .txt.clair { fill: #fff; }
  .txt.sur-vide { fill: var(--ink); }
  .zone { fill: transparent; cursor: pointer; }
  .zone:hover, .zone:focus-visible { fill: #fff; opacity: .25; outline: none; }
</style>
