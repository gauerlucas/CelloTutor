// Voix chantée : la syllabe de solfège (do, ré, mi…) chantée à la hauteur exacte de la note,
// par synthèse de formants. Les voix du navigateur parlent mais ne savent pas chanter juste ;
// ici on imite une vraie voix :
//  - source glottale (impulsion de Rosenberg dérivée, pas une dent de scie bourdonnante),
//    avec un peu de souffle mêlé à la voix ;
//  - hauteur vivante : petit glissé d'attaque, dérive lente aléatoire, vibrato qui s'installe
//    avec une vitesse et une ampleur légèrement différentes à chaque note ;
//  - conduit vocal en cascade de 5 résonateurs (comme le synthétiseur de Klatt), F1 qui suit
//    la fondamentale dans l'aigu comme le font les chanteurs ;
//  - consonne d'attaque (bruit, nasale ou latérale) puis un peu de salle (réverbération).

import { contexteAudio } from './son';
import { hzDeMidi } from '../musique/notes';
import { chanterEnregistre, voixEnregistree } from './voixImportee';

type Voyelle = 'a' | 'e' | 'i' | 'o';
/** Formants [fréquence, largeur de bande] d'une voix d'homme, F1 à F5. */
const FORMANTS: Record<Voyelle, [number, number][]> = {
  a: [[700, 110], [1220, 120], [2600, 160], [3300, 250], [3850, 300]],
  e: [[420, 90], [1900, 130], [2550, 170], [3350, 250], [3900, 300]],
  i: [[290, 80], [2200, 140], [2950, 200], [3450, 250], [3950, 300]],
  o: [[430, 90], [780, 100], [2500, 160], [3300, 250], [3850, 300]],
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
    bruit = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
    const d = bruit.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  return bruit;
}

/** Une période d'impulsion glottale (Rosenberg) dérivée, en série de Fourier. */
const ondes = new WeakMap<BaseAudioContext, PeriodicWave>();
function ondeGlottale(c: BaseAudioContext): PeriodicWave {
  let w = ondes.get(c);
  if (w) return w;
  const N = 2048, H = 80, Tp = 0.42, Tn = 0.16;
  const g = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    const t = i / N;
    g[i] = t < Tp ? 0.5 * (1 - Math.cos((Math.PI * t) / Tp)) : t < Tp + Tn ? Math.cos((Math.PI * (t - Tp)) / (2 * Tn)) : 0;
  }
  const re = new Float32Array(H + 1), im = new Float32Array(H + 1);
  for (let h = 1; h <= H; h++) {
    let a = 0, b = 0;
    for (let i = 0; i < N; i++) {
      const d = g[(i + 1) % N]! - g[i]!; // dérivée : rayonnement aux lèvres
      a += d * Math.cos((2 * Math.PI * h * i) / N);
      b += d * Math.sin((2 * Math.PI * h * i) / N);
    }
    re[h] = a;
    im[h] = b;
  }
  w = c.createPeriodicWave(re, im);
  ondes.set(c, w);
  return w;
}

/** Petite salle partagée : réponse impulsionnelle synthétique (bruit qui décroît en s'assombrissant). */
const salles = new WeakMap<BaseAudioContext, AudioNode>();
function salle(c: BaseAudioContext): AudioNode {
  let s = salles.get(c);
  if (s) return s;
  const duree = 1.3, n = Math.round(c.sampleRate * duree);
  const ir = c.createBuffer(2, n, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < n; i++) {
      const t = i / c.sampleRate;
      const k = Math.min(0.9, 0.25 + t * 0.9); // de plus en plus sombre
      lp = lp * k + (Math.random() * 2 - 1) * (1 - k);
      d[i] = lp * Math.exp(-t * 4.2) * (t < 0.012 ? t / 0.012 : 1);
    }
  }
  const conv = c.createConvolver();
  conv.buffer = ir;
  const g = c.createGain();
  g.gain.value = 0.9;
  conv.connect(g);
  g.connect(c.destination);
  salles.set(c, conv);
  return conv;
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
  g.gain.setValueAtTime(niveau, t + duree * 0.6);
  g.gain.linearRampToValueAtTime(0.0001, t + duree);
  n.connect(f);
  f.connect(g);
  g.connect(sortie);
  n.start(t, Math.random());
  n.stop(t + duree + 0.02);
}

