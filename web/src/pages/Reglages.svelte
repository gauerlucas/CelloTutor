<script lang="ts">
  import { stockage } from '../lib/stockage.svelte';
  import { exporterFichier, importerFichier } from '../lib/persistance';
  import type { Etat } from '../lib/etat';
  import { jouer, reglerTimbre, type Timbre } from '../lib/audio/son';

  const r = $derived(stockage.etat.reglages);
  let messageImport = $state('');

  async function surFichier(ev: Event) {
    const input = ev.currentTarget as HTMLInputElement;
    const f = input.files?.[0];
    if (!f) return;
    const etat = await importerFichier(f);
    if (!etat) {
      messageImport = "Ce fichier n'est pas une sauvegarde CelloTutor lisible.";
    } else {
      await stockage.remplacer(etat);
      messageImport = 'Sauvegarde importée.';
    }
    input.value = '';
  }
</script>

<h1>Réglages</h1>

<section class="carte bloc">
  <h2>Affichage</h2>
  <div class="ligne">
    <span class="etiquette">Thème</span>
    <div class="seg" role="group" aria-label="Thème">
      <button aria-pressed={r.theme === 'auto'} onclick={() => stockage.regler('theme', 'auto')}>Automatique</button>
      <button aria-pressed={r.theme === 'clair'} onclick={() => stockage.regler('theme', 'clair')}>Clair</button>
      <button aria-pressed={r.theme === 'sombre'} onclick={() => stockage.regler('theme', 'sombre')}>Sombre</button>
    </div>
  </div>
  <div class="ligne">
    <span class="etiquette">Taille au pupitre</span>
    <div class="seg" role="group" aria-label="Taille du texte">
      <button aria-pressed={r.taillePupitre === 1} onclick={() => stockage.regler('taillePupitre', 1)}>Normale</button>
      <button aria-pressed={r.taillePupitre === 1.2} onclick={() => stockage.regler('taillePupitre', 1.2)}>Grande</button>
      <button aria-pressed={r.taillePupitre === 1.4} onclick={() => stockage.regler('taillePupitre', 1.4)}>Très grande</button>
    </div>
  </div>
  <div class="ligne">
    <span class="etiquette">Noms des notes</span>
    <div class="seg" role="group" aria-label="Noms des notes">
      <button aria-pressed={r.nomsNotes === 'latin'} onclick={() => stockage.regler('nomsNotes', 'latin')}>Do Ré Mi</button>
      <button aria-pressed={r.nomsNotes === 'anglo'} onclick={() => stockage.regler('nomsNotes', 'anglo')}>C D E</button>
    </div>
  </div>
</section>

<section class="carte bloc">
  <h2>Séances et son</h2>
  <label class="ligne">
    <span class="etiquette">Durée par défaut</span>
    <select value={r.dureeParDefaut} onchange={(e) => stockage.regler('dureeParDefaut', Number(e.currentTarget.value))}>
      {#each [15, 30, 45, 60, 90, 120] as d (d)}
        <option value={d}>{d} min</option>
      {/each}
    </select>
  </label>
  <label class="ligne">
    <span class="etiquette">Note tenue au micro</span>
    <select value={r.tenueMicro} onchange={(e) => stockage.regler('tenueMicro', e.currentTarget.value as 'courte' | 'normale' | 'longue')}>
      <option value="courte">Courte (¼ s) : réagit vite</option>
      <option value="normale">Normale (½ s)</option>
      <option value="longue">Longue (près d’1 s) : ignore mieux les bruits</option>
    </select>
  </label>
  <label class="ligne">
    <span class="etiquette">Son des notes</span>
    <select value={r.timbre} onchange={(e) => { const t = e.currentTarget.value as Timbre; stockage.regler('timbre', t); reglerTimbre(t); setTimeout(() => jouer(57, 1.5), 300); }}>
      <option value="echantillons">Violoncelle enregistré</option>
      <option value="synthese">Synthèse (plus léger)</option>
    </select>
  </label>
  <label class="ligne">
    <span class="etiquette">Volume</span>
    <input type="range" min="0" max="1" step="0.05" value={r.volume} onchange={(e) => stockage.regler('volume', Number(e.currentTarget.value))} />
    <span class="discret">{Math.round(r.volume * 100)} %</span>
  </label>
  <p class="discret credit">Sons de violoncelle : pack « real cello notes » de flcellogrl sur Freesound (<a href="https://freesound.org/people/flcellogrl/packs/12408/" target="_blank" rel="noopener">lien</a>), licence CC BY 4.0. Les notes absentes du pack sont transposées depuis la plus proche.</p>
</section>

<section class="carte bloc">
  <h2>Sauvegarde</h2>
  {#if stockage.assistant}
    <p>L'assistant local est actif. Ta progression est enregistrée dans <code>{stockage.assistant.dossierDonnees}</code>, avec une copie datée par jour (les 30 dernières sont gardées).</p>
  {:else}
    <p>L'assistant local n'est pas lancé : la progression est gardée dans ce navigateur seulement. Pour l'enregistrer dans le dossier <code>donnees</code>, ouvre l'appli avec « Lancer CelloTutor ».</p>
  {/if}
  <div class="actions">
    <button class="btn" onclick={() => exporterFichier($state.snapshot(stockage.etat) as Etat)}>Télécharger une sauvegarde</button>
    <label class="btn">
      Importer une sauvegarde
      <input type="file" accept="application/json,.json" onchange={surFichier} hidden />
    </label>
  </div>
  {#if messageImport}<p role="status">{messageImport}</p>{/if}
  <p class="discret">Importer remplace la progression actuelle par celle du fichier.</p>
</section>

<style>
  .bloc { margin-bottom: 1rem; display: flex; flex-direction: column; gap: .8rem; }
  .bloc h2 { margin: 0; }
  .bloc p { margin: 0; }
  .ligne { display: flex; flex-wrap: wrap; align-items: center; gap: .4rem 1rem; }
  .ligne .etiquette { min-width: 11rem; }
  .actions { display: flex; flex-wrap: wrap; gap: .6rem; }
  label.btn { display: inline-flex; align-items: center; }
  select { font: inherit; padding: .3em .5em; border-radius: 7px; border: 1px solid var(--rule); background: var(--surface); color: var(--ink); }
  code { font-family: var(--f-mono); font-size: .88em; word-break: break-all; }
  .credit { font-size: .8rem; margin: .6rem 0 0; }
</style>
