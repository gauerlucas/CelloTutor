<script lang="ts">
  import { untrack } from 'svelte';
  import Manche, { type Marque } from '../components/Manche.svelte';
  import Portee, { type NotePortee } from '../components/Portee.svelte';
  import ChoixNote from '../components/ChoixNote.svelte';
  import Jauge from '../components/Jauge.svelte';
  import BoutonMicro from '../components/BoutonMicro.svelte';
  import { stockage } from '../lib/stockage.svelte';
  import { micro } from '../lib/audio/micro.svelte';
  import { jouer } from '../lib/audio/son';
  import { CORDES, POSITIONS, doigtPour, libellePosition, position, type Doigt } from '../lib/musique/violoncelle';
  import { deMidi, nomNote, memeNom } from '../lib/musique/notes';
  import { cleConseillee, type Cle } from '../lib/musique/cles';
  import {
    clesPosition, demanchesDe, gammeDePosition, itemsPosition, jugerArrivee, TRAJETS, type Demanche, type ItemCase,
  } from '../lib/exercices/positions';
  import { apresReponse, choisir, enregistrerReponse, maitrise, nouvelleFile, proposerRecord } from '../lib/revision';

  type Mode = 'explorer' | 'nom' | 'trouve' | 'demanche';
  let { modeInitial = 'explorer', posInitiale = '1', trajetInitial = null }: { modeInitial?: Mode; posInitiale?: string; trajetInitial?: [string, string] | null } = $props();

  let mode = $state<Mode>(modeInitial);
  let posId = $state(posInitiale);
  let cleChoisie = $state<Cle | 'auto'>('auto');
  let alterations = $state(true);
  let nomsSurManche = $state(false);

  const style = $derived(stockage.etat.reglages.nomsNotes);
  const pos = $derived(position(posId)!);
  const MODES: { id: Mode; t: string; aide: string }[] = [
    { id: 'explorer', t: 'Explorer', aide: 'Choisis une position : le manche montre la place de chaque doigt, la portée les notes de la position. Touche un point ou une note pour l’entendre.' },
    { id: 'nom', t: 'Nomme la note', aide: 'Un doigt est allumé sur le manche. Donne le nom de la note qu’il joue. Touches 1 à 7 du clavier pour répondre vite.' },
    { id: 'trouve', t: 'Trouve la note', aide: 'Une note est écrite sur la portée. Touche sur le manche l’endroit où tu la joues dans cette position.' },
    { id: 'demanche', t: 'Démanchés', aide: 'Joue la note de départ, glisse jusqu’à la note d’arrivée en gardant la forme de la main, et vérifie l’arrivée au micro ou à l’oreille.' },
  ];

  // ------------------------------------------------------------- explorer
  const gamme = $derived(gammeDePosition(posId, alterations));
  const cleExplorer = $derived<Cle>(cleChoisie !== 'auto' ? cleChoisie : cleConseillee(gamme[Math.floor(gamme.length / 2)]?.midi ?? 50));
  let selection = $state<number | null>(null);
  const notesExplorer = $derived<NotePortee[]>(gamme.map((g, i) => ({
    n: g.note, etat: selection === i ? 'cible' : undefined,
    etiquette: g.doigt === 'p' ? 'P' : g.doigt, couleurEtiquette: CORDES[g.corde]!.couleur,
  })));
  function choisirExplorer(i: number) {
    selection = i;
    jouer(gamme[i]!.midi, 1.1);
  }
  function caseExplorer(corde: number, demiTons: number) {
    jouer(CORDES[corde]!.midi + demiTons, 1.1);
    const i = gamme.findIndex((g) => g.corde === corde && g.midi === CORDES[corde]!.midi + demiTons);
    selection = i >= 0 ? i : null;
    infoCase = `${nomNote(deMidi(CORDES[corde]!.midi + demiTons), style, true)} — corde de ${CORDES[corde]!.nom}, ${demiTons === 0 ? 'à vide' : `${demiTons} demi-tons du sillet`}${doigtPour(pos, demiTons) ? `, doigt ${doigtPour(pos, demiTons)} en ${pos.label}` : ''}`;
  }
  let infoCase = $state('');

  // ------------------------------------------------------------- nommer / trouver
  let file = nouvelleFile(stockage.etat.reglages.dureeParDefaut >= 60 ? 6 : 4);
  let courant = $state<ItemCase | null>(null);
  let debut = 0;
  let retour = $state<{ juste: boolean; texte: string } | null>(null);
  let etatsChoix = $state<Record<string, 'ok' | 'faux'>>({});
  let marqueReponse = $state<Marque | null>(null);
  let score = $state({ justes: 0, total: 0, serie: 0, ms: [] as number[] });
  let messageRecord = $state('');

  function suivant() {
    const pool = itemsPosition(mode === 'nom' ? 'nom' : 'trouve', posId, alterations);
    courant = choisir(pool, stockage.etat, file);
    retour = null;
    etatsChoix = {};
    marqueReponse = null;
    debut = performance.now();
  }

  function repondre(juste: boolean, texte: string) {
    if (!courant || retour) return;
    const ms = performance.now() - debut;
    enregistrerReponse(stockage.etat, courant.cle, juste, ms);
    apresReponse(file, courant.cle, juste);
    score.total++;
    if (juste) {
      score.justes++;
      score.serie++;
      score.ms = [...score.ms.slice(-9), ms];
      if (score.ms.length === 10) {
        const moy = Math.round(score.ms.reduce((a, b) => a + b, 0) / 10);
        if (proposerRecord(stockage.etat, `rec:${mode}:${posId}`, moy)) messageRecord = `Record : 10 notes justes en ${(moy / 1000).toFixed(1).replace('.', ',')} s chacune en moyenne.`;
      }
    } else score.serie = 0;
    stockage.modifie();
    retour = { juste, texte };
    jouer(courant.midi, 0.9);
    if (juste) setTimeout(() => { if (retour?.juste) suivant(); }, 900);
  }

  function choixNom(L: number, acc: number) {
    if (!courant || retour) return;
    const juste = memeNom({ L, acc, oct: 0 }, courant.note) || (alterations && deMidi(courant.midi, acc < 0 ? -1 : 1).L === L && deMidi(courant.midi, acc < 0 ? -1 : 1).acc === acc);
    etatsChoix = { [`${L}|${acc}`]: juste ? 'ok' : 'faux' };
    repondre(juste, juste ? `Oui : ${nomNote(courant.note, style)}.` : `Non : c’est ${nomNote(courant.note, style)} (doigt ${courant.doigt}, corde de ${CORDES[courant.corde]!.nom}).`);
  }

  function choixCase(corde: number, demiTons: number) {
    if (mode === 'explorer') return caseExplorer(corde, demiTons);
    if (mode !== 'trouve' || !courant || retour) return;
    const juste = corde === courant.corde && demiTons === courant.demiTons;
    marqueReponse = { corde, demiTons, etat: juste ? 'ok' : 'faux' };
    repondre(juste, juste ? `Oui : doigt ${courant.doigt} sur la corde de ${CORDES[courant.corde]!.nom}.` : `Non : ce ${nomNote(courant.note, style)} se joue avec le doigt ${courant.doigt} sur la corde de ${CORDES[courant.corde]!.nom}.`);
  }

  // ------------------------------------------------------------- démanchés
  let trajet = $state<[string, string] | null>(trajetInitial);
  let dem = $state<Demanche | null>(null);
  let fileDem = nouvelleFile(4);
  let verdict = $state<'juste' | 'haut' | 'bas' | null>(null);
  let debutDem = 0;
  let tenue = 0;

  function nouveauDemanche() {
    const pool = trajet ? demanchesDe(trajet[0], trajet[1]) : TRAJETS.flatMap(([a, b]) => demanchesDe(a, b)).filter((d) => Math.abs(position(d.de)!.ff - position(d.vers)!.ff) <= 7);
    dem = choisir(pool, stockage.etat, fileDem);
    verdict = null;
    tenue = 0;
    debutDem = performance.now();
  }
  function ecouterDemanche() {
    if (!dem) return;
    jouer(dem.midiDepart, 0.9);
    jouer(dem.midiArrivee, 1.1, { dans: 1.0 });
  }
  function noterDemanche(juste: boolean) {
    if (!dem) return;
    enregistrerReponse(stockage.etat, dem.cle, juste, performance.now() - debutDem);
    apresReponse(fileDem, dem.cle, juste);
    score.total++;
    if (juste) {
      score.justes++;
      score.serie++;
      if (proposerRecord(stockage.etat, 'rec:demanche:serie', score.serie, false) && score.serie >= 3) messageRecord = `Record : ${score.serie} démanchés justes d’affilée.`;
    } else score.serie = 0;
    stockage.modifie();
  }

  // Écoute de l'arrivée au micro : une note tenue près de la cible est jugée.
  const centsArrivee = $derived(dem && micro.ecoute.midi != null && Math.abs(micro.ecoute.midi - dem.midiArrivee) < 1
    ? Math.round((micro.ecoute.midi - dem.midiArrivee) * 100) : null);
  $effect(() => {
    if (mode !== 'demanche' || !dem || verdict || centsArrivee == null) {
      tenue = 0;
      return;
    }
    tenue++;
    if (tenue >= 6) {
      verdict = jugerArrivee(dem.midiArrivee + centsArrivee / 100, dem.midiArrivee);
      noterDemanche(verdict === 'juste');
    }
  });

  // ------------------------------------------------------------- changements de mode / position
  $effect(() => {
    void mode; void posId; void alterations; void trajet;
    untrack(() => {
      score = { justes: 0, total: 0, serie: 0, ms: [] };
      messageRecord = '';
      selection = null;
      infoCase = '';
      if (mode === 'nom' || mode === 'trouve') {
        file = nouvelleFile(5);
        suivant();
      }
      if (mode === 'demanche') {
        fileDem = nouvelleFile(4);
        nouveauDemanche();
      }
    });
  });

  const marques = $derived.by<Marque[]>(() => {
    if (mode === 'explorer') {
      const g = selection != null ? gamme[selection] : null;
      return g ? [{ corde: g.corde, demiTons: g.midi - CORDES[g.corde]!.midi, etat: 'actif', texte: g.doigt === 'p' ? 'P' : g.doigt }] : [];
    }
    if (mode === 'nom' && courant) return [{ corde: courant.corde, demiTons: courant.demiTons, etat: retour ? (retour.juste ? 'ok' : 'faux') : 'cible', texte: courant.doigt === 'p' ? 'P' : courant.doigt }];
    if (mode === 'trouve') {
      const m: Marque[] = [];
      if (marqueReponse) m.push(marqueReponse);
      if (retour && !retour.juste && courant) m.push({ corde: courant.corde, demiTons: courant.demiTons, etat: 'cible', texte: courant.doigt });
      return m;
    }
    if (mode === 'demanche' && dem) return [
      { corde: dem.corde, demiTons: dem.depart, etat: 'depart', texte: dem.doigtDepart },
      { corde: dem.corde, demiTons: dem.arrivee, etat: 'arrivee', texte: dem.doigtArrivee },
    ];
    return [];
  });

  const cleExercice = $derived<Cle>(cleChoisie !== 'auto' ? cleChoisie : cleConseillee(courant?.midi ?? dem?.midiArrivee ?? 50));
  const pct = (id: string) => maitrise(stockage.etat, clesPosition(id), 3);
  const nomDoigt = (d: Doigt) => (d === 'p' ? 'pouce' : `doigt ${d}`);
