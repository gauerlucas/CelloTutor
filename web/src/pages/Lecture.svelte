<script lang="ts">
  // Lecture de notes : nommer une note (étapes débloquées par clé), lecture en suite
  // chronométrée, et notes tirées des morceaux-objectifs.
  import { untrack } from 'svelte';
  import Portee, { type NotePortee } from '../components/Portee.svelte';
  import ChoixNote from '../components/ChoixNote.svelte';
  import { stockage } from '../lib/stockage.svelte';
  import { jouer } from '../lib/audio/son';
  import { CLES, indiceEcart, placeSurPortee, type Cle } from '../lib/musique/cles';
  import { deDegre, midi, nomNote, type Note } from '../lib/musique/notes';
  import {
    cleLecture, ETAPES, etapesOuvertes, itemsEtape, itemsOuverts, maitriseEtape, notesParMinute, ORDRE_CLES, tirerSuite, type ItemLecture,
  } from '../lib/exercices/lecture';
  import { apresReponse, choisir, enregistrerReponse, nouvelleFile, proposerRecord } from '../lib/revision';
  import { ficheMorceau } from '../lib/morceaux';
  import { analyserMorceau } from '../lib/morceaux/analyse';

  type Mode = 'nommer' | 'suite' | 'morceaux' | 'revisions';
  let { modeInitial = 'nommer' }: { modeInitial?: Mode } = $props();

  let mode = $state<Mode>(modeInitial);
  let clef = $state<Cle>('fa');
  let etapeChoisie = $state<number | 'melange'>('melange');
  const style = $derived(stockage.etat.reglages.nomsNotes);
  const nomD = (d: number) => nomNote(deDegre(d), style);

  const ouvertes = $derived(etapesOuvertes(stockage.etat, clef));
  const MODES: { id: Mode; t: string; aide: string }[] = [
    { id: 'nommer', t: 'Nommer', aide: 'Une note sur la portée : donne son nom. Touches 1 à 7 pour répondre vite. Une erreur revient deux ou trois notes plus tard.' },
    { id: 'suite', t: 'Suite chronométrée', aide: 'Huit notes à lire d’affilée, le plus vite possible sans te tromper : c’est la fluidité qui compte.' },
    { id: 'morceaux', t: 'Notes de mes morceaux', aide: 'Les notes viennent de tes morceaux-objectifs, avec leurs altérations : dièse ou bémol avant le nom.' },
    { id: 'revisions', t: 'Révisions', aide: 'Seulement les notes dues aujourd’hui, toutes clés confondues. Rien de nouveau.' },
  ];

  // ------------------------------------------------------------- pool selon le mode
  const pool = $derived.by<ItemLecture[]>(() => {
    const etat = stockage.etat;
    if (mode === 'revisions') {
      const maintenant = Date.now();
      return ORDRE_CLES.flatMap((c) => itemsOuverts(etat, c)).filter((i) => {
        const x = etat.items[i.cle];
        return x && x.echeance <= maintenant;
      });
    }
    if (etapeChoisie === 'melange' || etapeChoisie >= ouvertes) return itemsOuverts(etat, clef);
    return itemsEtape(clef, ETAPES[etapeChoisie]!);
  });

  interface NoteMorceau { cle: string; clef: Cle; d: number; note: Note; acc: number }
  const poolMorceaux = $derived.by<NoteMorceau[]>(() => {
    const out = new Map<string, NoteMorceau>();
    const b = CLES[clef].bas;
    for (const o of stockage.etat.objectifs.filter((x) => x.etat === 'actif')) {
      const f = ficheMorceau(o.morceauId, stockage.etat);
      const a = f ? analyserMorceau(f, stockage.etat) : null;
      for (const n of a?.partition.notes ?? []) {
        const d = n.L + 7 * n.oct;
        if (d < b - 6 || d > b + 14) continue;
        const k = `${d}|${n.acc}`;
        if (!out.has(k)) out.set(k, { cle: cleLecture(clef, d), clef, d, note: { L: n.L, acc: n.acc, oct: n.oct }, acc: n.acc });
      }
    }
    return [...out.values()];
  });

  // ------------------------------------------------------------- nommer (et révisions, morceaux)
  let file = nouvelleFile(4);
  let courant = $state<{ cle: string; clef: Cle; d: number; note: Note } | null>(null);
  let retour = $state<{ juste: boolean; texte: string; indice?: string } | null>(null);
  let etats = $state<Record<string, 'ok' | 'faux'>>({});
  let debut = 0;
  let score = $state({ justes: 0, total: 0, serie: 0 });

  function suivant() {
    retour = null;
    etats = {};
    if (mode === 'morceaux') {
      const p = poolMorceaux;
      courant = p.length ? p[Math.floor(Math.random() * p.length)]! : null;
    } else courant = choisir(pool, stockage.etat, file);
    debut = performance.now();
  }

  function repondre(L: number, acc: number) {
    if (!courant || retour) return;
    const n = courant.note;
    const juste = L === n.L && (mode !== 'morceaux' || acc === n.acc);
    const ms = performance.now() - debut;
    enregistrerReponse(stockage.etat, courant.cle, juste, ms);
    if (mode !== 'morceaux') apresReponse(file, courant.cle, juste);
    stockage.modifie();
    score.total++;
    if (juste) { score.justes++; score.serie++; } else score.serie = 0;
    etats = { ...etats, [`${L}|${acc}`]: juste ? 'ok' : 'faux', [`${n.L}|${mode === 'morceaux' ? n.acc : 0}`]: 'ok' };
    jouer(midi(n), 0.9);
    retour = juste
      ? { juste, texte: `Oui : ${nomNote(n, style)}.` }
      : { juste, texte: `Non : c’est ${nomNote(n, style)}, ${placeSurPortee(n, courant.clef)}.`, indice: indiceEcart(n, courant.clef, nomD) };
    if (juste) setTimeout(() => { if (retour?.juste) suivant(); }, 650);
  }

  // ------------------------------------------------------------- suite chronométrée
  let suite = $state<ItemLecture[]>([]);
  let position = $state(0);
  let resultats = $state<('ok' | 'faux')[]>([]);
  let debutSuite = 0;
  let bilanSuite = $state<string | null>(null);

  function nouvelleSuite() {
    suite = tirerSuite(itemsOuverts(stockage.etat, clef), 8);
    position = 0;
    resultats = [];
    bilanSuite = null;
    debutSuite = 0;
    debut = performance.now();
  }
  function repondreSuite(L: number) {
    const it = suite[position];
    if (!it || bilanSuite) return;
    if (!debutSuite) debutSuite = debut;
    const juste = L === it.note.L;
    enregistrerReponse(stockage.etat, it.cle, juste, performance.now() - debut);
    debut = performance.now();
    resultats = [...resultats, juste ? 'ok' : 'faux'];
    position++;
    if (position >= suite.length) {
      const ms = performance.now() - debutSuite;
      const justes = resultats.filter((r) => r === 'ok').length;
      const npm = notesParMinute(justes, ms);
      const rec = justes === suite.length && proposerRecord(stockage.etat, `rec:lecture:${clef}`, npm, false);
      bilanSuite = `${justes}/${suite.length} justes en ${(ms / 1000).toFixed(1).replace('.', ',')} s, soit ${npm} notes par minute.${rec ? ' Nouveau record !' : ''}`;
    }
    stockage.modifie();
  }
  const notesSuite = $derived<NotePortee[]>(suite.map((it, i) => ({ n: it.note, etat: resultats[i] ?? undefined })));

  // ------------------------------------------------------------- changements
  $effect(() => {
    void mode; void clef; void etapeChoisie;
    untrack(() => {
      score = { justes: 0, total: 0, serie: 0 };
      file = nouvelleFile(4);
      if (mode === 'suite') nouvelleSuite();
      else suivant();
    });
  });

  const pct = (k: number) => maitriseEtape(stockage.etat, clef, ETAPES[k]!);
  const notePortee = $derived<NotePortee[]>(courant ? [{ n: courant.note, etat: retour ? (retour.juste ? 'ok' : 'faux') : undefined }] : []);
