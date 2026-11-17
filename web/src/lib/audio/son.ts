// Son de violoncelle par synthèse additive (repris de l'ébauche « Atelier ») : spectre mesuré
// sur un enregistrement réel, vibrato retardé, souffle d'archet, cordes sympathiques, salle.
// Des échantillons réalistes arriveront en V2 sans changer cette interface.

import { hzDeMidi } from '../musique/notes';

let AC: AudioContext | null = null;
let MASTER: GainNode | null = null;
let BUS: GainNode | null = null;
let SUITE: GainNode | null = null;
let BRUIT: AudioBuffer | null = null;
let volume = 0.6;

const BENV_F0 = 64;
const BENV = [-33, -28.8, -19.9, -11.3, -6.4, -4, -2, -0.6, -0.3, 0.9, 3.1, 2.3, -0.8, -3.8, -4.2, -1.4, -3.7, -8.7, -9.8, -8.2, -3.7, 0.4, -1.3, -4.3, -5.6, -7.7, -6.9, -1.9, 1, 0, -2, -5.2, -8.7, -11.8, -15.5, -17.1, -16.4, -16.6, -18.9, -21.6, -22.9, -23.3];
const ALPHA = 1.14;
const CORDES_A_VIDE = [36, 43, 50, 57];

function envDb(f: number): number {
  const x = 6 * Math.log2(f / BENV_F0) - 0.5;
  let v: number;
  if (x <= 0) v = BENV[0]! - 6 * -x;
  else if (x >= BENV.length - 1) v = BENV[BENV.length - 1]! - (12 * (x - (BENV.length - 1))) / 6;
  else {
    const i = Math.floor(x), t = x - i;
    v = BENV[i]! * (1 - t) + BENV[i + 1]! * t;
  }
  if (f < 100) v += (10 * (100 - f)) / 36;
  return v;
}

function harmoniques(f0: number): number[] {
  const N = Math.max(4, Math.min(36, Math.floor(6800 / f0)));
  const a: number[] = [];
  let e = 0;
  for (let k = 1; k <= N; k++) {
    const amp = Math.pow(10, (envDb(f0 * k) - 20 * ALPHA * Math.log10(k)) / 20);
    a.push(amp);
    e += amp * amp;
  }
  const norm = 0.42 / Math.sqrt(e);
  return a.map((v) => v * norm);
}

export function contexteAudio(): AudioContext {
  if (!AC) {
    const A = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    AC = new A();
    MASTER = AC.createGain();
    MASTER.gain.value = volume;
    const comp = AC.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.ratio.value = 2.5;
    MASTER.connect(comp);
    comp.connect(AC.destination);
    BUS = AC.createGain();
    const chaud = AC.createBiquadFilter();
    chaud.type = 'peaking';
    chaud.frequency.value = 240;
    chaud.Q.value = 1.2;
    chaud.gain.value = 2.5;
    const air = AC.createBiquadFilter();
    air.type = 'highshelf';
    air.frequency.value = 3800;
    air.gain.value = -4;
    BUS.connect(chaud);
    chaud.connect(air);
    air.connect(MASTER);
    try {
      const sr = AC.sampleRate, len = Math.floor(sr * 1.4), ir = AC.createBuffer(2, len, sr);
      for (let c = 0; c < 2; c++) {
        const d = ir.getChannelData(c);
        let lp = 0;
        for (let i = 0; i < len; i++) {
          lp = lp * 0.72 + (Math.random() * 2 - 1) * 0.28;
          d[i] = lp * Math.pow(1 - i / len, 3.2) * 0.6;
        }
      }
      const cv = AC.createConvolver();
      cv.buffer = ir;
      const salle = AC.createGain();
      salle.gain.value = 0.2;
      air.connect(cv);
      cv.connect(salle);
      salle.connect(MASTER);
    } catch {
      /* pas de réverbération : tant pis */
    }
    const nl = AC.sampleRate * 1.5;
    BRUIT = AC.createBuffer(1, nl, AC.sampleRate);
    const nd = BRUIT.getChannelData(0);
    for (let i = 0; i < nl; i++) nd[i] = Math.random() * 2 - 1;
  }
  if (AC.state === 'suspended') void AC.resume();
  return AC;
}

