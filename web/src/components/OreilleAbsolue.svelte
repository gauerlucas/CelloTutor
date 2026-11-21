<script lang="ts">
  // Oreille absolue « synesthésique » : une note sonne, sans référence ; on la place sur la
  // portée. Chaque nom de note a sa couleur, son image et sa syllabe chantée : la réponse
  // s'affiche dans ces trois « sens » à la fois, pour que le son finisse par évoquer la couleur
  // et le nom tout seul.
  import { untrack } from 'svelte';
  import Portee, { type NotePortee } from './Portee.svelte';
  import { jouer } from '../lib/audio/son';
  import { chanter } from '../lib/audio/chant';
  import { direNote } from '../lib/audio/voix';
  import { stockage } from '../lib/stockage.svelte';
  import { deDegre, midi, nomNote, NOMS_LATINS, type Note } from '../lib/musique/notes';
  import { placeSurPortee } from '../lib/musique/cles';
  import { enregistrerReponse, REPONSE_RAPIDE_MS } from '../lib/revision';
  import { ORDRE_OUVERTURE, acquise, cleOA, lettresOuvertes, tirerDegre } from '../lib/oreilleAbsolue';
  import type { RetourLecture } from '../lib/etat';

  const style = $derived(stockage.etat.reglages.nomsNotes);
  const palais = $derived(stockage.etat.reglages.palais);
  const rl = $derived(stockage.etat.reglages.retourLecture);
  const ouvertes = $derived(lettresOuvertes(stockage.etat));
  const reglerRetour = <K extends keyof RetourLecture>(k: K, v: RetourLecture[K]) => stockage.regler('retourLecture', { ...rl, [k]: v });
  const nomD = (d: number) => nomNote(deDegre(d), style);

  let cible = $state<number | null>(null); // degré joué
  let retour = $state<{ juste: boolean; choisi: number } | null>(null);
  let score = $state({ justes: 0, total: 0, serie: 0 });
  let debut = 0;
  let minuteur: ReturnType<typeof setTimeout> | undefined;

  /** Le nom de la note : chanté à sa hauteur, ou dit avec le mot de son image. */
  function annoncer(n: Note, dansMs: number) {
    const v = stockage.etat.reglages.voixNoms;
    if (v === 'chantee') chanter(midi(n), n.L, dansMs / 1000);
    else if (v === 'parlee') direNote(nomNote(n, 'latin') + (rl.mot && palais[n.L]?.mot ? `, ${palais[n.L]!.mot}` : ''), dansMs);
  }
  /** Violoncelle et nom, dans l'ordre choisi. Renvoie la fin (ms). */
  function sonsNote(n: Note, tMs: number): number {
    const nom = stockage.etat.reglages.voixNoms !== 'aucune';
    let tv = tMs, tn = tMs;
    if (nom && rl.ordre === 'violon-nom') tn = tMs + 750;
    if (nom && rl.ordre === 'nom-violon') tv = tMs + 850;
    jouer(midi(n), 1.0, { dans: tv / 1000 });
    if (nom) annoncer(n, tn);
    return Math.max(tv + 1000, nom ? tn + 950 : 0);
  }

  function ecouter() {
    if (cible !== null) jouer(midi(deDegre(cible)), 1.4);
  }
  function suivante() {
    clearTimeout(minuteur);
    retour = null;
    cible = tirerDegre(stockage.etat, ouvertes, cible);
    debut = performance.now();
    setTimeout(ecouter, 250);
  }
  function placer(d: number) {
    if (cible === null) return;
    const c = deDegre(cible);
    const bon = ((d % 7) + 7) % 7 === c.L;
    if (retour) {
      if (!retour.juste && bon) suivante();
      return;
    }
    // avec l'indice couleur, la réponse compte mais ne fait pas monter la note de boîte
    const ms = performance.now() - debut;
    enregistrerReponse(stockage.etat, cleOA(c.L), bon, rl.indiceCouleur ? Math.max(ms, REPONSE_RAPIDE_MS + 1) : ms);
    stockage.modifie();
    score.total++;
    if (bon) { score.justes++; score.serie++; } else score.serie = 0;
    retour = { juste: bon, choisi: d };
    if (bon) {
      const fin = sonsNote(c, 0);
      minuteur = setTimeout(() => { if (retour?.juste) suivante(); }, fin + 300);
    } else {
      // on entend ce qu'on a choisi, puis la vraie note et son nom : la différence se grave
      jouer(midi(deDegre(d)), 0.6);
      sonsNote(c, 800);
    }
  }

  const SLOTS = 5, SLOT = 2;
  const notes = $derived.by<(NotePortee | null)[]>(() => {
    const slots: (NotePortee | null)[] = Array(SLOTS).fill(null);
    if (cible === null || !retour) return slots;
    const c = deDegre(cible);
    const img = rl.image ? palais[c.L]?.image : undefined;
    if (retour.juste) slots[SLOT] = { n: c, etat: 'ok', morph: nomD(cible), image: img, delai: -120 };
    else {
      slots[SLOT - 1] = { n: deDegre(retour.choisi), etat: 'faux', morph: nomD(retour.choisi).toLowerCase(), petitMorph: true, delai: -120 };
      slots[SLOT + 1] = { n: c, morph: nomD(cible), image: img, delai: 700 };
    }
    return slots;
  });
  /** Couleur de la note : après la réponse, ou avant si l'indice est demandé. */
  const teinte = $derived(cible !== null && (retour || rl.indiceCouleur) ? `var(--n${deDegre(cible).L})` : null);

  function essayerLettre(L: number) {
    const n = deDegre(21 + L); // octave du milieu (do3 → si3)
    jouer(midi(n), 1.0);
    annoncer(n, 650);
  }

  $effect(() => {
    untrack(() => { if (cible === null) suivante(); });
  });
  function touche(e: KeyboardEvent) {
    if (e.key === ' ' && !(e.target instanceof HTMLInputElement)) { e.preventDefault(); ecouter(); }
  }
