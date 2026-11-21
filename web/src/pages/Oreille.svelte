<script lang="ts">
  // Oreille : accordeur sur les cordes à vide, justesse au micro sur une note visée,
  // et « imagine la note » (audiation) sans instrument.
  import { untrack } from 'svelte';
  import Jauge from '../components/Jauge.svelte';
  import Ecoute from '../components/Ecoute.svelte';
  import { DetecteurTenue, OPTIONS_TENUE, TENUES, ecartCible, type Retour } from '../lib/audio/tenue';
  import BoutonMicro from '../components/BoutonMicro.svelte';
  import Portee from '../components/Portee.svelte';
  import ChoixNote from '../components/ChoixNote.svelte';
  import OreilleAbsolue from '../components/OreilleAbsolue.svelte';
  import { micro } from '../lib/audio/micro.svelte';
  import { jouer, demarrerBourdon, arreterBourdon } from '../lib/audio/son';
  import { stockage } from '../lib/stockage.svelte';
  import { CORDES, POSITIONS, casesDe, position } from '../lib/musique/violoncelle';
  import { cleConseillee } from '../lib/musique/cles';
  import { deMidi, nomNote } from '../lib/musique/notes';
  import { enregistrerReponse } from '../lib/revision';

  type Mode = 'cordes' | 'justesse' | 'imagine' | 'absolue';
  let { modeInitial = 'cordes' }: { modeInitial?: Mode } = $props();
  let mode = $state<Mode>(modeInitial);
  const style = $derived(stockage.etat.reglages.nomsNotes);

  const MODES: { id: Mode; t: string; aide: string }[] = [
    { id: 'cordes', t: 'Cordes à vide', aide: 'Accorde-toi : joue une corde à vide, l’aiguille montre l’écart en cents. Touche une corde pour entendre la référence.' },
    { id: 'justesse', t: 'Justesse', aide: 'Une note est proposée : écoute-la, joue-la, et tiens-la jusqu’à ce que l’aiguille reste dans la zone verte une seconde.' },
    { id: 'absolue', t: 'Oreille absolue', aide: 'Une note sonne, sans repère : touche sa place sur la portée. Chaque note a sa couleur, son image et son nom chanté, pour que le son finisse par évoquer le nom tout seul. On commence avec do et sol.' },
    { id: 'imagine', t: 'Imagine la note', aide: 'Lis la note, entends-la dans ta tête (chante-la intérieurement), puis vérifie. Sans instrument.' },
  ];

  // ------------------------------------------------------------- accordeur
  const cordeProche = $derived(micro.ecoute.midi == null ? null : CORDES.reduce((a, c) => (Math.abs(c.midi - micro.ecoute.midi!) < Math.abs(a.midi - micro.ecoute.midi!) ? c : a)));
  const centsCorde = $derived(cordeProche && micro.ecoute.midi != null && Math.abs(micro.ecoute.midi - cordeProche.midi) < 1.5 ? Math.round((micro.ecoute.midi - cordeProche.midi) * 100) : null);

  // ------------------------------------------------------------- justesse
  let posJ = $state('1');
  let cible = $state<number | null>(null);
  let bourdon = $state(false);
  const detecteur = new DetecteurTenue({ ...OPTIONS_TENUE, fenetreCents: 15 });
  let retourTenue = $state<Retour | null>(null);
  let reussi = $state(false);
  let debut = 0;
  let compte = $state({ faites: 0, essais: 0 });
  const TOL = 15;

  function nouvelleCible() {
    const p = position(posJ)!;
    const cs = casesDe(p, true).filter((c) => c.corde >= 1 || !p.pouce);
    let m = cs[Math.floor(Math.random() * cs.length)]!.midi;
    if (m === cible && cs.length > 1) m = cs[(cs.findIndex((c) => c.midi === m) + 1) % cs.length]!.midi;
    cible = m;
    reussi = false;
    detecteur.regler({ tenueMs: 2 * TENUES[stockage.etat.reglages.tenueMicro] });
    detecteur.viser(m);
    retourTenue = null;
    debut = performance.now();
    jouer(m, 1.2);
    if (bourdon) demarrerBourdon(36 + ((m - 36) % 12)); // la même note, dans le grave
  }
  const centsBrut = $derived(cible != null && micro.ecoute.midi != null ? Math.round(ecartCible(micro.ecoute.midi, cible, true)) : null);
  const centsCible = $derived(centsBrut != null && Math.abs(centsBrut) <= 100 ? centsBrut : null);
  $effect(() => {
    const l = micro.ecoute;
    untrack(() => {
      if (mode !== 'justesse' || reussi || cible == null) return;
      const r = detecteur.pousser({ midi: l.midi, t: l.t });
      retourTenue = r;
      if (r.etat === 'valide') {
        reussi = true;
        compte.faites++;
        enregistrerReponse(stockage.etat, `O|justesse|${cible}`, true, performance.now() - debut);
        stockage.modifie();
        setTimeout(() => mode === 'justesse' && reussi && nouvelleCible(), 900);
      }
    });
  });
  function passer() {
    if (cible != null && !reussi) {
      enregistrerReponse(stockage.etat, `O|justesse|${cible}`, false, performance.now() - debut);
      stockage.modifie();
    }
    compte.essais++;
    nouvelleCible();
  }
  $effect(() => {
    if (!bourdon || mode !== 'justesse') arreterBourdon();
  });

  // ------------------------------------------------------------- imagine
  let imagine = $state<number | null>(null);
  let entendu = $state(false);
  let etatsI = $state<Record<string, 'ok' | 'faux'>>({});
  function nouvelleImagine() {
    const p = position(['1', '1', '4', 'demi', '2', '3'][Math.floor(Math.random() * 6)]!)!;
    const cs = casesDe(p, false);
    imagine = cs[Math.floor(Math.random() * cs.length)]!.midi;
    entendu = false;
    etatsI = {};
  }
  function verifierImagine(juste: boolean) {
    if (imagine == null) return;
    enregistrerReponse(stockage.etat, `O|imagine|${imagine}`, juste, 0);
    stockage.modifie();
    nouvelleImagine();
  }

  $effect(() => {
    void mode;
    untrack(() => {
      if (mode === 'justesse' && cible == null) nouvelleCible();
      if (mode === 'imagine' && imagine == null) nouvelleImagine();
    });
  });