export function reglerVolume(v: number): void {
  volume = v;
  if (MASTER && AC) MASTER.gain.setTargetAtTime(v, AC.currentTime, 0.05);
}

export interface OptionsNote {
  /** Décalage en secondes depuis maintenant. */
  dans?: number;
  force?: number; // 0 → 1
  vibrato?: boolean;
  /** Note d'une suite (lecteur de morceau) : coupée d'un coup par couperSuite(). */
  suite?: boolean;
}

let finSonApp = 0;
/** Jusqu'à quand (horloge performance.now, ms) l'appli joue elle-même une note : le micro l'ignore. */
export const sonAppJusqua = () => finSonApp;

/** Joue une note de violoncelle. Renvoie l'heure audio de fin. */
export function jouer(m: number, duree = 1.2, o: OptionsNote = {}): number {
  finSonApp = Math.max(finSonApp, performance.now() + ((o.dans ?? 0) + duree) * 1000 + 250);
  const c = contexteAudio();
  const f = hzDeMidi(m);
  const t = c.currentTime + 0.03 + (o.dans ?? 0);
  const vel = o.force ?? 1;
  const amps = harmoniques(f);
  const fin = t + duree;
  try {
    const sortie = c.createGain();
    sortie.connect(o.suite ? busSuite() : BUS!);
    const vib = c.createOscillator();
    vib.frequency.value = 5 + Math.random() * 0.7;
    const vg = c.createGain();
    const prof = o.vibrato === false ? 0 : 0.0042 + Math.random() * 0.0008;
    vg.gain.setValueAtTime(0, t);
    vg.gain.linearRampToValueAtTime(0, t + 0.3);
    vg.gain.linearRampToValueAtTime(prof, t + 0.9);
    vib.connect(vg);
    vib.start(t);
    vib.stop(fin + 1);
    amps.forEach((a0, i) => {
      const k = i + 1;
      const osc = c.createOscillator();
      const fk = f * k;
      osc.frequency.setValueAtTime(fk * 0.985, t);
      osc.frequency.exponentialRampToValueAtTime(fk, t + 0.09 + 0.01 * Math.min(k, 6));
      const vk = c.createGain();
      vk.gain.value = fk;
      vg.connect(vk);
      vk.connect(osc.frequency);
      const g = c.createGain();
      const a = Math.max(0.00002, a0 * vel);
      const att = Math.min(0.07 + 0.006 * Math.min(k, 16), duree * 0.4);
      g.gain.setValueAtTime(0.00001, t);
      g.gain.exponentialRampToValueAtTime(a * 0.8, t + att);
      g.gain.linearRampToValueAtTime(a, t + att + Math.min(0.3, duree * 0.3));
      const rel = Math.max(t + att + 0.02, fin - 0.08);
      g.gain.setValueAtTime(a, rel);
      g.gain.exponentialRampToValueAtTime(0.00001, fin + (k <= 3 ? 0.25 : 0.1));
      osc.connect(g);
      g.connect(sortie);
      osc.start(t);
      osc.stop(fin + 0.3);
    });
    if (BRUIT) {
      const ns = c.createBufferSource();
      ns.buffer = BRUIT;
      ns.loop = true;
      const bp = c.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = Math.min(3000, Math.max(180, f * 1.6));
      const ng = c.createGain();
      ng.gain.setValueAtTime(0.00001, t);
      ng.gain.exponentialRampToValueAtTime(0.05 * vel, t + 0.04);
      ng.gain.exponentialRampToValueAtTime(0.015 * vel, t + 0.3);
      ng.gain.setValueAtTime(0.015 * vel, Math.max(t + 0.31, fin - 0.1));
      ng.gain.exponentialRampToValueAtTime(0.00001, fin + 0.05);
      ns.connect(bp);
      bp.connect(ng);
      ng.connect(sortie);
      ns.start(t);
      ns.stop(fin + 0.2);
    }
    // corde à vide qui résonne quand la note est en rapport simple avec elle
    for (const mo of CORDES_A_VIDE) {
      const fo = hzDeMidi(mo), r = f / fo, q = Math.round(r);
      if (!(q >= 1 && q <= 6 && Math.abs(r - q) < 0.012)) continue;
      const so = c.createOscillator();
      so.frequency.value = fo * (q === 1 ? 2 : q);
      const sg = c.createGain();
      sg.gain.setValueAtTime(0.00001, t);
      sg.gain.exponentialRampToValueAtTime(0.03 * vel, t + 0.4);
      sg.gain.setValueAtTime(0.03 * vel, fin);
      sg.gain.exponentialRampToValueAtTime(0.00001, fin + 1.4);
      so.connect(sg);
      sg.connect(sortie);
      so.start(t);
      so.stop(fin + 1.5);
    }
    setTimeout(() => sortie.disconnect(), (fin - c.currentTime + 2) * 1000);
  } catch {
    /* son indisponible */
  }
  return fin;
}