</script>

<svelte:window onkeydown={touche} />

<div class="disposition">
  <section class="carte exercice" class:teinte={!!teinte} style={teinte ? `--teinte:${teinte}` : ''}>
    <div class="haut">
      <button class="btn primaire ecoute" onclick={ecouter}>🔊 Réécouter <span class="discret">(espace)</span></button>
      {#if rl.indiceCouleur && !retour && teinte}<span class="pastille" aria-label="Couleur de la note"></span>{/if}
    </div>
    <div class="portee">
      <Portee {notes} cle="fa" nomCle={rl.reperes} aides={rl.reperes} opaciteAides={rl.reperes ? 0.85 : 0} espacement={74} hauteur={190}
        onplace={placer} xPlace={SLOT} titre="Portée : touche la ligne ou l’interligne de la note entendue" />
    </div>
    <div class={`retour ${retour ? (retour.juste ? 'r-ok' : 'r-faux') : ''}`} aria-live="polite">
      {#if retour?.juste && cible !== null}
        <p class="grand bien">Oui : <span class="nom-note" style={`color:var(--n${deDegre(cible).L})`}>{nomD(cible)}</span>
          {#if rl.image || rl.mot}<span class="image-note">{rl.image ? palais[deDegre(cible).L]?.image : ''} {rl.mot ? palais[deDegre(cible).L]?.mot : ''}</span>{/if}</p>
      {:else if retour && cible !== null}
        <p class="grand mal">C’était <span class="nom-note" style={`color:var(--n${deDegre(cible).L})`}>{nomD(cible)}</span>
          {#if rl.image || rl.mot}<span class="image-note">{rl.image ? palais[deDegre(cible).L]?.image : ''} {rl.mot ? palais[deDegre(cible).L]?.mot : ''}</span>{/if}</p>
        <p class="chemin">Tu viens d’entendre ton choix, {nomD(retour.choisi).toLowerCase()}, puis le vrai {nomD(cible).toLowerCase()} ({placeSurPortee(deDegre(cible), 'fa')}). Touche un {nomD(cible).toLowerCase()} sur la portée pour continuer : n’importe quelle octave.</p>
      {:else}
        <p class="discret">Écoute, puis touche la portée là où tu crois que la note s’écrit. Toutes les octaves comptent : seul le nom importe.</p>
      {/if}
    </div>
    <div class="stats">
      <span>Justes <b>{score.justes}/{score.total}</b></span>
      <span>Série <b>{score.serie}</b></span>
    </div>
  </section>

  <aside class="colonne">
    <section class="carte">
      <p class="etiquette">Tes notes</p>
      <p class="discret">Touche une note pour l’entendre avec sa couleur et son nom. Une nouvelle s’ajoute quand tu reconnais sûrement toutes les autres.</p>
      <div class="palette">
        {#each ORDRE_OUVERTURE as L (L)}
          {@const ouverte = ouvertes.includes(L)}
          <button class="note-pal" style={`--c:var(--n${L})`} disabled={!ouverte} onclick={() => essayerLettre(L)}
            title={ouverte ? (acquise(stockage.etat, L) ? 'Reconnue sûrement' : 'En cours') : 'S’ouvrira plus tard'}>
            <span class="img">{ouverte ? palais[L]?.image : '🔒'}</span>
            <span class="nom">{NOMS_LATINS[L]}</span>
            {#if ouverte}<span class="jauge" style={`--p:${Math.min(1, (stockage.etat.items[cleOA(L)]?.boite ?? 0) / 2)}`}></span>{/if}
          </button>
        {/each}
      </div>
    </section>
    <section class="carte sens">
      <p class="etiquette">Aides</p>
      <div class="puces">
        <button class="puce" aria-pressed={rl.reperes} onclick={() => reglerRetour('reperes', !rl.reperes)}>Repères de la portée</button>
        <button class="puce" aria-pressed={rl.indiceCouleur} onclick={() => reglerRetour('indiceCouleur', !rl.indiceCouleur)} title="La couleur de la note avant ta réponse. La réponse compte, mais la note ne progresse pas.">Couleur avant la réponse</button>
        <button class="puce" aria-pressed={rl.image} onclick={() => reglerRetour('image', !rl.image)}>Image</button>
        <button class="puce" aria-pressed={rl.mot} onclick={() => reglerRetour('mot', !rl.mot)}>Mot</button>
      </div>
      <div class="ligne-sens">
        <span>Nom</span>
        <div class="seg petit" role="group" aria-label="Nom de la note">
          <button aria-pressed={stockage.etat.reglages.voixNoms === 'chantee'} onclick={() => stockage.regler('voixNoms', 'chantee')}>Chanté</button>
          <button aria-pressed={stockage.etat.reglages.voixNoms === 'parlee'} onclick={() => stockage.regler('voixNoms', 'parlee')}>Dit</button>
          <button aria-pressed={stockage.etat.reglages.voixNoms === 'aucune'} onclick={() => stockage.regler('voixNoms', 'aucune')}>Muet</button>
        </div>
      </div>
      {#if stockage.etat.reglages.voixNoms !== 'aucune'}
        <div class="ligne-sens">
          <span>Ordre</span>
          <div class="seg petit" role="group" aria-label="Ordre des sons">
            <button aria-pressed={rl.ordre === 'ensemble'} onclick={() => reglerRetour('ordre', 'ensemble')}>Ensemble</button>
            <button aria-pressed={rl.ordre === 'violon-nom'} onclick={() => reglerRetour('ordre', 'violon-nom')}>🎻 puis nom</button>
            <button aria-pressed={rl.ordre === 'nom-violon'} onclick={() => reglerRetour('ordre', 'nom-violon')}>Nom puis 🎻</button>
          </div>
        </div>
      {/if}
    </section>
  </aside>
</div>

<style>
  .disposition { display: grid; grid-template-columns: minmax(0, 1fr) minmax(280px, 380px); gap: 1rem 1.5rem; align-items: start; }
  @media (max-width: 900px) { .disposition { grid-template-columns: minmax(0, 1fr); } }
  .exercice { display: flex; flex-direction: column; gap: .8rem; transition: box-shadow .4s, background .4s; }
  .exercice.teinte { box-shadow: 0 0 0 3px color-mix(in srgb, var(--teinte) 55%, transparent), 0 0 38px color-mix(in srgb, var(--teinte) 35%, transparent); background: color-mix(in srgb, var(--teinte) 7%, var(--surface)); }
  .haut { display: flex; align-items: center; gap: 1rem; }
  .ecoute { font-size: 1.05rem; }
  .ecoute .discret { font-weight: 400; color: inherit; opacity: .75; font-size: .85em; }
  .pastille { width: 34px; height: 34px; border-radius: 50%; background: var(--teinte); box-shadow: 0 0 18px var(--teinte); }
  .portee { overflow-x: auto; }
  .retour { border-radius: 10px; padding: .7rem 1rem; text-align: center; min-height: 3.2rem; }
  .retour p { margin: .2rem 0; }
  .r-ok { background: color-mix(in srgb, var(--good) 12%, var(--surface)); }
  .r-faux { background: color-mix(in srgb, var(--bad) 13%, var(--surface)); }
  .grand { font: 700 1.5rem var(--f-display); }
  .bien { color: var(--good); }
  .mal { color: var(--bad); }
  .nom-note { font-weight: 800; }
  .image-note { font: 500 1rem var(--f-body); color: var(--ink-soft); }
  .chemin { color: var(--ink); }
  .stats { display: flex; gap: 1.5rem; font: .85rem var(--f-mono); color: var(--ink-soft); border-top: 1px solid var(--rule); padding-top: .6rem; }
  .colonne { display: flex; flex-direction: column; gap: 1rem; }
  .colonne .carte p { margin: .2rem 0 .5rem; }
  .palette { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; }
  .note-pal { appearance: none; font: inherit; border: 2px solid var(--c); border-radius: 10px; background: color-mix(in srgb, var(--c) 9%, var(--surface)); color: var(--c); padding: .4rem .2rem .5rem; cursor: pointer; display: flex; flex-direction: column; align-items: center; gap: 2px; position: relative; }
  .note-pal:disabled { border-color: var(--rule); color: var(--ink-soft); background: var(--surface); opacity: .55; cursor: default; }
  .note-pal .img { font-size: 1.3rem; }
  .note-pal .nom { font-weight: 800; }
  .jauge { position: absolute; left: 6px; right: 6px; bottom: 3px; height: 3px; border-radius: 2px; background: linear-gradient(90deg, var(--c) calc(var(--p) * 100%), var(--rule) 0); }
  .sens { display: flex; flex-direction: column; gap: .5rem; }
  .puces { display: flex; flex-wrap: wrap; gap: 6px; }
  .puce { appearance: none; font: inherit; font-size: .88rem; font-weight: 700; padding: .3em .75em; border-radius: 999px; border: 1px solid var(--rule); background: var(--surface); color: var(--ink-soft); cursor: pointer; text-decoration: line-through; opacity: .7; }
  .puce[aria-pressed='true'] { text-decoration: none; opacity: 1; color: var(--ink); border-color: var(--ink-soft); background: color-mix(in srgb, var(--ink) 6%, var(--surface)); }
  .ligne-sens { display: flex; align-items: center; gap: .6rem; flex-wrap: wrap; }
  .ligne-sens > span { min-width: 3.2rem; color: var(--ink-soft); font-size: .9rem; }
  .seg.petit button { font-size: .85rem; padding: .3em .7em; }
</style>
