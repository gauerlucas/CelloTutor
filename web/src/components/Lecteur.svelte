<script lang="ts">
  // Lecteur de morceau : partition gravée (Verovio), son, tempo, boucle, décompte, manche
  // synchronisé, conseils par mesure, passages et correction des doigtés.
  import { onDestroy, untrack } from 'svelte';
  import Manche, { type Marque } from './Manche.svelte';
  import { stockage } from '../lib/stockage.svelte';
  import type { FicheMorceau } from '../lib/morceaux';
  import { analyser, nomTonalite, type Partition } from '../lib/morceaux/partition';
  import { choixSurCorde, courtPosition, demiTonsDe, doigtesMorceau, type Doigte } from '../lib/morceaux/doigte';
  import { competencesDe, decouper, NIVEAUX, preparation, reperesDe, SEUIL_PRET } from '../lib/morceaux/passages';
  import { graver, preparerXml, type Gravure } from '../lib/morceaux/rendu';
  import { etatDe } from '../lib/morceaux/suivi';
  import { clic, couperSuite, jouer, maintenantAudio } from '../lib/audio/son';
  import { candidats } from '../lib/morceaux/doigte';
  import { CORDES } from '../lib/musique/violoncelle';
  import { deMidi, nomNote } from '../lib/musique/notes';
  import { jourDe } from '../lib/revision';
  import { seance } from '../lib/seance.svelte';
  import type { Cle } from '../lib/musique/cles';

  let { fiche, passageInitial = null }: { fiche: FicheMorceau; passageInitial?: number | null } = $props();

  // ------------------------------------------------------------- données du morceau
  const lu = $derived.by<{ p: Partition | null; err: string }>(() => {
    try {
      return { p: analyser(fiche.xml), err: '' };
    } catch (e) {
      return { p: null, err: e instanceof Error ? e.message : String(e) };
    }
  });
  const partition = $derived(lu.p);
  let erreurGravure = $state('');
  const erreur = $derived(lu.err || erreurGravure);
  const suivi = $derived(stockage.etat.morceaux[fiche.id]);
  const corrections = $derived(suivi?.doigtes ?? {});
  const doigtes = $derived<Doigte[]>(partition ? doigtesMorceau(partition.notes, fiche.doigtes ?? null, corrections) : []);
  const passages = $derived(partition ? decouper(partition.mesures, partition.notes, suivi?.coupures) : []);
  const style = $derived(stockage.etat.reglages.nomsNotes);

  let cle = $state<Cle | 'origine'>(stockage.etat.morceaux[fiche.id]?.cle ?? 'origine');
  let tempo = $state(stockage.etat.morceaux[fiche.id]?.tempo ?? 0);
  let positions = $state(true);
  let decompte = $state(true);
  let metronome = $state(false);
  let melodie = $state(true);
  let boucle = $state(true);
  $effect(() => {
    if (partition && !tempo) tempo = Math.round(partition.tempo);
  });

  function memoriser(f: (s: ReturnType<typeof etatDe>) => void) {
    f(etatDe(stockage.etat, fiche.id));
    stockage.modifie();
  }

  // ------------------------------------------------------------- gravure
  let largeur = $state(0);
  let gravure = $state<Gravure | null>(null);
  let chargement = $state(true);
  let zone: HTMLDivElement | undefined = $state();
  const xmlPrepare = $derived.by(() => {
    if (!partition) return '';
    try {
      return preparerXml(fiche.xml, { cle, doigtes, positions });
    } catch {
      return fiche.xml;
    }
  });
  const echelle = $derived(Math.round(48 * stockage.etat.reglages.taillePupitre));
  let jeton = 0;
  $effect(() => {
    const xml = xmlPrepare, l = largeur, e = echelle;
    if (!xml || l < 200 || !partition) return;
    const debuts = partition.notes.map((n) => n.debut);
    const moi = ++jeton;
    const minuteur = setTimeout(async () => {
      chargement = true;
      try {
        const g = await graver(xml, debuts, l, e);
        if (moi === jeton) gravure = g;
      } catch (err) {
        if (moi === jeton) erreurGravure = `La partition n’a pas pu être gravée : ${err instanceof Error ? err.message : err}`;
      } finally {
        if (moi === jeton) chargement = false;
      }
    }, untrack(() => gravure) ? 250 : 0);
    return () => clearTimeout(minuteur);
  });

  const indiceDeId = $derived(new Map((gravure?.ids ?? []).map((id, i) => [id, i] as const).filter(([id]) => id)));

  // ------------------------------------------------------------- sélection et lecture
  let selection = $state<number | null>(null);
  // Ouvert sur un passage (depuis la séance) : on se place sur sa première note.
  let placeInitiale = false;
  $effect(() => {
    const p = passageSel != null ? passages[passageSel] : undefined;
    if (!placeInitiale && p) {
      placeInitiale = true;
      selection = p.debutNote;
    }
  });
  let courant = $state<number | null>(null);
  let passageSel = $state<number | null>(passageInitial != null && Number.isFinite(passageInitial) ? passageInitial : null);
  let joue = $state(false);
  let temps = $state<string>('');

  const focus = $derived(courant ?? selection);
  const mesureFocus = $derived(focus != null && partition ? partition.notes[focus]!.mesure : passageSel != null ? passages[passageSel]?.de ?? 1 : 1);
  const conseil = $derived(fiche.conseils?.[String(mesureFocus)] ?? null);

  // Surlignage dans le SVG (manipulation directe : le SVG vient de Verovio).
  let surlignes: Element[] = [];
  $effect(() => {
    const ids = gravure?.ids;
    void gravure;
    for (const el of surlignes) el.classList.remove('joue', 'choisie');
    surlignes = [];
    if (!zone || !ids) return;
    const marquer = (i: number | null, classe: string) => {
      const id = i != null ? ids[i] : null;
      const el = id ? zone!.querySelector(`[id="${id}"]`) : null;
      if (el) {
        el.classList.add(classe);
        surlignes.push(el);
      }
      return el;
    };
    marquer(selection, 'choisie');
    const el = marquer(courant, 'joue');
    if (el && joue) {
      const r = el.getBoundingClientRect(), z = zone.getBoundingClientRect();
      if (r.top < z.top + 40 || r.bottom > z.bottom - 40) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  });

  function surClicPartition(e: MouseEvent) {
    const g = (e.target as Element).closest('g.note');
    if (!g) return;
    const i = indiceDeId.get(g.id);
    if (i == null) return;
    selection = i;
    if (!joue) jouer(partition!.notes[i]!.midi, 0.9);
  }

  let intervalle: ReturnType<typeof setInterval> | null = null;
  let anim = 0;
  let debutLecture = 0;

  interface Evenement { q: number; note?: number; clic?: boolean; accent?: boolean }

  function lancer() {
    if (!partition) return;
    const p = partition;
    const pas = 4 / p.unite;
    let qDebut: number, qFin: number;
    const pa = passageSel != null ? passages[passageSel] : null;
    if (pa) {
      qDebut = p.mesures[pa.de - 1]!.debut;
      const m = p.mesures[pa.a - 1]!;
      qFin = m.debut + m.duree;
    } else {
      qDebut = selection != null ? p.mesures[p.notes[selection]!.mesure - 1]!.debut : 0;
      const m = p.mesures[p.mesures.length - 1]!;
      qFin = m.debut + m.duree;
    }
    const evts: Evenement[] = [];
    for (const n of p.notes) if (n.debut >= qDebut - 1e-6 && n.debut < qFin - 1e-6) evts.push({ q: n.debut, note: n.i });
    if (metronome) {
      for (const m of p.mesures) {
        if (m.debut < qDebut - 1e-6 || m.debut >= qFin - 1e-6) continue;
        for (let q = m.debut, k = 0; q < m.debut + m.duree - 1e-6; q += pas, k++) evts.push({ q, clic: true, accent: k === 0 });
      }
    }
    evts.sort((a, b) => a.q - b.q || (a.clic ? -1 : 1));
    const sParQ = 60 / tempo;
    const longueur = (qFin - qDebut) * sParQ;
    const mesureType = p.mesures[0]!.duree;
    const tempsDecompte = decompte ? mesureType * sParQ : 0;
    const t0 = maintenantAudio() + 0.15 + tempsDecompte;
    if (decompte) for (let q = 0, k = 0; q < mesureType - 1e-6; q += pas, k++) clic(0.15 + q * sParQ, k === 0);
    let iter = 0, ptr = 0;
    const repeter = pa ? boucle : false;
    joue = true;
    courant = null;
    debutLecture = Date.now();

    const programmer = () => {
      const maintenant = maintenantAudio();
      const horizon = maintenant + 0.3;
      while (true) {
        if (ptr >= evts.length) {
          if (!repeter) break;
          iter++;
          ptr = 0;
        }
        const ev = evts[ptr]!;
        const t = t0 + iter * longueur + (ev.q - qDebut) * sParQ;
        if (t > horizon) break;
        const dans = Math.max(0, t - maintenant - 0.03);
        if (ev.clic) clic(dans, ev.accent);
        else if (melodie && ev.note != null) jouer(p.notes[ev.note]!.midi, Math.max(0.12, p.notes[ev.note]!.duree * sParQ * 0.96), { dans, suite: true });
        ptr++;
      }
    };
    programmer();
    intervalle = setInterval(programmer, 60);

    const suivre = () => {
      const t = maintenantAudio();
      if (t < t0) {
        const restant = Math.ceil((t0 - t) / (pas * sParQ));
        temps = `Décompte… ${restant}`;
        anim = requestAnimationFrame(suivre);
        return;
      }
      const ecoule = t - t0;
      const tour = Math.floor(ecoule / longueur);
      if (!repeter && tour >= 1) {
        arreter();
        return;
      }
      const q = qDebut + (ecoule - tour * longueur) / sParQ;
      // Note sonnante : la dernière dont le début est passé.
      let i: number | null = null;
      for (const e of evts) {
        if (e.note == null) continue;
        if (e.q <= q + 1e-6) i = e.note;
        else break;
      }
      if (i !== courant) courant = i;
      const mes = p.notes[i ?? 0]?.mesure ?? 1;
      temps = `Mesure ${mes}${repeter ? ` · tour ${tour + 1}` : ''}`;
      anim = requestAnimationFrame(suivre);
    };
    anim = requestAnimationFrame(suivre);
  }

  function arreter() {
    if (intervalle) clearInterval(intervalle);
    intervalle = null;
    cancelAnimationFrame(anim);
    couperSuite();
    if (joue) {
      const minutes = (Date.now() - debutLecture) / 60000;
      if (minutes >= 0.25 && !seance.active) {
        jourDe(stockage.etat, Date.now()).minutes += Math.round(minutes * 10) / 10;
        stockage.modifie();
      }
    }
    joue = false;
    temps = '';
    if (courant != null) selection = courant;
    courant = null;
  }

  onDestroy(arreter);

  function basculer() {
    if (joue) arreter();
    else lancer();
  }

  function surTouche(e: KeyboardEvent) {
    const cible = e.target as HTMLElement;
    if (cible.closest('input, textarea, select')) return;
    if (e.code === 'Space') {
      e.preventDefault();
      basculer();
    } else if (!joue && selection != null && partition && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
      e.preventDefault();
      selection = Math.max(0, Math.min(partition.notes.length - 1, selection + (e.key === 'ArrowRight' ? 1 : -1)));
      jouer(partition.notes[selection]!.midi, 0.8);
    }
  }

  // ------------------------------------------------------------- manche
  const marques = $derived.by<Marque[]>(() => {
    if (focus == null || !partition) return [];
    const out: Marque[] = [];
    const ajouter = (i: number, etat: string) => {
      const n = partition!.notes[i], d = doigtes[i];
      if (!n || !d) return;
      out.push({ corde: d.corde, demiTons: demiTonsDe(n.midi, d), etat, texte: d.doigt === '0' ? '0' : d.doigt === 'p' ? 'P' : d.doigt });
    };
    if (focus + 1 < partition.notes.length) ajouter(focus + 1, 'arrivee');
    ajouter(focus, 'actif');
    return out;
  });
  const cadre = $derived.by(() => {
    if (focus == null) return null;
    for (let i = focus; i >= 0; i--) if (doigtes[i]?.position) return doigtes[i]!.position;
    return null;
  });

  // ------------------------------------------------------------- éditeur de doigté
  const noteSel = $derived(selection != null && partition ? partition.notes[selection]! : null);
  const doigteSel = $derived(selection != null ? doigtes[selection] : undefined);
  let cordeEdit = $state<number | null>(null);
  $effect(() => {
    void selection;
    cordeEdit = null;
  });
  const cordeAffichee = $derived(cordeEdit ?? doigteSel?.corde ?? null);
  const cordesPossibles = $derived(noteSel ? [...new Set(candidats(noteSel.midi).map((c) => c.corde))].sort((a, b) => b - a) : []);
  const choix = $derived(noteSel && cordeAffichee != null ? choixSurCorde(noteSel.midi, cordeAffichee) : []);

  function choisirDoigte(d: Doigte) {
    if (selection == null) return;
    const i = selection;
    memoriser((s) => (s.doigtes[i] = { corde: d.corde, position: d.position, doigt: d.doigt }));
  }
  function retablir() {
    if (selection == null) return;
    const i = selection;
    memoriser((s) => delete s.doigtes[i]);
  }
  const libelleDoigte = (d: Doigte | undefined) =>
    !d ? '' : d.doigt === '0' ? `corde de ${CORDES[d.corde]!.nom} à vide` : `${d.doigt === 'p' ? 'pouce' : `doigt ${d.doigt}`}, ${courtPosition(d.position)}, corde de ${CORDES[d.corde]!.nom}`;

  // ------------------------------------------------------------- passages
  const passage = $derived(passageSel != null ? passages[passageSel] ?? null : null);
  const prep = $derived(passage ? preparation(stockage.etat, competencesDe(passage, doigtes)) : null);
  const reperes = $derived(passage && partition ? reperesDe(passage, partition.notes, doigtes) : null);
  const niveauDe = (n: number) => suivi?.passages[n] ?? 0;

  function choisirPassage(n: number) {
    if (joue) arreter();
    passageSel = passageSel === n ? null : n;
    const p = passages[n];
    if (passageSel != null && p) selection = p.debutNote;
  }
  function couperIci() {
    if (!noteSel) return;
    const m = noteSel.mesure;
    memoriser((s) => {
      const actuelles = s.coupures?.length ? s.coupures : passages.map((p) => p.de);
      s.coupures = actuelles.includes(m) ? actuelles.filter((x) => x !== m) : [...actuelles, m].sort((a, b) => a - b);
    });
    passageSel = null;
  }
  const debutsPassages = $derived(new Set(passages.map((p) => p.de)));
  const dureeNote = (q: number) => (q >= 1 ? `${q} temps` : q >= 0.5 ? 'croches' : q >= 0.25 ? 'doubles croches' : 'triples croches');
</script>

<svelte:window onkeydown={surTouche} />

{#if erreur && !partition}
  <p class="carte mal">{erreur}</p>
{:else if partition}
  <div class="lecteur">
    <section class="gauche">
      <div class="entete">
        <div>
          <h1>{fiche.titre}</h1>
          <p class="discret">{fiche.compositeur} · {nomTonalite(partition.quintes, partition.mode)} · {partition.temps}/{partition.unite} · {partition.mesures.length} mesures</p>
        </div>
      </div>

      <div class="barre">
        <button class="btn primaire jouer" onclick={basculer} aria-pressed={joue}>
          {joue ? '■ Arrêter' : passage ? `▶ Passage m. ${passage.de}–${passage.a}` : selection != null ? `▶ Depuis la mesure ${partition.notes[selection]!.mesure}` : '▶ Écouter'}
        </button>
        <label class="tempo">
          <span>Tempo <b>{tempo}</b> <span class="discret">({Math.round((100 * tempo) / partition.tempo)} %)</span></span>
          <input type="range" min={Math.round(partition.tempo * 0.3)} max={Math.round(partition.tempo * 1.3)} bind:value={tempo}
            onchange={() => memoriser((s) => (s.tempo = tempo))} disabled={joue} />
        </label>
        <label class="case"><input type="checkbox" bind:checked={decompte} disabled={joue} /> Décompte</label>
        <label class="case"><input type="checkbox" bind:checked={metronome} disabled={joue} /> Métronome</label>
        <label class="case"><input type="checkbox" bind:checked={melodie} disabled={joue} /> Mélodie</label>
        {#if passage}<label class="case"><input type="checkbox" bind:checked={boucle} disabled={joue} /> Boucle</label>{/if}
        <span class="temps">{temps}</span>
      </div>
      <div class="barre">
        <div class="seg" role="group" aria-label="Clé">
          {#each [['origine', `Clé d’origine (${partition.cleOrigine})`], ['fa', 'Fa'], ['ut', 'Ut'], ['sol', 'Sol']] as [v, t] (v)}
            <button aria-pressed={cle === v} onclick={() => { cle = v as Cle | 'origine'; memoriser((s) => (s.cle = cle)); }}>{t}</button>
          {/each}
        </div>
        <label class="case"><input type="checkbox" bind:checked={positions} /> Positions écrites aux démanchés</label>
        <span class="discret aide">Touche une note pour l’entendre et voir son doigté. Espace : lecture / arrêt ; ← → : note par note.</span>
      </div>

      <div class="partition" bind:clientWidth={largeur} bind:this={zone} onclick={surClicPartition} role="presentation">
        {#if gravure}
          {#each gravure.pages as page, k (k)}{@html page}{/each}
        {/if}
        {#if chargement}<p class="charge">{gravure ? 'Mise à jour…' : 'Gravure de la partition…'}</p>{/if}
        {#if erreur}<p class="mal">{erreur}</p>{/if}
      </div>
    </section>

    <aside class="droite">
      <div class="haut-droite">
        <Manche {marques} {cadre} doigts={false} hauteur="min(46vh, 430px)" titre="Manche synchronisé avec la note jouée" />
        <div class="note-info">
          {#if focus != null}
            {@const n = partition.notes[focus]!}
            <p class="grosse">{nomNote(n, style, true)}</p>
            <p>{libelleDoigte(doigtes[focus])}</p>
            <p class="discret">Mesure {n.mesure}</p>
            {#if focus + 1 < partition.notes.length}
              <p class="discret">Ensuite <span class="pastille-orange"></span> {nomNote(partition.notes[focus + 1]!, style)} : {libelleDoigte(doigtes[focus + 1])}</p>
            {/if}
          {:else}
            <p class="discret">Choisis une note ou un passage : le manche montre le doigt à poser (bleu) et le suivant (orange).</p>
          {/if}
        </div>
      </div>

      {#if conseil}
        <div class="carte conseil">
          <p class="etiquette">Mesure {mesureFocus} · {conseil.t}</p>
          <p>{conseil.txt}</p>
        </div>
      {/if}

      <div class="carte">
        <p class="etiquette">Passages</p>
        <div class="passages">
          {#each passages as p (p.n)}
            <button class={`passage n${niveauDe(p.n)}`} aria-pressed={passageSel === p.n} onclick={() => choisirPassage(p.n)} title={NIVEAUX[niveauDe(p.n)]}>
              {p.de}–{p.a}
            </button>
          {/each}
        </div>
        {#if passage && prep && reperes}
          <div class="detail">
            <div class="seg petit" role="group" aria-label="Où j’en suis">
              {#each NIVEAUX as t, k (t)}
                <button aria-pressed={niveauDe(passage.n) === k} onclick={() => memoriser((s) => (s.passages[passage.n] = k))}>{t}</button>
              {/each}
            </div>
            <p class="discret">
              {reperes.notes} notes, de {nomNote(deMidi(reperes.grave, partition.quintes), style, true)} à {nomNote(deMidi(reperes.aigu, partition.quintes), style, true)},
              {reperes.demanches} démanché{reperes.demanches > 1 ? 's' : ''}, notes les plus brèves : {dureeNote(reperes.plusBreve)}.
            </p>
            {#if prep.aTravailler.length}
              <p><b>À préparer</b> (maîtrise sous {SEUIL_PRET} %) :</p>
              <ul class="prep">
                {#each prep.aTravailler as c (c.cle)}
                  <li><a href={c.lien}>{c.libelle}</a> <span class="pct">{c.maitrise} %</span></li>
                {/each}
              </ul>
            {:else}
              <p class="bien">Tu as les bases de ce passage : travaille-le lentement, puis monte le tempo.</p>
            {/if}
          </div>
        {/if}
      </div>

      {#if noteSel && !joue}
        <div class="carte">
          <p class="etiquette">Doigté de la note choisie</p>
          <p>{libelleDoigte(doigteSel)} {#if corrections[selection!]}<span class="discret">(corrigé)</span>{/if}</p>
          <div class="seg petit" role="group" aria-label="Corde">
            {#each cordesPossibles as c (c)}
              <button aria-pressed={cordeAffichee === c} onclick={() => (cordeEdit = c)}>{CORDES[c]!.nom}</button>
            {/each}
          </div>
          <div class="choix">
            {#each choix as d (d.position + d.doigt)}
              <button class="btn" aria-pressed={doigteSel?.position === d.position && doigteSel?.doigt === d.doigt && doigteSel?.corde === d.corde} onclick={() => choisirDoigte(d)}>
                {d.doigt === '0' ? 'à vide' : `${d.doigt === 'p' ? 'P' : d.doigt} · ${courtPosition(d.position)}`}
              </button>
            {/each}
          </div>
          <div class="actions">
            {#if corrections[selection!]}<button class="btn discret-btn" onclick={retablir}>Rétablir le doigté d’origine</button>{/if}
            <button class="btn discret-btn" onclick={couperIci}>
              {debutsPassages.has(noteSel.mesure) && noteSel.mesure !== 1 ? `Ne plus couper à la mesure ${noteSel.mesure}` : `Commencer un passage à la mesure ${noteSel.mesure}`}
            </button>
            {#if suivi?.coupures?.length}<button class="btn discret-btn" onclick={() => memoriser((s) => delete s.coupures)}>Découpage par 4 mesures</button>{/if}
          </div>
        </div>
      {/if}
      <p class="discret source">{fiche.source}</p>
    </aside>
  </div>
{/if}

<style>
  .lecteur { display: grid; grid-template-columns: minmax(0, 1fr) minmax(320px, 400px); gap: 1.2rem; align-items: start; }
  @media (max-width: 1000px) { .lecteur { grid-template-columns: minmax(0, 1fr); } }
  .entete h1 { margin: 0; font-size: 1.6rem; }
  .entete p { margin: .2rem 0 .6rem; }
  .barre { display: flex; flex-wrap: wrap; align-items: center; gap: .5rem 1rem; margin-bottom: .6rem; }
  .jouer { min-width: 13rem; }
  .tempo { display: flex; flex-direction: column; font-size: .85rem; min-width: 12rem; }
  .tempo input { accent-color: var(--accent); }
  .case { display: inline-flex; gap: .35rem; align-items: center; cursor: pointer; }
  .case input { width: 17px; height: 17px; accent-color: var(--accent); }
  .temps { font: .9rem var(--f-mono); color: var(--ink-soft); }
  .aide { font-size: .85rem; }
  .partition { position: relative; background: #fbf8f1; border: 1px solid var(--rule); border-radius: 10px; padding: .4rem;
    height: calc(100vh - 16rem); min-height: 380px; overflow-y: scroll; color: #1d1a16; }
  .partition :global(svg) { display: block; width: 100%; height: auto; }
  .partition :global(g.note) { cursor: pointer; }
  .partition :global(g.note:hover) { fill: #6b5a3c; color: #6b5a3c; }
  .partition :global(g.choisie) { fill: #c2410c; color: #c2410c; }
  .partition :global(g.joue) { fill: #2557c4; color: #2557c4; }
  .charge { position: absolute; top: .6rem; right: 1rem; margin: 0; font: .85rem var(--f-mono); color: #6b5a3c; background: #fbf8f1; }
  .droite { display: flex; flex-direction: column; gap: .8rem; }
  @media (min-width: 1001px) { .droite { position: sticky; top: 6.5rem; max-height: calc(100vh - 7.5rem); overflow-y: auto; padding-right: 4px; } }
  .haut-droite { display: flex; gap: .8rem; align-items: flex-start; }
  .note-info { flex: 1; min-width: 0; font-size: .92rem; }
  .note-info p { margin: 0 0 .35rem; }
  .grosse { font-family: var(--f-display); font-size: 1.7rem; font-weight: 700; }
  .pastille-orange { display: inline-block; width: .7em; height: .7em; border-radius: 50%; background: var(--s-la); vertical-align: middle; }
  .conseil p { margin: .2rem 0; }
  .passages { display: flex; flex-wrap: wrap; gap: 5px; margin: .4rem 0; }
  .passage { appearance: none; font: .85rem var(--f-mono); padding: .3em .6em; border-radius: 6px; border: 1px solid var(--rule); background: var(--surface); color: var(--ink); cursor: pointer; }
  .passage.n1 { background: #dfe7f5; } .passage.n2 { background: #cfe6d7; } .passage.n3 { background: #5f9f79; color: #fff; }
  .passage[aria-pressed='true'] { outline: 2px solid var(--accent); outline-offset: 1px; }
  .detail { display: flex; flex-direction: column; gap: .4rem; }
  .detail p { margin: 0; }
  .seg.petit :global(button), .seg.petit button { font-size: .8rem; padding: .3em .6em; }
  .prep { margin: 0; padding-left: 1.2em; }
  .pct { font: .78rem var(--f-mono); color: var(--ink-soft); }
  .choix { display: flex; flex-wrap: wrap; gap: 5px; margin: .5rem 0; }
  .choix .btn { font-size: .85rem; padding: .3em .7em; }
  .choix .btn[aria-pressed='true'] { border-color: var(--accent); background: var(--accent-soft); }
  .actions { display: flex; flex-wrap: wrap; gap: .4rem; }
  .discret-btn { font-size: .82rem; padding: .3em .7em; }
  .bien { color: var(--good); font-weight: 700; }
  .mal { color: var(--bad); }
  .source { font-size: .8rem; }
</style>