function busSuite(): GainNode {
  if (!SUITE) {
    SUITE = contexteAudio().createGain();
    SUITE.connect(BUS!);
  }
  return SUITE;
}

/** Arrête net toutes les notes d'une suite en cours (y compris celles déjà programmées). */
export function couperSuite(): void {
  finSonApp = Math.min(finSonApp, performance.now() + 150);
  if (!SUITE || !AC) return;
  const s = SUITE;
  SUITE = null;
  s.gain.setTargetAtTime(0, AC.currentTime, 0.03);
  setTimeout(() => s.disconnect(), 400);
}

/** Heure de l'horloge audio (secondes). */
export const maintenantAudio = () => contexteAudio().currentTime;

/** Clic de métronome. */
export function clic(dans = 0, accent = false): void {
  try {
    const c = contexteAudio();
    const t = c.currentTime + 0.02 + dans;
    const o = c.createOscillator();
    o.type = 'square';
    o.frequency.value = accent ? 1800 : 1200;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(accent ? 0.25 : 0.15, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    o.connect(g);
    g.connect(MASTER!);
    o.start(t);
    o.stop(t + 0.07);
  } catch {
    /* rien */
  }
}

// ---------------------------------------------------------------- bourdon

let bourdon: { arreter: () => void; g: GainNode } | null = null;

export function demarrerBourdon(m: number, vol = 0.3): void {
  arreterBourdon();
  try {
    const c = contexteAudio(), t = c.currentTime, f = hzDeMidi(m);
    const amps = harmoniques(f);
    const re = new Float32Array(amps.length + 1), im = new Float32Array(amps.length + 1);
    amps.forEach((a, i) => (im[i + 1] = a));
    const onde = c.createPeriodicWave(re, im);
    const o1 = c.createOscillator();
    o1.setPeriodicWave(onde);
    o1.frequency.value = f;
    const o2 = c.createOscillator();
    o2.setPeriodicWave(onde);
    o2.frequency.value = f * 1.0025;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.001, vol), t + 0.8);
    const g2 = c.createGain();
    g2.gain.value = 0.5;
    o1.connect(g);
    o2.connect(g2);
    g2.connect(g);
    g.connect(BUS!);
    o1.start(t);
    o2.start(t);
    bourdon = {
      g,
      arreter: () => {
        const tt = c.currentTime;
        g.gain.cancelScheduledValues(tt);
        g.gain.setTargetAtTime(0.0001, tt, 0.2);
        setTimeout(() => {
          o1.stop();
          o2.stop();
        }, 1200);
      },
    };
  } catch {
    bourdon = null;
  }
}

export function arreterBourdon(): void {
  bourdon?.arreter();
  bourdon = null;
}

export const bourdonActif = () => bourdon !== null;

// ---------------------------------------------------------------- suites de notes

export interface NoteJouee {
  midi: number | null; // null = silence
  /** Début et durée en secondes. */
  debut: number;
  duree: number;
}

/** Programme une suite de notes ; renvoie une fonction pour tout arrêter. */
export function jouerSuite(notes: NoteJouee[]): () => void {
  const minuteurs: ReturnType<typeof setTimeout>[] = [];
  for (const n of notes) {
    if (n.midi == null) continue;
    // Programmation par paquets pour pouvoir arrêter rapidement.
    minuteurs.push(setTimeout(() => jouer(n.midi!, Math.max(0.12, n.duree * 0.95)), Math.max(0, n.debut * 1000 - 60)));
  }
  return () => minuteurs.forEach(clearTimeout);
}
