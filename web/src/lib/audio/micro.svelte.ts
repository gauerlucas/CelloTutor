// Écoute du micro : une seule instance partagée par toute l'appli.

import { contexteAudio, sonAppJusqua } from './son';
import { decimer, detecterHauteur } from './hauteur';
import { midiDeHz } from '../musique/notes';

export interface Ecoute {
  /** Hauteur lissée (MIDI fractionnaire), null en silence. */
  midi: number | null;
  freq: number | null;
  /** Horodatage de la mesure (ms). */
  t: number;
  /** Niveau sonore au-dessus du bruit de fond (0 = bruit, 1 = fort), pour l'indicateur. */
  niveau: number;
}

class Micro {
  actif = $state(false);
  erreur = $state<string | null>(null);
  ecoute = $state<Ecoute>({ midi: null, freq: null, t: 0, niveau: 0 });
  /** Bruit de fond estimé (RMS), mis à jour pendant les silences. */
  private fond = 0.003;
  private flux: MediaStream | null = null;
  private analyseur: AnalyserNode | null = null;
  private tampon: Float32Array<ArrayBuffer> | null = null;
  private minuteur: ReturnType<typeof setInterval> | null = null;
  private lissage: number[] = [];

  async demarrer(): Promise<boolean> {
    if (this.actif) return true;
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("ce navigateur n'autorise pas le micro ici");
      const flux = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      const c = contexteAudio();
      const src = c.createMediaStreamSource(flux);
      const an = c.createAnalyser();
      an.fftSize = 8192;
      an.smoothingTimeConstant = 0;
      src.connect(an);
      this.flux = flux;
      this.analyseur = an;
      this.tampon = new Float32Array(an.fftSize);
      this.minuteur = setInterval(() => this.mesurer(), 60);
      this.actif = true;
      this.erreur = null;
      return true;
    } catch (e) {
      const err = e as { name?: string; message?: string };
      this.erreur = err?.name === 'NotAllowedError' ? 'accès au micro refusé' : (err?.message ?? 'micro indisponible');
      this.actif = false;
      return false;
    }
  }

  arreter(): void {
    if (this.minuteur) clearInterval(this.minuteur);
    this.minuteur = null;
    this.flux?.getTracks().forEach((t) => t.stop());
    this.flux = null;
    this.analyseur = null;
    this.actif = false;
    this.ecoute = { midi: null, freq: null, t: 0, niveau: 0 };
  }

  private mesurer(): void {
    if (!this.analyseur || !this.tampon) return;
    this.analyseur.getFloatTimeDomainData(this.tampon);
    const { y, sr } = decimer(this.tampon, contexteAudio().sampleRate);
    const cadre = y.length > 2048 ? y.subarray(y.length - 2048) : y;
    const t = performance.now();
    let rms = 0;
    for (let i = 0; i < cadre.length; i++) rms += cadre[i]! * cadre[i]!;
    rms = Math.sqrt(rms / cadre.length);
    const r = detecterHauteur(cadre, sr, 55, 1150, 0.002);
    // Bruit de fond (bourdon compris) : il descend vite vers les moments calmes et ne monte que très
    // lentement, si bien qu'une note jouée ressort au-dessus et qu'un bruit constant est ignoré.
    const brut = Math.min(rms, 0.08);
    this.fond = brut < this.fond ? this.fond * 0.7 + brut * 0.3 : this.fond * 0.995 + brut * 0.005;
    const seuil = Math.max(0.004, this.fond * 2.5);
    const niveau = Math.max(0, Math.min(1, Math.log10(Math.max(rms, 1e-6) / seuil) / 1.3 + 0.5));
    // Une hauteur n'est retenue que si le son dépasse nettement le bruit de fond et qu'elle est claire.
    // Pendant que l'appli joue elle-même une note, le micro l'entendrait : on l'ignore.
    const appJoue = t < sonAppJusqua();
    if (r && r.clarte > 0.8 && rms > seuil && !appJoue) {
      const m = midiDeHz(r.freq);
      // Saut de plus d'un demi-ton : nouvelle note, on ne la mélange pas avec la précédente.
      const dernier = this.lissage[this.lissage.length - 1];
      if (dernier != null && Math.abs(m - dernier) > 0.7) this.lissage = [];
      this.lissage.push(m);
      if (this.lissage.length > 3) this.lissage.shift();
      const tri = [...this.lissage].sort((a, b) => a - b);
      this.ecoute = { midi: tri[Math.floor(tri.length / 2)]!, freq: r.freq, t, niveau };
    } else {
      this.lissage = [];
      this.ecoute = { midi: null, freq: null, t, niveau };
    }
  }
}

export const micro = new Micro();
