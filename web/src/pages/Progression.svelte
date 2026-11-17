<script lang="ts">
  // Progression : temps de travail, courbes de lecture, ceintures de maîtrise, records,
  // carte du parcours des morceaux-objectifs et journal des séances.
  import Graphe from '../components/Graphe.svelte';
  import { stockage } from '../lib/stockage.svelte';
  import { cleJour, maitrise } from '../lib/revision';
  import { clesPosition, clesDemanche } from '../lib/exercices/positions';
  import { clesLecture, ORDRE_CLES } from '../lib/exercices/lecture';
  import { GAMMES, cleGammeJustesse } from '../lib/exercices/gammes';
  import { ficheMorceau } from '../lib/morceaux';
  import { analyserMorceau } from '../lib/morceaux/analyse';
  import { NIVEAUX } from '../lib/morceaux/passages';
  import { CLES } from '../lib/musique/cles';

  const etat = $derived(stockage.etat);
  const JOUR = 86400000;

  // ------------------------------------------------------------- temps de travail
  const semaines = $derived.by(() => {
    const now = new Date();
    const lundi = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7)).getTime();
    return Array.from({ length: 8 }, (_, k) => {
      const debut = lundi - (7 - k) * 7 * JOUR;
      let minutes = 0;
      for (let j = 0; j < 7; j++) minutes += etat.jours[cleJour(debut + j * JOUR + JOUR / 2)]?.minutes ?? 0;
      const d = new Date(debut);
      return { etiquette: `${d.getDate()}/${d.getMonth() + 1}`, valeur: Math.round(minutes), detail: `semaine du ${d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}` };
    });
  });
  const cetteSemaine = $derived(semaines[semaines.length - 1]!.valeur ?? 0);
  const seances7 = $derived(etat.seances.filter((s) => s.debut > Date.now() - 7 * JOUR).length);

  // ------------------------------------------------------------- exercices au fil des jours
  const jours30 = $derived.by(() => Array.from({ length: 30 }, (_, k) => {
    const t = Date.now() - (29 - k) * JOUR;
    const j = etat.jours[cleJour(t)];
    const d = new Date(t);
    return { etiquette: `${d.getDate()}/${d.getMonth() + 1}`, j, detail: d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' }) };
  }));
  const justesse = $derived(jours30.map((x) => ({ etiquette: x.etiquette, detail: x.detail, valeur: x.j?.reponses ? Math.round((100 * x.j.justes) / x.j.reponses) : null })));
  const vitesse = $derived(jours30.map((x) => ({ etiquette: x.etiquette, detail: x.detail, valeur: x.j?.reponses ? Math.round(x.j.msTotal / x.j.reponses / 100) / 10 : null })));
  const aDesExercices = $derived(jours30.some((x) => x.j?.reponses));

  // ------------------------------------------------------------- ceintures
  const CEINTURES = [
    { min: 0, nom: 'Blanche', c: '#e9e6df' }, { min: 15, nom: 'Jaune', c: '#e8c547' }, { min: 35, nom: 'Orange', c: '#e08a3c' },
    { min: 55, nom: 'Verte', c: '#4f9a62' }, { min: 75, nom: 'Bleue', c: '#3d6db5' }, { min: 90, nom: 'Marron', c: '#7a4b2a' }, { min: 98, nom: 'Noire', c: '#1d1d1d' },
  ];
  const ceinture = (p: number) => [...CEINTURES].reverse().find((c) => p >= c.min)!;
  const nomPos = (p: string) => (p === 'demi' ? '½ position' : p === 'pouce' ? 'Pouce' : p === '1' ? '1re position' : `${p}e position`);
  const familles = $derived([
    { titre: 'Positions', lien: '#/positions', items: ['demi', '1', '2', '3', '4', '5', '6', '7', 'pouce'].map((p) => ({ nom: nomPos(p), p: maitrise(etat, clesPosition(p), 3) })) },
    { titre: 'Démanchés', lien: '#/positions/demanche', items: ([['1', '4'], ['1', '2'], ['1', '3'], ['3', '4'], ['4', '5'], ['4', '6'], ['4', '7'], ['6', '7']] as [string, string][]).map(([a, b]) => ({ nom: `${a} ↔ ${b}`, p: maitrise(etat, clesDemanche(a, b), 3) })) },
    { titre: 'Lecture', lien: '#/lecture', items: ORDRE_CLES.map((c) => ({ nom: CLES[c].label.replace(/^./, (x) => x.toUpperCase()), p: maitrise(etat, clesLecture(c), 3) })) },
    { titre: 'Gammes (justesse)', lien: '#/gammes', items: GAMMES.slice(0, 8).map((g) => ({ nom: g.nom, p: Math.min(100, (etat.items[cleGammeJustesse(g.id)]?.boite ?? 0) * 20) })) },
  ]);

  // ------------------------------------------------------------- records
  const LIBELLES: [RegExp, (m: RegExpMatchArray) => string, (v: number) => string][] = [
    [/^rec:nom:(.+)$/, (m) => `Nommer les notes, ${nomPos(m[1]!)}`, (v) => `${(v / 1000).toFixed(1).replace('.', ',')} s par note`],
    [/^rec:trouve:(.+)$/, (m) => `Trouver les notes, ${nomPos(m[1]!)}`, (v) => `${(v / 1000).toFixed(1).replace('.', ',')} s par note`],
    [/^rec:demanche:serie$/, () => 'Démanchés justes d’affilée', (v) => `${v} de suite`],
    [/^rec:lecture:(\w+)$/, (m) => `Lecture en suite, ${CLES[m[1] as 'fa']?.label ?? m[1]}`, (v) => `${v} notes/min`],
  ];
  const records = $derived(Object.entries(etat.records).map(([k, r]) => {
    for (const [re, nom, val] of LIBELLES) {
      const m = k.match(re);
      if (m) return { k, nom: nom(m), valeur: val(r.valeur), le: r.le };
    }
    return { k, nom: k, valeur: String(r.valeur), le: r.le };
  }).sort((a, b) => b.le - a.le));

  // ------------------------------------------------------------- parcours
  const parcours = $derived(etat.objectifs.filter((o) => o.etat !== 'abandonne').map((o) => {
    const f = ficheMorceau(o.morceauId, etat);
    return f ? { o, a: analyserMorceau(f, etat) } : null;
  }).filter((x) => x?.a));

  const RESSENTI = ['', 'difficile', 'correcte', 'bonne'];
  const ENERGIE: Record<string, string> = { fatigue: 'fatigué', normal: 'normal', forme: 'en forme' };
  const date = (t: number) => new Date(t).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
</script>

<h1>Progression</h1>

<div class="grille">
  <section class="carte">
    <div class="chiffres">
      <div><span class="grand">{cetteSemaine}</span> <span class="discret">min cette semaine</span></div>
      <div><span class="grand">{seances7}</span> <span class="discret">séance{seances7 > 1 ? 's' : ''} en 7 jours</span></div>
    </div>
    <Graphe titre="Minutes de travail par semaine" points={semaines} unite="min" />
  </section>

  <section class="carte">
    {#if aDesExercices}
      <Graphe titre="Réponses justes, par jour (30 derniers jours)" forme="courbe" points={justesse} unite="%" max={100} />
      <Graphe titre="Temps moyen de réponse, par jour" forme="courbe" points={vitesse} unite="s" />
    {:else}
      <p class="etiquette">Exercices</p>
      <p class="discret">Les courbes de justesse et de vitesse apparaîtront après tes premiers exercices (positions, lecture).</p>
    {/if}
  </section>

  <section class="carte large">
    <p class="etiquette">Ceintures de maîtrise</p>
    <div class="familles">
      {#each familles as f (f.titre)}
        <div>
          <h2><a href={f.lien}>{f.titre}</a></h2>
          <ul class="ceintures">
            {#each f.items as it (it.nom)}
              {@const c = ceinture(it.p)}
              <li><span class="noeud" style={`background:${c.c}`} title={`Ceinture ${c.nom.toLowerCase()}`}></span><span class="nom">{it.nom}</span><span class="pct">{c.nom} · {it.p} %</span></li>
            {/each}
          </ul>
        </div>
      {/each}
    </div>
  </section>

  <section class="carte">
    <p class="etiquette">Parcours des morceaux</p>
    {#each parcours as x (x!.o.morceauId)}
      {@const a = x!.a!}
      <div class="parcours">
        <a href={`#/morceaux/${encodeURIComponent(a.fiche.id)}`}><b>{a.fiche.titre}</b></a>
        <span class="discret"> {x!.o.etat === 'pause' ? '(en pause) ' : ''}{a.debloques} % débloqué · avancement {a.avancement} %</span>
        <div class="passages">
          {#each a.passages as p (p.n)}
            <a class={`p n${p.niveau} ${p.debloque ? '' : 'ferme'}`} href={`#/morceaux/${encodeURIComponent(a.fiche.id)}/${p.n + 1}`}
              title={`Mesures ${p.de}–${p.a} : ${p.debloque ? NIVEAUX[p.niveau] : 'à préparer'}`}>{p.de}</a>
          {/each}
        </div>
      </div>
    {:else}
      <p class="discret">Aucun morceau-objectif.</p>
    {/each}
    <p class="discret petit">Gris clair : à préparer · blanc : débloqué · bleu : lent, sûr · vert : au tempo · vert foncé : mémorisé.</p>
  </section>

  <section class="carte">
    <p class="etiquette">Records</p>
    {#if records.length}
      <ul class="records">
        {#each records as r (r.k)}<li><span>{r.nom}</span><b>{r.valeur}</b><span class="discret">{date(r.le)}</span></li>{/each}
      </ul>
    {:else}
      <p class="discret">Pas encore de record : ils s’inscrivent tout seuls pendant les exercices chronométrés.</p>
    {/if}
  </section>

  <section class="carte large">
    <p class="etiquette">Journal des séances</p>
    {#if etat.seances.length}
      <table>
        <thead><tr><th>Date</th><th>Durée</th><th>Énergie</th><th>Blocs faits</th><th>Ressenti</th></tr></thead>
        <tbody>
          {#each [...etat.seances].reverse().slice(0, 30) as s (s.id)}
            <tr>
              <td>{date(s.debut)}</td>
              <td>{s.dureeReelleMin} / {s.dureePrevueMin} min</td>
              <td>{ENERGIE[s.energie]}</td>
              <td title={s.blocs.map((b) => `${b.fait ? '✓' : '·'} ${b.titre}`).join('\n')}>{s.blocs.filter((b) => b.fait).length} / {s.blocs.length}</td>
              <td>{s.ressenti ? RESSENTI[s.ressenti] : '—'}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    {:else}
      <p class="discret">Ton journal commencera avec ta première séance guidée.</p>
    {/if}
  </section>
</div>

<style>
  .grille { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1rem; }
  @media (max-width: 900px) { .grille { grid-template-columns: minmax(0, 1fr); } }
  .large { grid-column: 1 / -1; }
  .chiffres { display: flex; gap: 2rem; margin-bottom: .6rem; }
  .grand { font: 700 1.8rem var(--f-display); }
  .familles { display: grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap: 1rem 1.6rem; }
  .familles h2 { font-size: 1rem; margin: .2rem 0 .4rem; }
  .familles h2 a { color: var(--ink); }
  .ceintures { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: .25rem; }
  .ceintures li { display: flex; align-items: center; gap: .5rem; font-size: .9rem; max-width: none; }
  .noeud { width: 22px; height: 8px; border-radius: 3px; border: 1px solid var(--rule); flex: none; }
  .nom { flex: 1; }
  .pct { font: .78rem var(--f-mono); color: var(--ink-soft); }
  .parcours { margin-bottom: .8rem; }
  .parcours a { color: var(--ink); }
  .passages { display: flex; flex-wrap: wrap; gap: 4px; margin-top: .3rem; }
  .p { min-width: 2rem; text-align: center; font: .78rem var(--f-mono); padding: .2rem .3rem; border-radius: 5px; border: 1px solid var(--rule); background: var(--surface); text-decoration: none; color: var(--ink); }
  .p.ferme { background: var(--rule); color: var(--ink-soft); }
  .p.n1 { background: #dfe7f5; color: #1a1e23; } .p.n2 { background: #cfe6d7; color: #1a1e23; } .p.n3 { background: #3f8a5f; color: #fff; }
  .petit { font-size: .8rem; }
  .records { list-style: none; padding: 0; margin: 0; }
  .records li { display: grid; grid-template-columns: 1fr auto auto; gap: .8rem; padding: .3rem 0; border-bottom: 1px solid var(--rule); font-size: .92rem; max-width: none; }
  table { width: 100%; border-collapse: collapse; font-size: .92rem; }
  th, td { text-align: left; padding: .35rem .5rem; border-bottom: 1px solid var(--rule); }
  th { font-weight: 700; color: var(--ink-soft); font-size: .82rem; }
</style>