</script>

<div class="entete">
  <h1>Oreille</h1>
  <div class="seg" role="group" aria-label="Exercice">
    {#each MODES as m (m.id)}
      <button aria-pressed={mode === m.id} onclick={() => (mode = m.id)}>{m.t}</button>
    {/each}
  </div>
  {#if mode === 'cordes' || mode === 'justesse'}<BoutonMicro />{/if}
</div>
<p class="aide">{MODES.find((m) => m.id === mode)?.aide}</p>

{#if mode === 'cordes'}
  <div class="deux">
    <section class="carte">
      <Jauge cents={centsCorde} tolerance={5} libelle={cordeProche && centsCorde != null ? cordeProche.nom : ''} />
      {#if !micro.actif}<p class="discret centre">Active le micro pour voir l’aiguille.</p>{/if}
    </section>
    <section class="carte">
      <p class="etiquette">Références</p>
      <div class="cordes">
        {#each [...CORDES].reverse() as c (c.i)}
          <button class="btn corde" style={`border-color:${c.couleur}`} class:active={cordeProche?.i === c.i && centsCorde != null} onclick={() => jouer(c.midi, 2.5, { vibrato: false })}>
            <span style={`color:${c.couleur}`}>{c.nom}</span>
          </button>
        {/each}
      </div>
      <p class="discret">Accorde d’abord le La, puis Ré, Sol et Do par quintes. Ensuite, notes longues à vide : un archet entier par note, son plein et égal.</p>
    </section>
  </div>
{:else if mode === 'justesse'}
  <div class="deux">
    <section class="carte">
      <Jauge cents={centsCible} tolerance={TOL} libelle={cible != null ? nomNote(deMidi(cible), style, true) : ''} />
      <p class={`centre ${reussi ? 'bien' : 'discret'}`}>{reussi ? 'Juste ! Note suivante…' : micro.actif ? 'Tiens la note dans la zone verte.' : 'Active le micro pour être jugé.'}</p>
      {#if micro.actif && !reussi}<div class="centre"><Ecoute retour={retourTenue} {cible} {style} /></div>{/if}
    </section>
    <section class="carte colonne">
      {#if cible != null}
        <Portee notes={[{ n: deMidi(cible) }]} cle={cleConseillee(cible)} espacement={110} largeurMin={260} hauteur={180} />
      {/if}
      <div class="puces">
        {#each POSITIONS.filter((p) => !p.pouce) as p (p.id)}
          <button class="puce" aria-pressed={posJ === p.id} onclick={() => { posJ = p.id; nouvelleCible(); }}>{p.court}</button>
        {/each}
      </div>
      <div class="actions">
        <button class="btn" onclick={() => cible != null && jouer(cible, 1.4)}>▶ Réentendre</button>
        <button class="btn" onclick={passer}>Autre note</button>
        <label class="case"><input type="checkbox" bind:checked={bourdon} onchange={() => bourdon && cible != null && nouvelleCible()} /> Bourdon</label>
      </div>
      <p class="stats">Notes tenues justes : <b>{compte.faites}</b></p>
    </section>
  </div>
{:else if mode === 'absolue'}
  <OreilleAbsolue />
{:else}
  <section class="carte colonne imagine">
    {#if imagine != null}
      <Portee notes={[{ n: deMidi(imagine) }]} cle={cleConseillee(imagine)} espacement={120} largeurMin={280} hauteur={190} />
      <p>Lis la note, puis chante-la dans ta tête. Tu peux aussi la nommer d’abord :</p>
      <ChoixNote {style} etats={etatsI} onchoix={(L) => { const n = deMidi(imagine!); etatsI = { ...etatsI, [`${L}|0`]: L === n.L ? 'ok' : 'faux', [`${n.L}|0`]: 'ok' }; }} />
      {#if !entendu}
        <button class="btn primaire" onclick={() => { entendu = true; jouer(imagine!, 1.5); }}>Vérifier en l’écoutant</button>
      {:else}
        <p><b>{nomNote(deMidi(imagine), style, true)}</b> — ce que tu imaginais était-il juste ?</p>
        <div class="actions">
          <button class="btn primaire" onclick={() => verifierImagine(true)}>Oui, juste</button>
          <button class="btn" onclick={() => verifierImagine(false)}>Pas tout à fait</button>
          <button class="btn" onclick={() => jouer(imagine!, 1.5)}>▶ Réentendre</button>
        </div>
      {/if}
    {/if}
  </section>
{/if}

<style>
  .entete { display: flex; flex-wrap: wrap; align-items: center; gap: .5rem 1.5rem; }
  .entete h1 { margin: 0; }
  .aide { color: var(--ink-soft); margin: .6rem 0 1rem; max-width: 80ch; }
  .deux { display: grid; grid-template-columns: repeat(auto-fit, minmax(360px, 1fr)); gap: 1rem; align-items: start; }
  .colonne { display: flex; flex-direction: column; gap: .8rem; }
  .imagine { max-width: 760px; }
  .centre { text-align: center; }
  .cordes { display: grid; grid-template-columns: repeat(4, 1fr); gap: .5rem; margin: .5rem 0; }
  .corde { font-size: 1.2rem; font-weight: 700; border-width: 2px; padding: .8rem 0; }
  .corde.active { background: var(--accent-soft); }
  .puces { display: flex; flex-wrap: wrap; gap: 6px; }
  .puce { appearance: none; font: inherit; font-weight: 700; padding: .3em .8em; border-radius: 999px; border: 1px solid var(--rule); background: var(--surface); color: var(--ink-soft); cursor: pointer; }
  .puce[aria-pressed='true'] { border-color: var(--accent); background: var(--accent-soft); color: var(--ink); }
  .actions { display: flex; flex-wrap: wrap; gap: .5rem; align-items: center; }
  .case { display: inline-flex; gap: .35rem; align-items: center; cursor: pointer; }
  .case input { width: 17px; height: 17px; accent-color: var(--accent); }
  .bien { color: var(--good); font-weight: 700; }
  .stats { font: .85rem var(--f-mono); color: var(--ink-soft); margin: 0; }
</style>
