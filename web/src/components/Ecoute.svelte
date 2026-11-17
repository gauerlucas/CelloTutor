<script lang="ts">
  // Ce que le micro entend, pour comprendre pourquoi une note avance ou non :
  // niveau sonore, note entendue, et progression de la tenue vers la validation.
  import { micro } from '../lib/audio/micro.svelte';
  import { deMidi, nomNote, type StyleNoms } from '../lib/musique/notes';
  import type { Retour } from '../lib/audio/tenue';

  let { retour = null, cible = null, style = 'latin' }: { retour?: Retour | null; cible?: number | null; style?: StyleNoms } = $props();
  const entendu = $derived(micro.ecoute.midi != null ? nomNote(deMidi(Math.round(micro.ecoute.midi)), style, true) : null);
  const message = $derived.by(() => {
    if (!micro.actif) return 'Micro coupé';
    if (!retour || retour.etat === 'silence') return entendu ? `J’entends ${entendu}` : micro.ecoute.niveau < 0.3 ? 'J’écoute… (rien d’assez fort)' : 'J’écoute… (son pas assez net)';
    if (retour.etat === 'attente') return 'Rejoue la note (même note que la précédente)';
    if (retour.etat === 'autre') {
      const c = retour.cents;
      if (c != null && Math.abs(c) < 150) return `${entendu ?? '?'} : ${c > 0 ? 'trop haut' : 'trop bas'} de ${Math.abs(c)} cents`;
      return `J’entends ${entendu ?? '?'}${cible != null ? `, attendu ${nomNote(deMidi(cible), style, true)}` : ''}`;
    }
    return retour.etat === 'valide' ? 'Reconnue' : 'Tiens la note…';
  });
</script>

<div class="ecoute" aria-live="polite">
  <span class="niveau" title="Niveau sonore"><span style={`height:${Math.round(micro.ecoute.niveau * 100)}%`}></span></span>
  <span class="anneau" style={`--p:${Math.round((retour?.progression ?? 0) * 100)}`} title="Tenue de la note"></span>
  <span class="msg">{message}</span>
</div>

<style>
  .ecoute { display: inline-flex; align-items: center; gap: .6rem; font-size: .9rem; min-height: 2rem; }
  .niveau { width: 8px; height: 24px; border-radius: 3px; background: var(--rule); display: flex; align-items: flex-end; overflow: hidden; }
  .niveau span { display: block; width: 100%; background: var(--good); transition: height .06s; }
  .anneau { width: 22px; height: 22px; border-radius: 50%; background: conic-gradient(var(--accent) calc(var(--p) * 1%), var(--rule) 0); flex: none; }
  .msg { color: var(--ink-soft); }
</style>
