<script lang="ts">
  // Gammes et arpèges : doigtés sur portée et manche, écoute, bourdon, métronome, et justesse
  // note par note au micro. La gamme du jour suit la tonalité des morceaux-objectifs.
  import { onDestroy, untrack } from 'svelte';
  import Portee, { type NotePortee } from '../components/Portee.svelte';
  import Manche, { type Marque } from '../components/Manche.svelte';
  import Jauge from '../components/Jauge.svelte';
  import Ecoute from '../components/Ecoute.svelte';
  import { DetecteurTenue, OPTIONS_TENUE, TENUES, type Retour } from '../lib/audio/tenue';
  import BoutonMicro from '../components/BoutonMicro.svelte';
  import { stockage } from '../lib/stockage.svelte';
  import { micro } from '../lib/audio/micro.svelte';
  import { arreterBourdon, clic, couperSuite, demarrerBourdon, jouer } from '../lib/audio/son';
  import { GAMMES, cleGammeJustesse, doigteGamme, gamme as trouverGamme, notesArpege, notesGamme, octavesMax } from '../lib/exercices/gammes';
  import { contexteDe, gammeDuJour } from '../lib/planificateur';
  import { courtPosition } from '../lib/morceaux/doigte';
  import { CORDES } from '../lib/musique/violoncelle';
  import { type Cle } from '../lib/musique/cles';
  import { nomNote } from '../lib/musique/notes';
  import { enregistrerReponse } from '../lib/revision';

  let { idInitial = null }: { idInitial?: string | null } = $props();

  const duJour = $derived(gammeDuJour(stockage.etat, contexteDe(stockage.etat)));
  let id = $state(idInitial && trouverGamme(idInitial) ? idInitial : '');
  const g = $derived(trouverGamme(id) ?? duJour);
  let octaves = $state<1 | 2 | 3>(2);
  let forme = $state<'gamme' | 'arpege'>('gamme');
  let cleChoisie = $state<Cle | 'auto'>('auto');
  let tempo = $state(60);
  let bourdon = $state(false);
  let metronome = $state(true);
  const style = $derived(stockage.etat.reglages.nomsNotes);

  const oct = $derived(Math.min(octaves, octavesMax(g)) as 1 | 2 | 3);
  const notes = $derived(forme === 'gamme' ? notesGamme(g, oct) : notesArpege(g, oct));
  const doigtes = $derived(doigteGamme(notes));
  const haut = $derived(Math.max(...notes.map((n) => n.midi)));
  const cle = $derived<Cle>(cleChoisie !== 'auto' ? cleChoisie : haut <= 67 ? 'fa' : haut <= 74 ? 'ut' : 'sol');

  // ------------------------------------------------------------- lecture et suivi
  let courant = $state<number | null>(null);
  let joue = $state(false);
  let minuteurs: ReturnType<typeof setTimeout>[] = [];

  function ecouter() {
    if (joue) return arreter();
    const s = 60 / tempo;
    joue = true;
    notes.forEach((n, i) => {
      jouer(n.midi, s * 0.95, { dans: i * s, suite: true });
      if (metronome) clic(i * s, i === 0);
      minuteurs.push(setTimeout(() => (courant = i), i * s * 1000));
    });
    minuteurs.push(setTimeout(arreter, notes.length * s * 1000 + 200));
  }
  function arreter() {
    minuteurs.forEach(clearTimeout);
    minuteurs = [];
    couperSuite();
    joue = false;
    courant = null;
  }
  onDestroy(() => {
    arreter();
    arreterBourdon();
  });

  $effect(() => {
    if (bourdon) demarrerBourdon(36 + ((g.depart - 36) % 12));
    else arreterBourdon();
  });

  // ------------------------------------------------------------- justesse au micro
  let suivi = $state(false);
  let k = $state(0);
  let ecarts = $state<(number | null)[]>([]);
  let debutSuivi = 0;
  const TOL = 15;
  const detecteur = new DetecteurTenue({ ...OPTIONS_TENUE, fenetreCents: 55 });
  let retourTenue = $state<Retour | null>(null);

  function demarrerSuivi() {
    arreter();
    suivi = true;
    k = 0;
    ecarts = notes.map(() => null);
    debutSuivi = performance.now();
    detecteur.regler({ tenueMs: TENUES[stockage.etat.reglages.tenueMicro] });
    detecteur.viser(null);
    void micro.demarrer();
  }
  const cible = $derived(suivi ? notes[k]?.midi ?? null : null);
  // Chaque note de la gamme est une cible distincte, même si deux notes voisines ont la même hauteur.
  $effect(() => {
    const c = cible, i = k;
    untrack(() => detecteur.viser(c == null ? null : c + i * 1e-7));
  });
  const centsCible = $derived(retourTenue?.etat === 'approche' || retourTenue?.etat === 'valide' ? retourTenue.cents : null);
  $effect(() => {
    const l = micro.ecoute;
    untrack(() => {
      if (!suivi) return;
      const r = detecteur.pousser({ midi: l.midi, t: l.t });
      retourTenue = r;
      if (r.etat === 'valide') {
        ecarts[k] = r.ecartMedian ?? r.cents;
        if (k + 1 >= notes.length) finirSuivi();
        else k++;
      }
    });
  });
  const bilan = $derived.by(() => {
    const v = ecarts.filter((x): x is number => x != null);
    if (!v.length) return null;
    return { moyenne: Math.round(v.reduce((s, x) => s + Math.abs(x), 0) / v.length), justes: v.filter((x) => Math.abs(x) <= TOL).length, total: v.length };
  });
  function finirSuivi() {
    suivi = false;
    const b = bilan;
    if (b && b.total === notes.length) {
      enregistrerReponse(stockage.etat, cleGammeJustesse(g.id), b.moyenne <= TOL, performance.now() - debutSuivi);
      stockage.modifie();
    }
  }

  $effect(() => {
    void id; void octaves; void forme;
    untrack(() => {
      arreter();
      suivi = false;
      ecarts = [];
    });
  });

  // ------------------------------------------------------------- affichage
  const focus = $derived(suivi ? k : courant);
  const notesPortee = $derived<NotePortee[]>(notes.map((n, i) => {
    const e = ecarts[i];
    const d = doigtes[i]!;
    return {
      n: n.note,
      etat: e != null ? (Math.abs(e) <= TOL ? 'ok' : 'faux') : focus === i ? 'cible' : undefined,
      etiquette: e != null ? `${e > 0 ? '+' : ''}${e}` : d.doigt === 'p' ? 'P' : d.doigt,
      couleurEtiquette: e != null ? undefined : CORDES[d.corde]!.couleur,
    };
  }));
  const marques = $derived.by<Marque[]>(() => {
    if (focus == null) return [];
    const n = notes[focus], d = doigtes[focus];
    return n && d ? [{ corde: d.corde, demiTons: n.midi - CORDES[d.corde]!.midi, etat: 'actif', texte: d.doigt === 'p' ? 'P' : d.doigt }] : [];
  });
  const cadre = $derived(focus != null ? doigtes[focus]?.position || null : doigtes.find((d) => d.position)?.position ?? null);
  const positionsUtilisees = $derived([...new Set(doigtes.map((d) => d.position).filter(Boolean))].map(courtPosition).join(', '));
