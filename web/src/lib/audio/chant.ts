// Voix chantée : la syllabe de solfège (do, ré, mi…) chantée à la hauteur exacte de la note,
// par synthèse de formants. Les voix du navigateur parlent mais ne savent pas chanter juste ;
// ici une source glottale (dent de scie adoucie, vibrato) passe dans des filtres qui imitent la
// bouche pour chaque voyelle, précédée de la consonne (bruit, nasale ou attaque).

import { contexteAudio } from './son';
import { hzDeMidi } from '../musique/notes';

type Voyelle = 'a' | 'e' | 'i' | 'o';
/** Formants [fréquence, largeur] d'une voix d'homme (F1, F2, F3). */
const FORMANTS: Record<Voyelle, [number, number][]> = {
  a: [[750, 90], [1250, 110], [2650, 160]],
  e: [[420, 70], [2000, 110], [2600, 160]],
  i: [[290, 60], [2250, 120], [3000, 180]],
  o: [[470, 70], [820, 90], [2600, 160]],
};

interface Syllabe { voyelle: Voyelle; consonne: 'd' | 'r' | 'm' | 'f' | 's' | 'l'; finale?: 'l' }
/** Syllabes du solfège, de do (0) à si (6). */
export const SYLLABES: Syllabe[] = [
  { consonne: 'd', voyelle: 'o' },
  { consonne: 'r', voyelle: 'e' },
  { consonne: 'm', voyelle: 'i' },
  { consonne: 'f', voyelle: 'a' },
  { consonne: 's', voyelle: 'o', finale: 'l' },
  { consonne: 'l', voyelle: 'a' },
  { consonne: 's', voyelle: 'i' },
];

let bruit: AudioBuffer | null = null;
function bufferBruit(c: BaseAudioContext): AudioBuffer {
  if (!bruit || bruit.sampleRate !== c.sampleRate) {
    bruit = c.createBuffer(1, c.sampleRate, c.sampleRate);
    const d = bruit.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  return bruit;
}

/** Bouffée de bruit filtré (consonnes f, s, r, et l'explosion du d). */
function souffle(c: BaseAudioContext, sortie: AudioNode, t: number, duree: number, freq: number, q: number, niveau: number) {
  const n = c.createBufferSource();
  n.buffer = bufferBruit(c);
  const f = c.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = freq;
  f.Q.value = q;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(niveau, t + Math.min(0.02, duree / 3));
  g.gain.setValueAtTime(niveau, t + duree * 0.7);
  g.gain.linearRampToValueAtTime(0.0001, t + duree);
  n.connect(f);
  f.connect(g);
  g.connect(sortie);
  n.start(t);
  n.stop(t + duree + 0.02);
}

/**
 * Chante la syllabe de la lettre L (0 = do … 6 = si) à la hauteur MIDI donnée.
 * Renvoie l'heure audio de fin.
 */
export function chanter(m: number, L: number, dans = 0, duree = 0.75, volume = 0.5, ctx?: BaseAudioContext): number {
  const c = ctx ?? contexteAudio();
  const syl = SYLLABES[((L % 7) + 7) % 7]!;
  const f0 = hzDeMidi(m);
  const t0 = c.currentTime + 0.03 + dans;
  const sortie = c.createGain();
  sortie.gain.value = volume;
  sortie.connect(c.destination);

  // consonne d'attaque
  let tv = t0; // début de la voyelle
  switch (syl.consonne) {
    case 'd': souffle(c, sortie, t0, 0.025, 2500, 1.5, 0.18); tv = t0 + 0.02; break;
    case 'r': souffle(c, sortie, t0, 0.07, 1400, 2, 0.12); tv = t0 + 0.05; break;
    case 'f': souffle(c, sortie, t0, 0.11, 4500, 0.8, 0.16); tv = t0 + 0.1; break;
    case 's': souffle(c, sortie, t0, 0.12, 6500, 2, 0.2); tv = t0 + 0.11; break;
    default: break; // m et l : transition voisée, traitée sur la source
  }
  const fin = tv + duree;

  // source voisée : dent de scie, adoucie, avec vibrato tardif
  const src = c.createOscillator();
  src.type = 'sawtooth';
  src.frequency.setValueAtTime(f0 * 0.985, tv);
  src.frequency.exponentialRampToValueAtTime(f0, tv + 0.08);
  const vib = c.createOscillator();
  vib.frequency.value = 5.2;
  const vg = c.createGain();
  vg.gain.setValueAtTime(0, tv);
  vg.gain.linearRampToValueAtTime(0, tv + 0.2);
  vg.gain.linearRampToValueAtTime(f0 * 0.012, tv + 0.5);
  vib.connect(vg);
  vg.connect(src.frequency);
  const douceur = c.createBiquadFilter();
  douceur.type = 'lowpass';
  douceur.frequency.value = Math.max(1800, f0 * 6);
  src.connect(douceur);

  const env = c.createGain();
  env.gain.setValueAtTime(0.0001, tv);
  env.gain.exponentialRampToValueAtTime(1, tv + (syl.consonne === 'd' ? 0.02 : 0.06));
  env.gain.setValueAtTime(1, fin - 0.12);
  env.gain.exponentialRampToValueAtTime(0.0001, fin);
  douceur.connect(env);

  // bouche : formants en parallèle, qui glissent depuis la consonne (m nasal, l latéral)
  const fs = FORMANTS[syl.voyelle];
  const depart: [number, number, number] | null =
    syl.consonne === 'm' ? [250, 1000, 2400] : syl.consonne === 'l' ? [350, 1100, 2700] : syl.consonne === 'd' ? [300, 1700, 2600] : null;
  const arrivee: [number, number, number] | null = syl.finale === 'l' ? [350, 1100, 2700] : null;
  fs.forEach(([fr, bw], k) => {
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = fr / bw;
    if (depart) {
      bp.frequency.setValueAtTime(depart[k]!, tv);
      bp.frequency.linearRampToValueAtTime(fr, tv + 0.09);
    } else bp.frequency.setValueAtTime(fr, tv);
    if (arrivee) {
      bp.frequency.setValueAtTime(fr, fin - 0.16);
      bp.frequency.linearRampToValueAtTime(arrivee[k]!, fin - 0.05);
    }
    const g = c.createGain();
    g.gain.value = [1, 0.55, 0.25][k]! * (k === 0 ? 1 : Math.min(1, 900 / f0));
    env.connect(bp);
    bp.connect(g);
    g.connect(sortie);
  });
  // m : un peu de bourdonnement nasal au début
  if (syl.consonne === 'm') {
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 350;
    const gn = c.createGain();
    gn.gain.setValueAtTime(0.5, tv);
    gn.gain.linearRampToValueAtTime(0, tv + 0.1);
    env.connect(lp);
    lp.connect(gn);
    gn.connect(sortie);
  }

  src.start(tv);
  vib.start(tv);
  src.stop(fin + 0.05);
  vib.stop(fin + 0.05);
  if (!ctx) setTimeout(() => sortie.disconnect(), (fin - c.currentTime + 0.5) * 1000);
  return fin;
}
