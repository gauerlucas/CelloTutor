<script lang="ts">
  // Lecture de notes : nommer une note (étapes débloquées par clé), lecture en suite
  // chronométrée, et notes tirées des morceaux-objectifs.
  import { untrack } from 'svelte';
  import Portee, { type NotePortee } from '../components/Portee.svelte';
  import ChoixNote from '../components/ChoixNote.svelte';
  import Manche, { type Marque } from '../components/Manche.svelte';
  import { doigterAuto, demiTonsDe, courtPosition } from '../lib/morceaux/doigte';
  import { CORDES } from '../lib/musique/violoncelle';
  import { direNote } from '../lib/audio/voix';
  import { chanter } from '../lib/audio/chant';
  import { stockage } from '../lib/stockage.svelte';
  import type { RetourLecture } from '../lib/etat';
  import { jouer } from '../lib/audio/son';
  import { CLES, CORDE_DU_DEGRE, cheminDepuisRepere, placeSurPortee, type Cle } from '../lib/musique/cles';
  import { deDegre, degre, midi, nomNote, type Note } from '../lib/musique/notes';
  import {
    cleLecture, ETAPES, etapesOuvertes, itemsEtape, itemsOuverts, maitriseEtape, notesParMinute, ORDRE_CLES, tirerSuite, type ItemLecture,
  } from '../lib/exercices/lecture';
  import { apresReponse, choisir, enregistrerReponse, nouvelleFile, proposerRecord } from '../lib/revision';
  import { ficheMorceau } from '../lib/morceaux';
  import { analyserMorceau } from '../lib/morceaux/analyse';

  type Mode = 'nommer' | 'placer' | 'suite' | 'morceaux' | 'revisions';
  let { modeInitial = 'nommer' }: { modeInitial?: Mode } = $props();

  let mode = $state<Mode>(modeInitial);
  let clef = $state<Cle>('fa');
  let etapeChoisie = $state<number | 'melange'>('melange');
  const style = $derived(stockage.etat.reglages.nomsNotes);
  const nomD = (d: number) => nomNote(deDegre(d), style);

  const ouvertes = $derived(etapesOuvertes(stockage.etat, clef));
  const MODES: { id: Mode; t: string; aide: string }[] = [
    { id: 'nommer', t: 'Nommer', aide: 'Une note sur la portée : donne son nom. Touches 1 à 7 pour répondre vite. Une erreur revient deux ou trois notes plus tard.' },
    { id: 'placer', t: 'Placer', aide: 'Un nom de note : touche sa place sur la portée, ligne ou interligne. Produire la place grave la note mieux que la reconnaître.' },
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
  /** Après une réponse : juste, ou la correction déroulée depuis le repère le plus proche. */
  let retour = $state<{ juste: boolean; nom: string; place: string; chemin: number[]; choisi: number } | null>(null);
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

  const PAS_MS = 300;
  function repondre(L: number, acc: number) {
    if (!courant) return;
    const n = courant.note;
    // Après une erreur, on continue en rejouant soi-même la bonne réponse (elle se grave mieux).
    if (retour) {
      if (!retour.juste && L === n.L) suivant();
      return;
    }
    const juste = L === n.L && (mode !== 'morceaux' || acc === n.acc);
    const ms = performance.now() - debut;
    enregistrerReponse(stockage.etat, courant.cle, juste, ms);
    if (mode !== 'morceaux') apresReponse(file, courant.cle, juste);
    stockage.modifie();
    score.total++;
    if (juste) { score.justes++; score.serie++; } else score.serie = 0;
    etats = juste ? { [`${L}|${acc}`]: 'ok' } : { [`${L}|${acc}`]: 'faux' };
    const chemin = juste ? [degre(n)] : cheminDepuisRepere(degre(n), courant.clef);
    retour = { juste, nom: nomNote(n, style), place: placeSurPortee(n, courant.clef), chemin, choisi: L };
    if (juste) {
      const fin = sonsNote(n, 0, 0.9);
      setTimeout(() => { if (retour?.juste) suivant(); }, Math.max(1000, fin + 250));
    } else {
      // On entend le chemin, du repère à la note, puis la note tenue (et son nom).
      if (rl.violoncelle) chemin.slice(0, -1).forEach((d, k) => jouer(midi(deDegre(d)), 0.32, { dans: (k * PAS_MS) / 1000 }));
      sonsNote(n, (chemin.length - 1) * PAS_MS, 1.1);
    }
  }

  const couleurRepere = (d: number) => (CORDE_DU_DEGRE[d] ? `rep-${CORDE_DU_DEGRE[d]}` : 'rep-autre');
  /** Portée de l'exercice : la note seule, puis, après une erreur, l'escalier depuis le repère. */
  const SLOTS = 7, SLOT_QUESTION = 3;
  const notePortee = $derived.by<(NotePortee | null)[]>(() => {
    if (!courant) return [];
    const slots: (NotePortee | null)[] = Array(SLOTS).fill(null);
    if (!retour) {
      slots[SLOT_QUESTION] = { n: courant.note };
      return slots;
    }
    if (retour.juste) {
      slots[SLOT_QUESTION] = { n: courant.note, etat: 'ok', morph: retour.nom, image: imageDe(courant.note.L), delai: -120 };
      return slots;
    }
    const ch = retour.chemin;
    // la note visée reste à sa place quand c'est possible : l'escalier pousse vers la gauche
    const fin = Math.min(SLOTS - 1, Math.max(SLOT_QUESTION, ch.length - 1));
    ch.forEach((d, k) => {
      const derniere = k === ch.length - 1;
      const premiere = k === 0;
      const n = derniere ? courant!.note : deDegre(d);
      slots[fin - (ch.length - 1) + k] = {
        n,
        etat: derniere ? 'faux' : premiere ? couleurRepere(d) : 'pas',
        morph: derniere ? retour!.nom : premiere ? nomD(d) : nomD(d).toLowerCase(),
        image: derniere || premiere ? imageDe(n.L) : undefined,
        petitMorph: !derniere && !premiere,
        petite: !derniere && !premiere,
        delai: derniere ? undefined : k * PAS_MS,
        delaiMorph: k * PAS_MS,
      };
    });
    return slots;
  });
  const texteChemin = $derived.by(() => {
    if (!retour || retour.juste || !courant) return '';
    const ch = retour.chemin;
    if (ch.length === 1) {
      const corde = CORDE_DU_DEGRE[ch[0]!];
      return corde
        ? `C’est un repère : la note de la corde de ${nomD(ch[0]!)} à vide (ligne de couleur).`
        : `C’est un repère de la ${CLES[courant.clef].label} : à connaître par cœur.`;
    }
    const k = ch.length - 1;
    const sens = ch[1]! > ch[0]! ? 'au-dessus' : 'en dessous';
    return `Depuis le repère ${nomD(ch[0]!)} : ${ch.map((d, i) => (i === k ? retour!.nom : nomD(d).toLowerCase())).join(' → ')}, ${k} note${k > 1 ? 's' : ''} ${sens}.`;
  });

  // ------------------------------------------------------------- voix et palais des notes
  const palais = $derived(stockage.etat.reglages.palais);
  /**
   * Annonce une note : chantée à sa hauteur exacte (syllabe de solfège), ou dite avec le mot
   * de son image. `question` : dans Placer, on ne donne que le nom, sans le son de la note.
   */
  function annoncer(n: Note, dansMs: number, question = false) {
    const v = stockage.etat.reglages.voixNoms;
    if (v === 'chantee' && !question) chanter(midi(n), n.L, dansMs / 1000);
    else if (v !== 'aucune') {
      const mot = motDe(n.L);
      direNote(nomNote(n, 'latin') + (mot && !question ? `, ${mot}` : ''), dansMs);
    }
  }
  /** Ce que l'exercice donne après une réponse : réglable dans le panneau « Après ta réponse ». */
  const rl = $derived(stockage.etat.reglages.retourLecture);
  const imageDe = (L: number) => (rl.image ? palais[L]?.image : undefined);
  const motDe = (L: number) => (rl.mot ? palais[L]?.mot : undefined);
  function reglerRetour<K extends keyof RetourLecture>(k: K, v: RetourLecture[K]) {
    stockage.regler('retourLecture', { ...rl, [k]: v });
  }
  /**
   * Fait entendre une note à partir de tMs : au violoncelle et/ou par son nom, ensemble ou
   * l'un après l'autre selon les choix. Renvoie l'heure (ms) où tout est fini.
   */
  function sonsNote(n: Note, tMs: number, dureeViolon: number): number {
    const v = rl.violoncelle, nom = stockage.etat.reglages.voixNoms !== 'aucune';
    let tv = tMs, tn = tMs;
    if (v && nom && rl.ordre === 'violon-nom') tn = tMs + 750;
    if (v && nom && rl.ordre === 'nom-violon') tv = tMs + 850;
    if (v) jouer(midi(n), dureeViolon, { dans: tv / 1000 });
    if (nom) annoncer(n, tn);
    return Math.max(tMs + 400, v ? tv + dureeViolon * 1000 : 0, nom ? tn + 950 : 0);
  }

  // ------------------------------------------------------------- manche et filigrane
  /** Corde, doigt et position de la note montrée (doigté le plus simple). */
  function doigteDe(n: Note) {
    const m = midi(n);
    const d = doigterAuto([{ midi: m, duree: 1 }])[0];
    if (!d) return null;
    const marque: Marque = { corde: d.corde, demiTons: demiTonsDe(m, d), etat: 'actif', texte: d.doigt === '0' ? '0' : d.doigt === 'p' ? 'P' : d.doigt };
    const texte = d.doigt === '0' ? `corde de ${CORDES[d.corde]!.nom} à vide` : `corde de ${CORDES[d.corde]!.nom}, doigt ${d.doigt === 'p' ? 'pouce' : d.doigt}, ${courtPosition(d.position)}`;
    return { marque, cadre: d.position || null, texte };
  }
  /** Indices de repères en filigrane : pleins pour une note nouvelle, ils pâlissent puis disparaissent avec la maîtrise. */
  const OPACITE_PAR_BOITE = [0.85, 0.5, 0.22, 0, 0, 0];
  const opaciteDe = (cle: string) => OPACITE_PAR_BOITE[stockage.etat.items[cle]?.boite ?? 0] ?? 0;

  // ------------------------------------------------------------- placer (exercice inverse)
  let cibleP = $state<ItemLecture | null>(null);
  let retourP = $state<{ juste: boolean; choisi: number } | null>(null);
  const cleP = (d: number) => `LP|${clef}|${d}`;
  const poolPlacer = $derived(itemsOuverts(stockage.etat, clef).map((i) => ({ ...i, cle: cleP(i.d) })));
  function suivantP() {
    retourP = null;
    cibleP = choisir(poolPlacer, stockage.etat, file);
    debut = performance.now();
    if (cibleP) annoncer(cibleP.note, 150, true);
  }
  function placer(d: number) {
    const c = cibleP;
    if (!c) return;
    const bon = deDegre(d).L === c.note.L;
    if (retourP) {
      if (!retourP.juste && bon) suivantP();
      return;
    }
    enregistrerReponse(stockage.etat, c.cle, bon, performance.now() - debut);
    apresReponse(file, c.cle, bon);
    stockage.modifie();
    score.total++;
    if (bon) { score.justes++; score.serie++; } else score.serie = 0;
    retourP = { juste: bon, choisi: d };
    if (bon) {
      const fin = sonsNote(deDegre(d), 0, 0.9);
      setTimeout(() => { if (retourP?.juste) suivantP(); }, Math.max(1000, fin + 250));
    } else {
      if (rl.violoncelle) jouer(midi(deDegre(d)), 0.5);
      sonsNote(c.note, 600, 1.0);
    }
  }
  const notesPlacer = $derived.by<(NotePortee | null)[]>(() => {
    const slots: (NotePortee | null)[] = Array(SLOTS).fill(null);
    if (!cibleP || !retourP) return slots;
    const ch = deDegre(retourP.choisi);
    if (retourP.juste) slots[SLOT_QUESTION] = { n: ch, etat: 'ok', morph: nomD(retourP.choisi), image: imageDe(ch.L), delai: -120 };
    else {
      slots[SLOT_QUESTION - 1] = { n: ch, etat: 'faux', morph: nomD(retourP.choisi).toLowerCase(), petitMorph: true, delai: -120 };
      slots[SLOT_QUESTION + 1] = { n: cibleP.note, morph: nomD(cibleP.d), image: imageDe(cibleP.note.L), delai: 380 };
    }
    return slots;
  });

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
      else if (mode === 'placer') suivantP();
      else suivant();
    });
  });

  const pct = (k: number) => maitriseEtape(stockage.etat, clef, ETAPES[k]!);
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
    {#if mode === 'nommer' || mode === 'placer'}
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
    {:else if mode === 'placer'}
      {#if cibleP}
        {@const dgp = retourP ? doigteDe(retourP.juste ? deDegre(retourP.choisi) : cibleP.note) : null}
        <p class="question">Place <span class="nom-note" style={`color:var(--n${cibleP.note.L})`}>{nomD(cibleP.d)}</span> <span class="image-note">{imageDe(cibleP.note.L)}</span> sur la portée</p>
        <div class="scene">
          <div class="portee-grande seule">
            <Portee notes={notesPlacer} cle={clef} nomCle={false} opaciteAides={opaciteDe(cibleP.cle)} espacement={64} hauteur={164}
              onplace={placer} xPlace={SLOT_QUESTION} titre="Portée : touche une ligne ou un interligne" />
          </div>
          {#if rl.manche}
            <div class="mini-manche" class:vide={!dgp}>
              <Manche marques={dgp ? [dgp.marque] : []} cadre={dgp?.cadre ?? null} hauteur="270px" titre="Où jouer cette note" />
              <p class="discret">{dgp ? dgp.texte : 'Corde et doigt après ta réponse'}</p>
            </div>
          {/if}
        </div>
        <div class={`retour ${retourP ? (retourP.juste ? 'r-ok' : 'r-faux') : ''}`} aria-live="polite">
          {#if retourP?.juste}
            <p class="grand bien">Oui : <span class="nom-note" style={`color:var(--n${cibleP.note.L})`}>{nomD(retourP.choisi)}</span> <span class="place">({placeSurPortee(deDegre(retourP.choisi), clef)})</span></p>
          {:else if retourP}
            <p class="grand mal">Ici, c’est {nomD(retourP.choisi).toLowerCase()}</p>
            <p class="chemin">{nomD(cibleP.d)} est {placeSurPortee(cibleP.note, clef)}. Touche sa place pour continuer.</p>
          {:else}
            <p class="discret">Survole la portée : la note suit ta souris. Touche pour répondre.</p>
          {/if}
        </div>
        <div class="stats">
          <span>Justes <b>{score.justes}/{score.total}</b></span>
          <span>Série <b>{score.serie}</b></span>
        </div>
      {:else}
        <p>Aucune note dans cette étape.</p>
      {/if}
    {:else if courant}
      {@const dg = retour ? doigteDe(courant.note) : null}
      <div class="scene">
        <div class="portee-grande seule">
          <Portee notes={notePortee} cle={courant.clef} nomCle={false} opaciteAides={opaciteDe(courant.cle)} espacement={64} hauteur={164} />
        </div>
        {#if rl.manche}
          <div class="mini-manche" class:vide={!dg}>
            <Manche marques={dg ? [dg.marque] : []} cadre={dg?.cadre ?? null} hauteur="270px" titre="Où jouer cette note" />
            <p class="discret">{dg ? dg.texte : 'Corde et doigt après ta réponse'}</p>
          </div>
        {/if}
      </div>
      {#if mode === 'revisions'}<p class="discret">{CLES[courant.clef].label}</p>{/if}
      <div class={`retour ${retour ? (retour.juste ? 'r-ok' : 'r-faux') : ''}`} aria-live="polite">
        {#if retour?.juste}
          <p class="grand bien">Oui : <span class="nom-note" style={`color:var(--n${courant.note.L})`}>{retour.nom}</span> <span class="image-note">{imageDe(courant.note.L)} {motDe(courant.note.L)}</span></p>
        {:else if retour}
          <p class="grand mal">C’est <span class="nom-note" style={`color:var(--n${courant.note.L})`}>{retour.nom}</span> <span class="image-note">{imageDe(courant.note.L)} {motDe(courant.note.L)}</span> <span class="place">({retour.place})</span></p>
          <p class="chemin">{texteChemin}</p>
        {:else}
          <p class="discret">Quelle est cette note ?</p>
        {/if}
      </div>
      <ChoixNote {style} alterations={mode === 'morceaux'} {etats} desactive={!!retour?.juste}
        attendu={retour && !retour.juste ? courant.note.L : null} onchoix={repondre} />
      {#if retour && !retour.juste}
        <p class="consigne">Appuie sur <b>{nomNote({ ...courant.note, acc: 0 }, style)}</b> (touche {courant.note.L + 1}) pour continuer. Cette note reviendra dans deux ou trois questions.</p>
      {/if}
      <div class="stats">
        <span>Justes <b>{score.justes}/{score.total}</b></span>
        <span>Série <b>{score.serie}</b></span>
      </div>
    {:else}
      <p>{mode === 'revisions' ? 'Rien à réviser aujourd’hui : tout est à jour.' : mode === 'morceaux' ? 'Aucune note de tes morceaux-objectifs ne tombe dans cette clé.' : 'Aucune note dans cette étape.'}</p>
      {#if mode === 'revisions'}<button class="btn primaire" onclick={() => (mode = 'nommer')}>Passer aux nouvelles notes</button>{/if}
    {/if}
  </section>

  <div class="colonne">
  <aside class="carte reperes">
    <p class="etiquette">Repères en {CLES[courant?.clef ?? clef].label}</p>
    <Portee notes={CLES[courant?.clef ?? clef].reperes.map((d) => ({ n: deDegre(d), etiquette: nomD(d), etat: retour && !retour.juste && retour.chemin[0] === d ? couleurRepere(d) : undefined }))} cle={courant?.clef ?? clef} aides espacement={56} hauteur={190} />
    <p class="discret">Lis par écart : trouve le repère le plus proche, puis compte les lignes et les interlignes.</p>
  </aside>
  {#if mode !== 'suite'}
    <section class="carte sens" aria-label="Après ta réponse">
      <p class="etiquette">Après ta réponse</p>
      <div class="ligne-sens">
        <span>Son</span>
        <button class="puce" aria-pressed={rl.violoncelle} onclick={() => reglerRetour('violoncelle', !rl.violoncelle)}>🎻 Violoncelle</button>
      </div>
      <div class="ligne-sens">
        <span>Nom</span>
        <div class="seg petit" role="group" aria-label="Nom de la note">
          <button aria-pressed={stockage.etat.reglages.voixNoms === 'chantee'} onclick={() => stockage.regler('voixNoms', 'chantee')}>Chanté</button>
          <button aria-pressed={stockage.etat.reglages.voixNoms === 'parlee'} onclick={() => stockage.regler('voixNoms', 'parlee')}>Dit</button>
          <button aria-pressed={stockage.etat.reglages.voixNoms === 'aucune'} onclick={() => stockage.regler('voixNoms', 'aucune')}>Muet</button>
        </div>
      </div>
      {#if rl.violoncelle && stockage.etat.reglages.voixNoms !== 'aucune'}
        <div class="ligne-sens">
          <span>Ordre</span>
          <div class="seg petit" role="group" aria-label="Ordre des sons">
            <button aria-pressed={rl.ordre === 'ensemble'} onclick={() => reglerRetour('ordre', 'ensemble')}>Ensemble</button>
            <button aria-pressed={rl.ordre === 'violon-nom'} onclick={() => reglerRetour('ordre', 'violon-nom')}>🎻 puis nom</button>
            <button aria-pressed={rl.ordre === 'nom-violon'} onclick={() => reglerRetour('ordre', 'nom-violon')}>Nom puis 🎻</button>
          </div>
        </div>
      {/if}
      <div class="ligne-sens">
        <span>Voir</span>
        <div class="puces">
          <button class="puce" aria-pressed={rl.image} onclick={() => reglerRetour('image', !rl.image)}>{palais[0]?.image} Image</button>
          <button class="puce" aria-pressed={rl.mot} onclick={() => reglerRetour('mot', !rl.mot)}>Mot</button>
          <button class="puce" aria-pressed={rl.manche} onclick={() => reglerRetour('manche', !rl.manche)}>Manche</button>
        </div>
      </div>
      <button class="btn discret-btn" onclick={() => sonsNote((mode === 'placer' ? cibleP?.note : courant?.note) ?? deDegre(18), 0, 0.9)}>▶ Essayer</button>
    </section>
  {/if}
  </div>
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
  .portee-grande.seule { max-width: 620px; width: 100%; margin: 0 auto; }
  .scene { display: flex; align-items: center; justify-content: center; gap: 1rem; }
  .scene .portee-grande.seule { flex: 1; margin: 0; }
  .mini-manche { display: flex; flex-direction: column; align-items: center; gap: .3rem; width: 170px; flex: none; transition: opacity .2s; }
  .mini-manche p { margin: 0; font-size: .8rem; text-align: center; }
  .mini-manche.vide :global(svg) { opacity: .35; }
  .question { margin: 0; text-align: center; font-size: 1.4rem; font-family: var(--f-display); }
  .retour { min-height: 4.6rem; display: flex; flex-direction: column; justify-content: center; align-items: center; gap: .2rem; text-align: center;
    border-radius: 10px; padding: .4rem .8rem; transition: background .15s; }
  .retour p { margin: 0; }
  .retour.r-ok { background: var(--good-bg); }
  .retour.r-faux { background: color-mix(in srgb, var(--bad) 13%, var(--surface)); }
  .grand { font-size: 1.5rem; font-family: var(--f-display); }
  .nom-note { font-weight: 800; }
  .image-note { font: 500 1rem var(--f-body); color: var(--ink-soft); }
  .place { font-size: 1rem; font-family: var(--f-body); font-weight: 500; }
  .chemin { font-size: 1.05rem; color: var(--ink); }
  .consigne { margin: 0; width: 100%; max-width: none; text-align: center; color: var(--ink-soft); }
  .bien { color: var(--good); font-weight: 700; }
  .mal { color: var(--bad); font-weight: 700; }
  .bilan { font-size: 1.15rem; font-weight: 700; margin: 0; }
  .stats { display: flex; gap: 1.4rem; font: .82rem var(--f-mono); color: var(--ink-soft); border-top: 1px solid var(--rule); padding-top: .6rem; }
  .stats b { color: var(--ink); font-weight: 500; }
  .reperes p { margin: .3rem 0; }
  .colonne { display: flex; flex-direction: column; gap: 1rem; }
  .sens { display: flex; flex-direction: column; gap: .5rem; }
  .sens .etiquette { margin: 0; }
  .ligne-sens { display: flex; align-items: center; gap: .6rem; flex-wrap: wrap; }
  .ligne-sens > span { min-width: 3.2rem; color: var(--ink-soft); font-size: .9rem; }
  .puces { display: flex; flex-wrap: wrap; gap: 6px; }
  .puce { appearance: none; font: inherit; font-size: .88rem; font-weight: 700; padding: .3em .75em; border-radius: 999px; border: 1px solid var(--rule); background: var(--surface); color: var(--ink-soft); cursor: pointer; text-decoration: line-through; opacity: .7; }
  .puce[aria-pressed='true'] { text-decoration: none; opacity: 1; color: var(--ink); border-color: var(--ink-soft); background: color-mix(in srgb, var(--ink) 6%, var(--surface)); }
  .seg.petit button { font-size: .85rem; padding: .3em .7em; }
  .sens .discret-btn { align-self: flex-start; }
</style>