</script>

<div class="entete">
  <h1>Gammes</h1>
  <BoutonMicro />
</div>

<div class="puces">
  {#each GAMMES as x (x.id)}
    <button class="puce" aria-pressed={g.id === x.id} onclick={() => (id = x.id)}>
      {x.nom}{x.id === duJour.id ? ' ★' : ''}
    </button>
  {/each}
</div>
<p class="discret">★ gamme du jour, choisie d’après tes morceaux-objectifs. Mineur : forme mélodique en montant, naturelle en descendant.</p>

<div class="disposition">
  <div class="gauche">
    <div class="barre">
      <div class="seg" role="group" aria-label="Forme">
        <button aria-pressed={forme === 'gamme'} onclick={() => (forme = 'gamme')}>Gamme</button>
        <button aria-pressed={forme === 'arpege'} onclick={() => (forme = 'arpege')}>Arpège</button>
      </div>
      <div class="seg" role="group" aria-label="Octaves">
        {#each [1, 2, 3] as o (o)}
          <button aria-pressed={oct === o} disabled={o > octavesMax(g)} onclick={() => (octaves = o as 1 | 2 | 3)}>{o} oct.</button>
        {/each}
      </div>
      <div class="seg" role="group" aria-label="Clé">
        {#each [['auto', 'Clé auto'], ['fa', 'Fa'], ['ut', 'Ut'], ['sol', 'Sol']] as [v, t] (v)}
          <button aria-pressed={cleChoisie === v} onclick={() => (cleChoisie = v as Cle | 'auto')}>{t}</button>
        {/each}
      </div>
    </div>

    <section class="carte">
      <h2 class="titre">{g.nom} · {oct} octave{oct > 1 ? 's' : ''} <span class="discret">({positionsUtilisees})</span></h2>
      <div class="portee">
        <Portee notes={notesPortee} {cle} curseur={focus} espacement={notes.length > 24 ? 40 : 48} hauteur={190}
          onnote={(i) => { if (!suivi) { courant = i; jouer(notes[i]!.midi, 0.9); } }} />
      </div>
      <p class="discret">Sous chaque note : le doigt, dans la couleur de la corde ; après le passage au micro, l’écart en cents.</p>
      <div class="barre">
        <button class="btn primaire" onclick={ecouter} disabled={suivi}>{joue ? '■ Arrêter' : '▶ Écouter'}</button>
        <label class="tempo">Tempo <b>{tempo}</b><input type="range" min="40" max="120" bind:value={tempo} disabled={joue} /></label>
        <label class="case"><input type="checkbox" bind:checked={metronome} /> Métronome</label>
        <label class="case"><input type="checkbox" bind:checked={bourdon} /> Bourdon sur la tonique</label>
      </div>
    </section>

    <section class="carte justesse">
      <div>
        <p class="etiquette">Justesse au micro</p>
        {#if suivi}
          <p>Joue la note {k + 1} sur {notes.length} : <b>{nomNote(notes[k]!.note, style, true)}</b>, et tiens-la un instant.</p>
          <Ecoute retour={retourTenue} cible={notes[k]!.midi} {style} />
          <div class="barre">
            <button class="btn" onclick={() => { ecarts[k] = null; if (k + 1 >= notes.length) finirSuivi(); else k++; }}>Passer cette note</button>
            <button class="btn" onclick={finirSuivi}>Arrêter</button>
          </div>
        {:else}
          <p>Joue la gamme lentement : chaque note est mesurée quand tu la tiens, puis la suivante s’allume.</p>
          <button class="btn primaire" onclick={demarrerSuivi}>Commencer</button>
        {/if}
        {#if bilan && !suivi}
          <p class="bilan">{bilan.justes}/{bilan.total} notes dans ±{TOL} cents, écart moyen {bilan.moyenne} cents.</p>
          {#if bilan.justes < bilan.total}
            <p class="discret">Notes à revoir : {notes.map((n, i) => ({ n, e: ecarts[i] })).filter((x) => x.e != null && Math.abs(x.e) > TOL).map((x) => `${nomNote(x.n.note, style)} (${x.e! > 0 ? 'trop haut' : 'trop bas'})`).join(', ')}.</p>
          {/if}
        {/if}
      </div>
      {#if suivi}<Jauge cents={centsCible} tolerance={TOL} libelle={nomNote(notes[k]!.note, style)} />{/if}
    </section>
  </div>
  <aside class="droite">
    <Manche {marques} {cadre} doigts={focus == null} />
  </aside>
</div>

<style>
  .entete { display: flex; flex-wrap: wrap; align-items: center; gap: .5rem 1.5rem; }
  .entete h1 { margin: 0; }
  .puces { display: flex; flex-wrap: wrap; gap: 6px; margin: .8rem 0 .3rem; }
  .puce { appearance: none; font: inherit; font-size: .9rem; font-weight: 700; padding: .35em .8em; border-radius: 999px; border: 1px solid var(--rule); background: var(--surface); color: var(--ink-soft); cursor: pointer; }
  .puce[aria-pressed='true'] { border-color: var(--accent); background: var(--accent-soft); color: var(--ink); }
  .disposition { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 1.5rem; align-items: start; margin-top: 1rem; }
  @media (max-width: 900px) { .disposition { grid-template-columns: minmax(0, 1fr); } }
  @media (min-width: 901px) { .droite { position: sticky; top: 6.5rem; } }
  .gauche { display: flex; flex-direction: column; gap: 1rem; min-width: 0; }
  .barre { display: flex; flex-wrap: wrap; align-items: center; gap: .5rem 1rem; }
  .titre { margin: 0 0 .5rem; font-size: 1.2rem; }
  .portee { overflow-x: auto; }
  .tempo { display: inline-flex; align-items: center; gap: .5rem; }
  .tempo input { accent-color: var(--accent); }
  .case { display: inline-flex; gap: .35rem; align-items: center; cursor: pointer; }
  .case input { width: 17px; height: 17px; accent-color: var(--accent); }
  .justesse { display: grid; grid-template-columns: minmax(0, 1fr) minmax(220px, 340px); gap: 1rem; align-items: center; }
  .justesse p { margin: .3rem 0; }
  .bilan { font-weight: 700; }
</style>
