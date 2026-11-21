// Voix chantée enregistrée : l'utilisateur importe l'enregistrement d'une gamme de do majeur
// chantée en solfège (do ré mi fa sol la si…). On y retrouve les 7 syllabes, on mesure la
// hauteur réellement chantée et on garde chaque syllabe dans le navigateur (IndexedDB).
// Pour chanter une note, on prend la syllabe de sa lettre et on la transpose (« autotune ») :
// d'une altération, et à l'octave la plus proche de la tessiture de la voix enregistrée.
// L'enregistrement reste sur l'appareil : il n'est jamais mis dans le dépôt ni dans l'appli.

export interface SegmentVoix {
  debut: number; // s, consonne comprise
  fin: number; // s
  midi: number; // hauteur chantée mesurée (médiane, fractionnaire)
}

/** Demi-tons entre les degrés successifs de la gamme majeure : do→ré→mi→fa→sol→la→si. */
const PAS_GAMME = [2, 2, 1, 2, 2, 2];

interface Trame { t: number; rms: number; midi: number | null }

/** Hauteur par autocorrélation, sur un signal déjà ramené vers 11 kHz. */
function trames(x: Float32Array, sr: number): { liste: Trame[]; pas: number } {
  const pas = Math.round(sr * 0.02), N = Math.round(sr * 0.046);
  const lagMin = Math.floor(sr / 1100), lagMax = Math.ceil(sr / 70);
  const liste: Trame[] = [];
  for (let i = 0; i + N + lagMax < x.length; i += pas) {
    let moy = 0;
    for (let k = 0; k < N; k++) moy += x[i + k]!;
    moy /= N;
    let e0 = 0;
    for (let k = 0; k < N; k++) e0 += (x[i + k]! - moy) ** 2;
    const rms = Math.sqrt(e0 / N);
    let midi: number | null = null;
    if (rms > 0.008) {
      let meilleur = 0, lag = 0;
      const c = new Float64Array(lagMax + 2);
      for (let l = lagMin; l <= lagMax + 1; l++) {
        let s = 0, e1 = 0;
        for (let k = 0; k < N; k++) {
          const b = x[i + k + l]! - moy;
          s += (x[i + k]! - moy) * b;
          e1 += b * b;
        }
        c[l] = s / Math.sqrt(e0 * e1 + 1e-12);
      }
      for (let l = lagMin + 1; l <= lagMax; l++) if (c[l]! > meilleur && c[l]! >= c[l - 1]! && c[l]! >= c[l + 1]!) { meilleur = c[l]!; lag = l; }
      // préférer la plus courte période presque aussi bonne (évite l'octave du dessous)
      for (let l = lagMin + 1; l < lag; l++) if (c[l]! > meilleur * 0.9 && c[l]! >= c[l - 1]! && c[l]! >= c[l + 1]!) { lag = l; break; }
      if (meilleur > 0.75 && lag) {
        const a = c[lag - 1]!, b = c[lag]!, d = c[lag + 1]!;
        const fin = lag + (0.5 * (a - d)) / (a - 2 * b + d || 1);
        midi = 69 + 12 * Math.log2(sr / fin / 440);
      }
    }
    liste.push({ t: i / sr, rms, midi });
  }
  return { liste, pas: pas / sr };
}

const mediane = (v: number[]) => { const s = [...v].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]!; };