</script>

<div class="entete">
  <h1>Lecture</h1>
  <div class="seg" role="group" aria-label="Exercice">
    {#each MODES as m (m.id)}
      <button aria-pressed={mode === m.id} onclick={() => (mode = m.id)}>{m.t}</button>
    {/each}
  </div>
</div>
<p class="aide">{MODES.find((m) => m.id === mode)?.aide}</p>

<div class="disposition">
  <div class="reglages">
    {#if mode !== 'revisions'}
      <div class="seg" role="group" aria-label="Clé">
        {#each ORDRE_CLES as c (c)}
          <button aria-pressed={clef === c} onclick={() => (clef = c)}>{CLES[c].label.replace(/^./, (x) => x.toUpperCase())}</button>
        {/each}
      </div>
    {/if}
    {#if mode === 'nommer'}
      <div class="etapes">
        {#each ETAPES as e, k (e.id)}
          <button class="etape" aria-pressed={etapeChoisie === k} disabled={k >= ouvertes} onclick={() => (etapeChoisie = k)}
            title={k >= ouvertes ? 'S’ouvre quand l’étape précédente est acquise à 70 %' : ''}>
            <span class="anneau" style={`--p:${pct(k)}`}></span>{k + 1}. {e.titre}{k >= ouvertes ? ' 🔒' : ''}
          </button>
        {/each}
        <button class="etape" aria-pressed={etapeChoisie === 'melange'} onclick={() => (etapeChoisie = 'melange')}>Tout ce qui est ouvert</button>
      </div>
    {/if}
  </div>

  <section class="carte exercice">
    {#if mode === 'suite'}
      <div class="portee-grande">
        <Portee notes={notesSuite} cle={clef} curseur={bilanSuite ? null : position} espacement={74} hauteur={190} />
      </div>
      {#if bilanSuite}
        <p class="bilan">{bilanSuite}</p>
        <button class="btn primaire" onclick={nouvelleSuite}>Nouvelle suite</button>
      {:else}
        <p class="discret">Note {position + 1} sur {suite.length}{position === 0 ? ' : le chronomètre part à ta première réponse.' : ''}</p>
        <ChoixNote {style} onchoix={(L) => repondreSuite(L)} />
      {/if}
    {:else if courant}
      <div class="portee-grande seule">
        <Portee notes={notePortee} cle={courant.clef} espacement={120} largeurMin={300} hauteur={200} />
      </div>
      {#if mode === 'revisions'}<p class="discret">{CLES[courant.clef].label}</p>{/if}
      <ChoixNote {style} alterations={mode === 'morceaux'} {etats} desactive={!!retour} onchoix={repondre} />
      <div class="retour" aria-live="polite">
        {#if retour}
          <p class={retour.juste ? 'bien' : 'mal'}>{retour.texte}</p>
          {#if retour.indice}<p class="discret">{retour.indice}</p>{/if}
          {#if !retour.juste}<button class="btn primaire" onclick={suivant}>Suivante</button>{/if}
        {/if}
      </div>
      <div class="stats">
        <span>Justes <b>{score.justes}/{score.total}</b></span>
        <span>Série <b>{score.serie}</b></span>
      </div>
    {:else}
      <p>{mode === 'revisions' ? 'Rien à réviser aujourd’hui : tout est à jour.' : mode === 'morceaux' ? 'Aucune note de tes morceaux-objectifs ne tombe dans cette clé.' : 'Aucune note dans cette étape.'}</p>
      {#if mode === 'revisions'}<button class="btn primaire" onclick={() => (mode = 'nommer')}>Passer aux nouvelles notes</button>{/if}
    {/if}
  </section>

  <aside class="carte reperes">
    <p class="etiquette">Repères en {CLES[courant?.clef ?? clef].label}</p>
    <Portee notes={CLES[courant?.clef ?? clef].reperes.map((d) => ({ n: deDegre(d), etiquette: nomD(d) }))} cle={courant?.clef ?? clef} aides espacement={56} hauteur={190} />
    <p class="discret">Lis par écart : trouve le repère le plus proche, puis compte les lignes et les interlignes.</p>
  </aside>
</div>

<style>
  .entete { display: flex; flex-wrap: wrap; align-items: center; gap: .5rem 1.5rem; }
  .entete h1 { margin: 0; }
  .aide { color: var(--ink-soft); margin: .6rem 0 1rem; max-width: 80ch; }
  .disposition { display: grid; grid-template-columns: minmax(0, 1fr) minmax(280px, 380px); gap: 1rem 1.5rem; align-items: start; }
  .reglages { grid-column: 1 / -1; display: flex; flex-wrap: wrap; gap: .6rem 1.2rem; align-items: center; }
  @media (max-width: 900px) { .disposition { grid-template-columns: minmax(0, 1fr); } }
  .etapes { display: flex; flex-wrap: wrap; gap: 6px; }
  .etape { appearance: none; font: inherit; font-size: .9rem; font-weight: 700; padding: .35em .8em; border-radius: 999px; border: 1px solid var(--rule); background: var(--surface); color: var(--ink-soft); cursor: pointer; display: inline-flex; align-items: center; gap: .45em; }
  .etape[aria-pressed='true'] { border-color: var(--accent); background: var(--accent-soft); color: var(--ink); }
  .etape:disabled { opacity: .5; cursor: not-allowed; }
  .anneau { width: 14px; height: 14px; border-radius: 50%; background: conic-gradient(var(--good) calc(var(--p) * 1%), var(--rule) 0); }
  .exercice { display: flex; flex-direction: column; gap: .9rem; }
  .portee-grande { overflow-x: auto; }
  .portee-grande.seule { max-width: 420px; }
  .retour { min-height: 2.6rem; display: flex; flex-wrap: wrap; align-items: center; gap: .4rem 1rem; }
  .retour p { margin: 0; }
  .bien { color: var(--good); font-weight: 700; }
  .mal { color: var(--bad); font-weight: 700; }
  .bilan { font-size: 1.15rem; font-weight: 700; margin: 0; }
  .stats { display: flex; gap: 1.4rem; font: .82rem var(--f-mono); color: var(--ink-soft); border-top: 1px solid var(--rule); padding-top: .6rem; }
  .stats b { color: var(--ink); font-weight: 500; }
  .reperes p { margin: .3rem 0; }
</style>