const alea = (a: number, b: number) => a + Math.random() * (b - a);

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
  // voix enregistrée par l'utilisateur (gamme importée) : elle passe avant la synthèse
  if (voixEnregistree()) {
    const finE = chanterEnregistre(c, sortie, m, L, t0, duree);
    if (finE !== null) {
      if (!ctx) setTimeout(() => sortie.disconnect(), (finE - c.currentTime + 0.5) * 1000);
      return finE;
    }
  }
  const envoi = c.createGain();
  envoi.gain.value = 0.22;
  sortie.connect(envoi);
  envoi.connect(salle(c));

  // consonne d'attaque
  let tv = t0; // début de la voyelle
  switch (syl.consonne) {
    case 'd': souffle(c, sortie, t0, 0.02, 3000, 1.2, 0.1); tv = t0 + 0.018; break;
    case 'r': souffle(c, sortie, t0, 0.06, 1500, 1.5, 0.06); tv = t0 + 0.045; break;
    case 'f': souffle(c, sortie, t0, 0.1, 5000, 0.9, 0.09); tv = t0 + 0.09; break;
    case 's': souffle(c, sortie, t0, 0.11, 6500, 2.2, 0.12); tv = t0 + 0.1; break;
    default: break; // m et l : transition voisée, traitée sur les formants
  }
  const fin = tv + duree;
  const stop = fin + 0.1;

  // --- hauteur : glissé d'attaque, dérive lente, vibrato qui s'installe ---
  const src = c.createOscillator();
  src.setPeriodicWave(ondeGlottale(c));
  src.frequency.setValueAtTime(f0 * 0.975, tv);
  src.frequency.setTargetAtTime(f0, tv, 0.035);
  const vib = c.createOscillator();
  vib.frequency.setValueAtTime(alea(4.9, 5.6), tv);
  vib.frequency.linearRampToValueAtTime(alea(5.3, 6), fin);
  const vg = c.createGain();
  const ampleur = f0 * alea(0.011, 0.016); // environ ±20 à ±28 cents
  vg.gain.setValueAtTime(0, tv);
  vg.gain.setValueAtTime(0, tv + 0.18);
  vg.gain.linearRampToValueAtTime(ampleur, tv + 0.55);
  vib.connect(vg);
  vg.connect(src.frequency);
  // dérive : bruit très filtré (quelques cents, lent)
  const derive = c.createBufferSource();
  derive.buffer = bufferBruit(c);
  derive.loop = true;
  const dlp = c.createBiquadFilter();
  dlp.type = 'lowpass';
  dlp.frequency.value = 6;
  const dg = c.createGain();
  dg.gain.value = f0 * 0.25; // le bruit filtré à 6 Hz est faible : ≈ ±5 cents
  derive.connect(dlp);
  dlp.connect(dg);
  dg.connect(src.frequency);

  // --- source : voix + un peu de souffle ---
  const source = c.createGain();
  const voix = c.createGain();
  voix.gain.value = 1;
  src.connect(voix);
  voix.connect(source);
  const asp = c.createBufferSource();
  asp.buffer = bufferBruit(c);
  asp.loop = true;
  const ahp = c.createBiquadFilter();
  ahp.type = 'highpass';
  ahp.frequency.value = 900;
  const ag = c.createGain();
  ag.gain.value = 0.05;
  asp.connect(ahp);
  ahp.connect(ag);
  ag.connect(source);

  // enveloppe (douce) et léger tremolo lié au vibrato
  const env = c.createGain();
  env.gain.setValueAtTime(0, tv);
  env.gain.setTargetAtTime(1, tv, syl.consonne === 'd' ? 0.012 : 0.03);
  env.gain.setTargetAtTime(0, fin - 0.1, 0.035);
  source.connect(env);
  const trem = c.createGain();
  trem.gain.value = 1;
  const tg = c.createGain();
  tg.gain.setValueAtTime(0, tv);
  tg.gain.linearRampToValueAtTime(0.06, tv + 0.55);
  vib.connect(tg);
  tg.connect(trem.gain);
  env.connect(trem);

  // --- conduit vocal : 5 résonateurs en cascade, qui glissent depuis la consonne ---
  const fs = FORMANTS[syl.voyelle].map(([f, b], k) => [k === 0 ? Math.max(f, f0 * 1.15) : f, b] as [number, number]);
  const depart: number[] | null =
    syl.consonne === 'm' ? [250, 1100, 2400] : syl.consonne === 'l' ? [360, 1150, 2700] : syl.consonne === 'd' ? [320, 1650, 2650] : syl.consonne === 'r' ? [400, 1300, 2300] : null;
  const arrivee: number[] | null = syl.finale === 'l' ? [360, 1150, 2700] : null;
  let noeud: AudioNode = trem;
  fs.forEach(([fr, bw], k) => {
    const r = c.createBiquadFilter();
    r.type = 'lowpass';
    r.Q.value = 20 * Math.log10(fr / bw) - 3; // Q en dB pour un passe-bas : pic ≈ fr/bw
    const d0 = depart?.[k];
    if (d0) {
      r.frequency.setValueAtTime(d0, tv);
      r.frequency.setTargetAtTime(fr, tv + 0.01, 0.035);
    } else r.frequency.setValueAtTime(fr, tv);
    const a = arrivee?.[k];
    if (a) {
      r.frequency.setValueAtTime(fr, fin - 0.2);
      r.frequency.linearRampToValueAtTime(a, fin - 0.06);
    }
    noeud.connect(r);
    noeud = r;
  });
  // les graves sont naturellement plus forts : on égalise un peu
  const niveau = c.createGain();
  niveau.gain.value = 0.13 * Math.min(1.6, Math.sqrt(220 / f0) + 0.3);
  noeud.connect(niveau);
  niveau.connect(sortie);

  // m : bourdonnement nasal bouche fermée au début
  if (syl.consonne === 'm') {
    voix.gain.setValueAtTime(0.35, tv);
    voix.gain.setTargetAtTime(1, tv + 0.06, 0.02);
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 300;
    const gn = c.createGain();
    gn.gain.setValueAtTime(0.25, tv);
    gn.gain.setTargetAtTime(0, tv + 0.06, 0.02);
    trem.connect(lp);
    lp.connect(gn);
    gn.connect(sortie);
  }
  // l : la langue ferme un peu la bouche au début
  if (syl.consonne === 'l') {
    voix.gain.setValueAtTime(0.55, tv);
    voix.gain.setTargetAtTime(1, tv + 0.04, 0.02);
  }

  for (const n of [src, vib, derive, asp]) {
    n.start(tv);
    n.stop(stop);
  }
  if (!ctx) setTimeout(() => sortie.disconnect(), (stop - c.currentTime + 1.5) * 1000);
  return fin;
}
