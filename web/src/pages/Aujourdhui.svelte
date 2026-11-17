<script lang="ts">
  import { stockage } from '../lib/stockage.svelte';
  import { ficheMorceau } from '../lib/morceaux';
  import { analyserMorceau } from '../lib/morceaux/analyse';
  import { composerSeance, contexteDe, totalMinutes, type Bloc, type Energie } from '../lib/planificateur';
  import { mmss, seance } from '../lib/seance.svelte';
  import { nombreDus } from '../lib/revision';

  const DUREES = [15, 30, 45, 60, 90, 120];
  const ENERGIES = [
    { id: 'fatigue', t: 'Fatigué' },
    { id: 'normal', t: 'Normal' },
    { id: 'forme', t: 'En forme' },
  ] as const;

  let duree = $state(stockage.etat.reglages.dureeParDefaut);
  let energie = $state<Energie>('normal');
  let instrument = $state(true);
  let plan = $state<Bloc[] | null>(null);

  // Si les réglages arrivent du dossier après l'affichage, on reprend la durée par défaut.
  $effect(() => {
    duree = stockage.etat.reglages.dureeParDefaut;
  });
  // Un changement de choix invalide la séance proposée.
  $effect(() => {
    void duree; void energie; void instrument;
    plan = null;
  });

  function composer() {
    plan = composerSeance(stockage.etat, { duree, energie, instrument }, contexteDe(stockage.etat));
  }
  function commencer() {
    if (plan) seance.demarrer(plan, { duree, energie, instrument });
  }

  const actifs = $derived(stockage.etat.objectifs.filter((o) => o.etat === 'actif'));
  const libelleDuree = (m: number) => (m < 60 ? `${m} min` : m % 60 ? `${Math.floor(m / 60)} h ${m % 60}` : `${m / 60} h`);
  const dus = $derived(nombreDus(stockage.etat, Object.keys(stockage.etat.items)));
  const derniere = $derived(stockage.etat.seances[stockage.etat.seances.length - 1]);
  const ICONES: Record<string, string> = { echauffement: '◌', lecture: '𝄢', gamme: '♪', technique: '✋', morceau: '♫', oreille: '◉', cloture: '☺' };
  const dateCourte = (t: number) => new Date(t).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
</script>

<h1>Séance du jour</h1>