</script>

<div class="disposition">
  <div class="gauche">
    <div class="entete">
      <h1>Positions</h1>
      <div class="seg" role="group" aria-label="Exercice">
        {#each MODES as m (m.id)}<button aria-pressed={mode === m.id} onclick={() => (mode = m.id)}>{m.t}</button>{/each}
      </div>
    </div>
    <p class="aide">{MODES.find((m) => m.id === mode)?.aide}</p>

    {#if mode !== 'demanche'}
      <div class="puces" role="group" aria-label="Position">
        {#each POSITIONS as p (p.id)}
          <button class="puce" aria-pressed={posId === p.id} onclick={() => (posId = p.id)} title={libellePosition(p, style)}>
            <span class="anneau" style={`--p:${pct(p.id)}`} aria-hidden="true"></span>{p.court === 'P' ? 'Pouce' : p.court === '½' ? '½' : p.court + 'e'}
            <span class="pct">{pct(p.id)} %</span>
          </button>
        {/each}
      </div>
    {:else}
      <div class="puces" role="group" aria-label="Trajet">
        <button class="puce" aria-pressed={trajet === null} onclick={() => (trajet = null)}>Selon mes révisions</button>
        {#each TRAJETS as t (t.join('-'))}
          <button class="puce" aria-pressed={trajet?.[0] === t[0] && trajet?.[1] === t[1]} onclick={() => (trajet = t)}>
            {position(t[0])!.court}→{position(t[1])!.court}
          </button>
        {/each}
      </div>
    {/if}

    <div class="options">
      <div class="seg" role="group" aria-label="Clé">
        {#each [['auto', 'Clé auto'], ['fa', 'Fa'], ['ut', 'Ut'], ['sol', 'Sol']] as [v, t] (v)}
          <button aria-pressed={cleChoisie === v} onclick={() => (cleChoisie = v as Cle | 'auto')}>{t}</button>
        {/each}
      </div>
      {#if mode !== 'demanche'}
        <label class="case"><input type="checkbox" bind:checked={alterations} /> Dièses et bémols</label>
      {/if}
      {#if mode === 'explorer'}
        <label class="case"><input type="checkbox" bind:checked={nomsSurManche} /> Noms sur le manche</label>
      {/if}
      {#if mode === 'demanche'}<BoutonMicro />{/if}
    </div>

    {#if mode === 'explorer'}
      <h2 class="titre-pos">{libellePosition(pos, style)}</h2>
      <div class="carte portee"><Portee notes={notesExplorer} cle={cleExplorer} aides espacement={46} onnote={choisirExplorer} /></div>
      <p class="discret">Sous chaque note : le doigt, dans la couleur de la corde (La orange, Ré violet, Sol vert, Do brun).</p>
      {#if infoCase}<p class="info" role="status">{infoCase}</p>{/if}
      <div class="carte conseils">
        <p class="etiquette">Repères sonores</p>
        <ul>
          <li><b>Résonance</b> : un Do, Sol, Ré ou La juste fait vibrer la corde à vide du même nom.</li>
          <li><b>4e position</b> : le 1er doigt sonne à l’unisson de la corde à vide voisine plus aiguë.</li>
          <li><b>7e position</b> : le 1er doigt tombe sur l’harmonique du milieu de la corde (octave).</li>
        </ul>
      </div>
    {:else if (mode === 'nom' || mode === 'trouve') && courant}
      <div class="carte exercice">
        {#if mode === 'nom'}
          <p class="consigne">Quelle note joue le <b>{nomDoigt(courant.doigt)}</b> sur la corde de <b style={`color:${CORDES[courant.corde]!.couleur}`}>{CORDES[courant.corde]!.nom}</b> en {pos.label} ?</p>
          <ChoixNote {style} {alterations} etats={etatsChoix} desactive={!!retour} onchoix={choixNom} />
        {:else}
          <p class="consigne">Où joues-tu cette note en <b>{pos.label}</b> ? Touche le manche.</p>
          <Portee notes={[{ n: courant.note, etat: retour ? (retour.juste ? 'ok' : 'faux') : undefined }]} cle={cleExercice} largeurMin={320} />
        {/if}
        <div class="retour">
          {#if retour}
            <p class={retour.juste ? 'bien' : 'mal'} role="status">{retour.texte}</p>
            {#if !retour.juste}<button class="btn primaire" onclick={suivant}>Suivante →</button>{/if}
          {/if}
        </div>
        <div class="stats">
          <span>Justes <b>{score.justes}/{score.total}</b></span>
          <span>Série <b>{score.serie}</b></span>
          <span>Maîtrise de la position <b>{pct(posId)} %</b></span>
        </div>
        {#if messageRecord}<p class="record">{messageRecord}</p>{/if}
      </div>
    {:else if mode === 'demanche' && dem}
      {@const de = position(dem.de)!}
      {@const vers = position(dem.vers)!}
      <div class="carte exercice">
        <p class="consigne">De la <b>{de.label}</b> à la <b>{vers.label}</b>, corde de <b style={`color:${CORDES[dem.corde]!.couleur}`}>{CORDES[dem.corde]!.nom}</b></p>
        <Portee cle={cleExercice} largeurMin={320} notes={[
          { n: deMidi(dem.midiDepart), etiquette: dem.doigtDepart, couleurEtiquette: 'var(--s-sol)' },
          { n: deMidi(dem.midiArrivee), etiquette: dem.doigtArrivee, couleurEtiquette: 'var(--s-la)', etat: verdict === 'juste' ? 'ok' : verdict ? 'faux' : undefined },
        ]} />
        <ol class="etapes">
          <li>Joue le <b>{nomNote(deMidi(dem.midiDepart), style)}</b> ({nomDoigt(dem.doigtDepart)}, point vert).</li>
          <li>{dem.doigtDepart === dem.doigtArrivee ? `Glisse le ${nomDoigt(dem.doigtDepart)} sans le lever` : `Glisse le ${nomDoigt(dem.doigtDepart)} comme doigt-guide`} : c’est le bras qui emmène la main, qui garde sa forme.</li>
          <li>Pose le {nomDoigt(dem.doigtArrivee)} sur le <b>{nomNote(deMidi(dem.midiArrivee), style)}</b> (point orange) et tiens la note.</li>
        </ol>
        <div class="actions">
          <button class="btn" onclick={ecouterDemanche}>▶ Écouter</button>
          {#if !verdict}
            <button class="btn" onclick={() => { verdict = 'juste'; noterDemanche(true); }}>Juste du premier coup</button>
            <button class="btn" onclick={() => { verdict = 'bas'; noterDemanche(false); }}>À retravailler</button>
          {:else}
            <button class="btn primaire" onclick={nouveauDemanche}>Démanché suivant →</button>
          {/if}
        </div>
        {#if micro.actif}
          <Jauge cents={centsArrivee} tolerance={25} libelle={nomNote(deMidi(dem.midiArrivee), style)} />
          <p class="discret">Tiens la note d’arrivée une demi-seconde : elle est jugée automatiquement (±25 cents).</p>
        {/if}
        {#if verdict}
          <p class={verdict === 'juste' ? 'bien' : 'mal'} role="status">
            {verdict === 'juste' ? 'Arrivée juste.' : verdict === 'haut' ? 'Arrivée trop haute : le bras est allé trop loin.' : verdict === 'bas' && micro.actif ? 'Arrivée trop basse : le bras n’est pas allé assez loin.' : 'Noté : ce démanché reviendra bientôt.'}
          </p>
        {/if}
        <div class="stats">
          <span>Justes <b>{score.justes}/{score.total}</b></span>
          <span>Série <b>{score.serie}</b></span>
        </div>
        {#if messageRecord}<p class="record">{messageRecord}</p>{/if}
      </div>
    {/if}
  </div>

  <div class="droite">
    <Manche {marques} cadre={mode === 'demanche' ? null : posId} doigts={mode === 'explorer'}
      noms={mode === 'explorer' && nomsSurManche} {alterations} {style}
      interactif={mode === 'explorer' || mode === 'trouve'} oncase={choixCase} />
  </div>
</div>

<style>
  .disposition { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 1.5rem; align-items: start; }
  @media (max-width: 900px) { .disposition { grid-template-columns: minmax(0, 1fr); } }
  @media (min-width: 901px) { .droite { position: sticky; top: 6.5rem; } }
  .droite { display: flex; justify-content: center; }
  .entete { display: flex; flex-wrap: wrap; align-items: center; gap: .5rem 1.5rem; }
  .entete h1 { margin: 0; }
  .aide { color: var(--ink-soft); margin: .6rem 0 1rem; }
  .puces { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: .8rem; }
  .puce { appearance: none; font: inherit; font-size: .9rem; font-weight: 700; padding: .35em .8em; border-radius: 999px; border: 1px solid var(--rule); background: var(--surface); color: var(--ink-soft); cursor: pointer; display: inline-flex; align-items: center; gap: .45em; }
  .puce[aria-pressed='true'] { border-color: var(--accent); background: var(--accent-soft); color: var(--ink); }
  .anneau { width: 14px; height: 14px; border-radius: 50%; background: conic-gradient(var(--good) calc(var(--p) * 1%), var(--rule) 0); }
  .pct { font: .72rem var(--f-mono); font-weight: 400; }
  .options { display: flex; flex-wrap: wrap; align-items: center; gap: .6rem 1.2rem; margin-bottom: 1rem; }
  .case { display: inline-flex; gap: .4rem; align-items: center; cursor: pointer; }
  .case input { width: 18px; height: 18px; accent-color: var(--accent); }
  .titre-pos { margin: .4rem 0 .6rem; }
  .portee { padding: .4rem .6rem; overflow-x: auto; }
  .info { font-weight: 700; }
  .conseils { margin-top: 1rem; }
  .conseils ul { margin: .3rem 0 0; padding-left: 1.2em; }
  .exercice { display: flex; flex-direction: column; gap: .9rem; }
  .consigne { font-size: 1.15rem; margin: 0; }
  .retour { min-height: 2.6rem; display: flex; flex-wrap: wrap; align-items: center; gap: .6rem 1rem; }
  .retour p { margin: 0; }
  .bien { color: var(--good); font-weight: 700; }
  .mal { color: var(--bad); font-weight: 700; }
  .stats { display: flex; flex-wrap: wrap; gap: .3rem 1.4rem; font: .82rem var(--f-mono); color: var(--ink-soft); border-top: 1px solid var(--rule); padding-top: .6rem; }
  .stats b { color: var(--ink); font-weight: 500; }
  .record { margin: 0; color: var(--accent); font-weight: 700; }
  .etapes { margin: 0; padding-left: 1.3em; }
  .actions { display: flex; flex-wrap: wrap; gap: .5rem; }
</style>
