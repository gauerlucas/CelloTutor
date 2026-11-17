<script lang="ts">
  // Bibliothèque de morceaux et objectifs du moment. Aucun morceau n'est imposé : on en fait un
  // objectif, on le met en pause ou on l'abandonne, et on en importe d'autres en MusicXML.
  import Lecteur from '../components/Lecteur.svelte';
  import { stockage } from '../lib/stockage.svelte';
  import { ficheMorceau, tousLesMorceaux, type FicheMorceau } from '../lib/morceaux';
  import { analyser, nomTonalite } from '../lib/morceaux/partition';
  import { decouper } from '../lib/morceaux/passages';
  import { changerObjectif, importerMorceau, lireFichierPartition, statutObjectif, supprimerImporte } from '../lib/morceaux/suivi';
  import type { EtatObjectif } from '../lib/etat';

  let { id = null, passage = null }: { id?: string | null; passage?: number | null } = $props();

  const fiche = $derived(id ? ficheMorceau(id, stockage.etat) : undefined);
  const morceaux = $derived(tousLesMorceaux(stockage.etat));

  const STATUTS: { v: EtatObjectif | null; t: string }[] = [
    { v: 'actif', t: 'Objectif' },
    { v: 'pause', t: 'En pause' },
    { v: 'abandonne', t: 'Abandonné' },
    { v: null, t: 'Bibliothèque' },
  ];

  function changer(m: FicheMorceau, v: EtatObjectif | null) {
    changerObjectif(stockage.etat, m.id, v);
    stockage.modifie();
  }

  // Résumé d'un morceau : tonalité et avancement des passages (calculé une fois par morceau).
  const resumes = $derived.by(() => {
    const out: Record<string, { tonalite: string; mesures: number; avancement: number; passages: number }> = {};
    for (const m of morceaux) {
      try {
        const p = analyser(m.xml);
        const s = stockage.etat.morceaux[m.id];
        const ps = decouper(p.mesures, p.notes, s?.coupures);
        const total = ps.reduce((acc, x) => acc + (s?.passages[x.n] ?? 0), 0);
        out[m.id] = { tonalite: m.tonalite || nomTonalite(p.quintes, p.mode), mesures: p.mesures.length, passages: ps.length, avancement: Math.round((100 * total) / (3 * ps.length)) };
      } catch {
        /* partition illisible : la carte le dira */
      }
    }
    return out;
  });

  let messageImport = $state<{ ok: boolean; texte: string } | null>(null);
  async function importer(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const f = input.files?.[0];
    input.value = '';
    if (!f) return;
    try {
      const xml = await lireFichierPartition(f);
      const nouvel = importerMorceau(stockage.etat, xml);
      stockage.modifie();
      messageImport = { ok: true, texte: `« ${stockage.etat.importes[nouvel]!.titre} » est dans ta bibliothèque. Fais-en un objectif quand tu veux.` };
    } catch (err) {
      messageImport = { ok: false, texte: err instanceof Error ? err.message : String(err) };
    }
  }

  let aSupprimer = $state<string | null>(null);
  function supprimer(m: FicheMorceau) {
    if (aSupprimer !== m.id) {
      aSupprimer = m.id;
      return;
    }
    supprimerImporte(stockage.etat, m.id);
    stockage.modifie();
    aSupprimer = null;
  }

  const RANG = { actif: 0, pause: 1, aucun: 2, abandonne: 3 } as const;
  const ordre = (m: FicheMorceau) => RANG[statutObjectif(stockage.etat, m.id) ?? 'aucun'];
  const tries = $derived([...morceaux].sort((a, b) => ordre(a) - ordre(b)));
</script>

