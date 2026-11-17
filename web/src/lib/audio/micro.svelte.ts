// Écoute du micro : une seule instance partagée par toute l'appli.

import { contexteAudio } from './son';
import { decimer, detecterHauteur } from './hauteur';
import { midiDeHz } from '../musique/notes';

export interface Ecoute {
  /** Hauteur lissée (MIDI fractionnaire), null en silence. */
  midi: number | null;
  freq: number | null;
}

class Micro {
  actif = $state(false);
  erreur = $state<string | null>(null);
  ecoute = $state<Ecoute>({ midi: null, freq: null });
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
      this.minuteur = setInterval(() => this.mesurer(), 90);
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
    this.ecoute = { midi: null, freq: null };
  }

  private mesurer(): void {
    if (!this.analyseur || !this.tampon) return;
    this.analyseur.getFloatTimeDomainData(this.tampon);
    const { y, sr } = decimer(this.tampon, contexteAudio().sampleRate);
    const cadre = y.length > 2048 ? y.subarray(y.length - 2048) : y;
    const r = detecterHauteur(cadre, sr);
    if (r && r.clarte > 0.9) {
      this.lissage.push(midiDeHz(r.freq));
      if (this.lissage.length > 5) this.lissage.shift();
      const tri = [...this.lissage].sort((a, b) => a - b);
      this.ecoute = { midi: tri[Math.floor(tri.length / 2)]!, freq: r.freq };
    } else {
      this.lissage = [];
      this.ecoute = { midi: null, freq: null };
    }
  }
}

export const micro = new Micro();