{#if seance.active}
  <section class="carte">
    <p class="etiquette">Séance en cours{seance.enPause ? ' (en pause)' : ''}</p>
    <ol class="plan">
      {#each seance.plan as b, i (b.id)}
        <li class:courant={i === seance.indice} class:fait={b.fait} class:reporte={b.reporte}>
          <span class="ico" aria-hidden="true">{ICONES[b.type]}</span>
          <a href={b.lien}><b>{b.titre}</b></a>
          <span class="min">{b.fait || b.reporte || i === seance.indice ? `${mmss(b.ecoule)} / ` : ''}{b.minutes} min</span>
          <span class="etat">{b.fait ? 'fait' : b.reporte ? 'reporté' : i === seance.indice ? 'en cours' : ''}</span>
        </li>
      {/each}
    </ol>
    <p class="discret">La barre en haut de l’écran suit la séance sur toutes les pages.</p>
  </section>
{:else}
  <section class="carte choix" aria-labelledby="titre-choix">
    <h2 id="titre-choix" class="sr">Préparer la séance</h2>
    <div class="ligne">
      <span class="etiquette">Temps disponible</span>
      <div class="seg" role="group" aria-label="Temps disponible">
        {#each DUREES as d (d)}
          <button aria-pressed={duree === d} onclick={() => (duree = d)}>{libelleDuree(d)}</button>
        {/each}
      </div>
    </div>
    <div class="ligne">
      <span class="etiquette">Énergie</span>
      <div class="seg" role="group" aria-label="Énergie">
        {#each ENERGIES as e (e.id)}
          <button aria-pressed={energie === e.id} onclick={() => (energie = e.id)}>{e.t}</button>
        {/each}
      </div>
    </div>
    <div class="ligne">
      <span class="etiquette">Violoncelle en main</span>
      <div class="seg" role="group" aria-label="Violoncelle en main">
        <button aria-pressed={instrument} onclick={() => (instrument = true)}>Oui</button>
        <button aria-pressed={!instrument} onclick={() => (instrument = false)}>Non, écran seul</button>
      </div>
    </div>
    {#if !plan}
      <button class="btn primaire" onclick={composer}>Composer la séance</button>
    {/if}
    <p class="discret">
      {dus ? `${dus} exercice${dus > 1 ? 's' : ''} à réviser aujourd’hui. ` : ''}{derniere ? `Dernière séance : ${dateCourte(derniere.debut)}, ${derniere.dureeReelleMin} min.` : 'Première séance : bienvenue.'}
    </p>
  </section>

  {#if plan}
    <section class="carte">
      <p class="etiquette">Ta séance · {totalMinutes(plan)} min · {ENERGIES.find((e) => e.id === energie)?.t.toLowerCase()}{instrument ? '' : ' · écran seul'}</p>
      <ol class="plan">
        {#each plan as b (b.id)}
          <li>
            <span class="ico" aria-hidden="true">{ICONES[b.type]}</span>
            <div class="txt">
              <b>{b.titre}</b>
              <span class="discret">{b.consigne}</span>
            </div>
            <span class="min">{b.minutes} min</span>
          </li>
        {/each}
      </ol>
      <div class="actions">
        <button class="btn primaire" onclick={commencer}>Commencer la séance</button>
        <button class="btn" onclick={composer}>Recomposer</button>
      </div>
    </section>
  {/if}
{/if}

<h2>Morceaux-objectifs du moment</h2>
{#if actifs.length}
  <ul class="objectifs">
    {#each actifs as o (o.morceauId)}
      {@const f = ficheMorceau(o.morceauId, stockage.etat)}
      {@const a = f ? analyserMorceau(f, stockage.etat) : null}
      <li class="carte">
        <a href={`#/morceaux/${encodeURIComponent(o.morceauId)}`}><b>{f?.titre ?? o.morceauId}</b></a>
        <span class="discret">{f?.compositeur}{f?.tonalite ? ` · ${f.tonalite}` : ''}</span>
        {#if a}
          <div class="barre-av" aria-label={`${a.debloques} % des passages débloqués`}><span style={`width:${a.debloques}%`}></span></div>
          <span class="discret petit">{a.passages.filter((p) => p.debloque).length} passage{a.passages.filter((p) => p.debloque).length > 1 ? 's' : ''} débloqué{a.passages.filter((p) => p.debloque).length > 1 ? 's' : ''} sur {a.passages.length}</span>
        {/if}
      </li>
    {/each}
  </ul>
  <p class="discret"><a href="#/morceaux">Changer d’objectifs</a> : mettre en pause, abandonner, en ajouter. Rien n’est perdu.</p>
{:else}
  <p class="discret">Aucun objectif : les séances suivent le socle général. <a href="#/morceaux">Choisir un morceau</a>.</p>
{/if}

<style>
  .choix { display: flex; flex-direction: column; gap: 1rem; align-items: flex-start; }
  .ligne { display: flex; flex-wrap: wrap; align-items: center; gap: .4rem 1rem; }
  .ligne .etiquette { min-width: 11rem; }
  .choix p { margin: 0; }
  .plan { list-style: none; padding: 0; margin: .6rem 0; display: flex; flex-direction: column; gap: .2rem; }
  .plan li { display: flex; align-items: center; gap: .8rem; padding: .5rem .4rem; border-bottom: 1px solid var(--rule); max-width: none; }
  .plan li:last-child { border-bottom: 0; }
  .ico { width: 1.6rem; text-align: center; font-size: 1.2rem; color: var(--accent); }
  .txt { flex: 1; display: flex; flex-direction: column; min-width: 0; }
  .txt .discret { font-size: .88rem; }
  .min { font: .9rem var(--f-mono); white-space: nowrap; margin-left: auto; }
  .etat { font-size: .8rem; color: var(--ink-soft); min-width: 4.5rem; text-align: right; }
  .plan li.courant { background: var(--accent-soft); border-radius: 6px; }
  .plan li.fait { opacity: .6; }
  .plan li.reporte { opacity: .6; text-decoration: line-through; }
  .actions { display: flex; gap: .5rem; flex-wrap: wrap; }
  .objectifs { list-style: none; padding: 0; display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: .7rem; }
  .objectifs li { display: flex; flex-direction: column; gap: .3rem; max-width: none; }
  .objectifs a { color: var(--ink); }
  .barre-av { height: 6px; border-radius: 3px; background: var(--rule); overflow: hidden; }
  .barre-av span { display: block; height: 100%; background: var(--good); }
  .petit { font-size: .82rem; }
  .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
</style>