{#if id}
  <p class="retour"><a href="#/morceaux">← Tous les morceaux</a></p>
  {#if fiche}
    {#key fiche.id + '/' + passage}<Lecteur {fiche} passageInitial={passage} />{/key}
  {:else}
    <p class="carte">Ce morceau n’existe plus dans ta bibliothèque.</p>
  {/if}
{:else}
  <h1>Morceaux</h1>
  <p class="intro">
    Les morceaux-objectifs orientent une partie de tes séances : les passages à préparer y deviennent des exercices.
    Ils changent quand tu veux : mets-en un en pause, abandonne-le, ou importe un autre morceau.
  </p>

  <div class="grille">
    {#each tries as m (m.id)}
      {@const r = resumes[m.id]}
      {@const statut = statutObjectif(stockage.etat, m.id)}
      <article class={`carte morceau ${statut ?? 'biblio'}`}>
        <div class="tete">
          <div>
            <h2><a href={`#/morceaux/${encodeURIComponent(m.id)}`}>{m.titre}</a></h2>
            <p class="discret">{m.compositeur}{r ? ` · ${r.tonalite} · ${r.mesures} mesures` : ''}</p>
          </div>
          <a class="btn primaire" href={`#/morceaux/${encodeURIComponent(m.id)}`}>Ouvrir</a>
        </div>
        {#if r}
          <div class="avancement" aria-label={`Avancement ${r.avancement} %`}>
            <span style={`width:${r.avancement}%`}></span>
          </div>
          <p class="discret petit">{r.passages} passages · avancement {r.avancement} %</p>
        {:else}
          <p class="mal">Partition illisible.</p>
        {/if}
        <div class="seg" role="group" aria-label="Statut">
          {#each STATUTS as s (s.t)}
            <button aria-pressed={statut === s.v} onclick={() => changer(m, s.v)}>{s.t}</button>
          {/each}
        </div>
        {#if m.importe}
          <button class="btn lien-suppr" onclick={() => supprimer(m)}>{aSupprimer === m.id ? 'Confirmer la suppression' : 'Retirer de la bibliothèque'}</button>
        {/if}
      </article>
    {/each}

    <article class="carte importer">
      <h2>Ajouter un morceau</h2>
      <p>Importe une partition <b>MusicXML</b> (.musicxml, .xml ou .mxl), par exemple exportée de MuseScore ou téléchargée sur une bibliothèque libre.</p>
      <label class="btn primaire">
        Choisir un fichier…
        <input type="file" accept=".musicxml,.xml,.mxl,application/vnd.recordare.musicxml+xml,application/vnd.recordare.musicxml" onchange={importer} hidden />
      </label>
      {#if messageImport}<p class={messageImport.ok ? 'bien' : 'mal'}>{messageImport.texte}</p>{/if}
      <p class="discret petit">
        Depuis une photo ou un PDF : ouvre-le d’abord dans MuseScore (import PDF) ou Audiveris, vérifie les notes, puis exporte en MusicXML.
        Seule la première voix de la première partie est travaillée.
      </p>
    </article>
  </div>
{/if}

<style>
  .retour { margin: 0 0 .6rem; }
  .intro { color: var(--ink-soft); max-width: 70ch; }
  .grille { display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: 1rem; margin-top: 1rem; }
  .morceau { display: flex; flex-direction: column; gap: .6rem; }
  .morceau.actif { border-color: var(--accent); }
  .morceau.abandonne { opacity: .7; }
  .tete { display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; }
  .tete h2 { margin: 0; font-size: 1.15rem; }
  .tete h2 a { color: var(--ink); text-decoration: none; }
  .tete p { margin: .2rem 0 0; }
  .avancement { height: 8px; border-radius: 4px; background: var(--rule); overflow: hidden; }
  .avancement span { display: block; height: 100%; background: var(--good); }
  .petit { font-size: .85rem; margin: 0; }
  .importer h2 { margin-top: 0; font-size: 1.15rem; }
  .importer { display: flex; flex-direction: column; align-items: flex-start; gap: .6rem; }
  .importer p { margin: 0; }
  .lien-suppr { align-self: flex-start; font-size: .82rem; padding: .3em .7em; }
  .bien { color: var(--good); font-weight: 700; }
  .mal { color: var(--bad); }
</style>