/** Plages chantées sur une hauteur stable (au moins 0,3 s). */
function notesTenues(liste: Trame[], pas: number): SegmentVoix[] {
  const res: SegmentVoix[] = [];
  let cour: Trame[] = [];
  const clore = () => {
    if (cour.length * pas >= 0.3) {
      res.push({ debut: cour[0]!.t, fin: cour[cour.length - 1]!.t + pas * 2, midi: mediane(cour.map((x) => x.midi!)) });
    }
    cour = [];
  };
  for (const t0 of liste) {
    const tr = { ...t0 };
    if (tr.midi === null) { clore(); continue; }
    if (cour.length) {
      const ref = mediane(cour.slice(-8).map((x) => x.midi!));
      // erreur d'octave du détecteur : on replie
      const e = tr.midi - ref, o = Math.round(e / 12);
      if (o !== 0 && Math.abs(e - 12 * o) < 0.7) tr.midi -= 12 * o;
      if (Math.abs(tr.midi - ref) > 0.7) clore();
    }
    cour.push(tr);
  }
  clore();
  // recoller une même syllabe coupée par un creux de volume
  const fus: SegmentVoix[] = [];
  for (const s of res) {
    const p = fus[fus.length - 1];
    if (p && s.debut - p.fin < 0.35 && Math.abs(s.midi - p.midi) < 0.5) {
      const a = p.fin - p.debut, b = s.fin - s.debut;
      fus[fus.length - 1] = { debut: p.debut, fin: s.fin, midi: (p.midi * a + s.midi * b) / (a + b) };
    } else fus.push({ ...s });
  }
  return fus;
}

/**
 * Trouve do, ré, mi, fa, sol, la, si (montants) dans un enregistrement mono.
 * Renvoie les 7 segments, ou un message d'erreur.
 */
export function decouperGamme(x: Float32Array, sr: number): SegmentVoix[] | string {
  // ramener vers 11 kHz (moyenne glissante puis décimation) : assez pour une voix, et rapide
  const f = Math.max(1, Math.floor(sr / 11025));
  const y = new Float32Array(Math.floor(x.length / f));
  for (let i = 0; i < y.length; i++) { let s = 0; for (let k = 0; k < f; k++) s += x[i * f + k]!; y[i] = s / f; }
  const { liste, pas } = trames(y, sr / f);
  const notes = notesTenues(liste, pas);
  for (let i = 0; i + 7 <= notes.length; i++) {
    const g = notes.slice(i, i + 7);
    if (PAS_GAMME.every((p, k) => Math.abs(g[k + 1]!.midi - g[k]!.midi - p) < 0.6)) {
      // garder la consonne avant la voyelle, sans mordre sur la note précédente
      return g.map((s, k) => ({ ...s, debut: Math.max(k ? g[k - 1]!.fin : 0, s.debut - 0.14) }));
    }
  }
  return notes.length < 7
    ? 'Je n’ai pas trouvé assez de notes tenues. Chante chaque syllabe environ une demi-seconde, avec un petit silence entre elles.'
    : 'Je n’ai pas reconnu une gamme majeure montante (do ré mi fa sol la si). Vérifie que l’enregistrement commence par la gamme qui monte.';
}

// --- stockage et lecture ---

export interface SyllabeEnregistree { midi: number; sr: number; pcm: Float32Array }
let voix: SyllabeEnregistree[] | null = null;
let tampons: AudioBuffer[] | null = null;
const abonnes = new Set<() => void>();
export const voixEnregistree = () => voix !== null;
export function surChangementVoix(f: () => void): () => void { abonnes.add(f); return () => abonnes.delete(f); }
const prevenir = () => abonnes.forEach((f) => f());

const BASE = 'cellotutor', MAGASIN = 'etat', CLE = 'voix';
async function magasin<T>(mode: IDBTransactionMode, op: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  const db = await new Promise<IDBDatabase>((ok, ko) => {
    const req = indexedDB.open(BASE, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(MAGASIN);
    req.onsuccess = () => ok(req.result);
    req.onerror = () => ko(req.error);
  });
  try {
    return await new Promise<T>((ok, ko) => {
      const req = op(db.transaction(MAGASIN, mode).objectStore(MAGASIN));
      req.onsuccess = () => ok(req.result as T);
      req.onerror = () => ko(req.error);
    });
  } finally { db.close(); }
}

export async function chargerVoix(): Promise<void> {
  try {
    const v = await magasin<SyllabeEnregistree[] | undefined>('readonly', (s) => s.get(CLE));
    if (Array.isArray(v) && v.length === 7) { voix = v; tampons = null; prevenir(); }
  } catch { /* stockage indisponible : voix de synthèse */ }
}

/** Importe un fichier audio (gamme de do majeur chantée). Renvoie un message pour l'utilisateur. */
export async function importerVoix(fichier: Blob, c: BaseAudioContext): Promise<{ ok: boolean; message: string }> {
  let audio: AudioBuffer;
  try { audio = await c.decodeAudioData(await fichier.arrayBuffer()); } catch {
    return { ok: false, message: 'Ce fichier audio n’est pas lisible par le navigateur.' };
  }
  const n = audio.length, mono = new Float32Array(n);
  for (let ch = 0; ch < audio.numberOfChannels; ch++) { const d = audio.getChannelData(ch); for (let i = 0; i < n; i++) mono[i]! += d[i]! / audio.numberOfChannels; }
  const segs = decouperGamme(mono, audio.sampleRate);
  if (typeof segs === 'string') return { ok: false, message: segs };
  const sr = audio.sampleRate;
  const nouvelles = segs.map((s) => {
    const pcm = mono.slice(Math.floor(s.debut * sr), Math.ceil(s.fin * sr));
    let pk = 0; for (const v of pcm) pk = Math.max(pk, Math.abs(v));
    const g = pk > 0 ? 0.8 / pk : 1; // même niveau pour chaque syllabe
    for (let i = 0; i < pcm.length; i++) pcm[i]! *= g;
    return { midi: s.midi, sr, pcm };
  });
  voix = nouvelles; tampons = null; prevenir();
  try { await magasin('readwrite', (st) => st.put(nouvelles, CLE)); } catch {
    return { ok: true, message: 'Voix reconnue, mais le navigateur refuse de la garder : elle sera oubliée à la fermeture.' };
  }
  const ecart = Math.max(...segs.map((s, k) => Math.abs(s.midi - (Math.round(segs[0]!.midi) + [0, 2, 4, 5, 7, 9, 11][k]!))));
  return { ok: true, message: `Voix enregistrée : 7 syllabes trouvées${ecart > 0.25 ? ' (justesse corrigée)' : ''}.` };
}

export async function oublierVoix(): Promise<void> {
  voix = null; tampons = null; prevenir();
  try { await magasin('readwrite', (s) => s.delete(CLE)); } catch { /* rien */ }
}

/** Transposition (en demi-tons) de la syllabe enregistrée vers la note m : altération + octave proche. */
export function decalage(m: number, midiSyllabe: number): number {
  const d = m - midiSyllabe;
  return d - 12 * Math.round(d / 12);
}

/** Chante la syllabe L à la hauteur m avec la voix enregistrée. Renvoie l'heure de fin, ou null. */
export function chanterEnregistre(c: BaseAudioContext, sortie: AudioNode, m: number, L: number, t: number, duree: number): number | null {
  if (!voix) return null;
  tampons ??= voix.map((s) => { const b = c.createBuffer(1, s.pcm.length, s.sr); b.copyToChannel(s.pcm as Float32Array<ArrayBuffer>, 0); return b; });
  const k = ((L % 7) + 7) % 7, s = voix[k]!, b = tampons[k]!;
  const src = c.createBufferSource();
  src.buffer = b;
  src.playbackRate.value = 2 ** (decalage(m, s.midi) / 12);
  const longueur = Math.min(b.duration / src.playbackRate.value, duree + 0.25);
  const g = c.createGain();
  const niveau = 0.45; // à peu près le niveau de la voix de synthèse et du violoncelle
  g.gain.setValueAtTime(niveau, t);
  g.gain.setValueAtTime(niveau, t + longueur - 0.18);
  g.gain.linearRampToValueAtTime(0, t + longueur);
  src.connect(g);
  g.connect(sortie);
  src.start(t);
  src.stop(t + longueur + 0.02);
  return t + longueur;
}
