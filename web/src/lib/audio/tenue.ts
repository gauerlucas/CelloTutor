// Reconnaissance d'une note tenue au micro, robuste aux bruits brefs et aux trous de détection.
// Une note n'est validée qu'après un temps cumulé « sur la cible » (pas un nombre de mesures),
// les courtes coupures (archet, vibrato, souffle) ne remettent pas le compteur à zéro, et une
// même note ne peut pas être validée deux fois sans être rejouée. Pure : testée sans micro.

export interface Lecture {
  /** Hauteur détectée (MIDI fractionnaire), null en silence ou si la détection est incertaine. */
  midi: number | null;
  /** Horodatage en millisecondes. */
  t: number;
}

export interface OptionsTenue {
  /** Temps cumulé sur la cible nécessaire pour valider (ms). */
  tenueMs: number;
  /** Coupure tolérée sans perdre la progression (ms). */
  graceMs: number;
  /** Écart maximal pour compter comme « la bonne note » (cents). Au-delà : autre note. */
  fenetreCents: number;
  /** Une erreur d'octave du détecteur (fréquent sur les cordes graves) compte comme la bonne note. */
  octaveTolere: boolean;
}

export const TENUES = { courte: 250, normale: 450, longue: 800 } as const;
export type DureeTenue = keyof typeof TENUES;

export const OPTIONS_TENUE: OptionsTenue = { tenueMs: TENUES.normale, graceMs: 220, fenetreCents: 60, octaveTolere: true };

export type EtatTenue = 'silence' | 'autre' | 'approche' | 'valide' | 'attente';

export interface Retour {
  etat: EtatTenue;
  /** 0 → 1 : progression vers la validation. */
  progression: number;
  /** Écart (cents) de la lecture courante à la cible, ramené dans l'octave si toléré. */
  cents: number | null;
  /** À la validation : écart médian (cents) sur toute la tenue. */
  ecartMedian?: number;
}

/** Écart en cents à la cible, en ramenant une erreur d'octave si demandé. */
export function ecartCible(midi: number, cible: number, octave: boolean): number {
  let d = (midi - cible) * 100;
  if (octave) {
    const k = Math.round(d / 1200);
    if (k !== 0 && Math.abs(d - 1200 * k) < 100) d -= 1200 * k;
  }
  return d;
}

export class DetecteurTenue {
  private cible: number | null = null;
  private cumul = 0;
  private dernierT: number | null = null;
  private dernierSur: number | null = null;
  private ecarts: number[] = [];
  /** Après une validation, il faut un silence ou une autre note avant de revalider la même. */
  private arme = true;
  private hauteurValidee: number | null = null;

  constructor(private o: OptionsTenue = OPTIONS_TENUE) {}

  regler(o: Partial<OptionsTenue>) {
    this.o = { ...this.o, ...o };
  }

  /** Change de note visée : la progression repart de zéro. */
  viser(cible: number | null) {
    if (cible !== this.cible) {
      // Si la nouvelle cible est la même hauteur que la note qu'on vient de valider, on exige qu'elle soit rejouée.
      this.arme = !(this.hauteurValidee != null && cible != null && Math.abs(cible - this.hauteurValidee) < 0.01);
      this.cible = cible;
      this.reinitialiser();
    }
  }

  private reinitialiser() {
    this.cumul = 0;
    this.dernierSur = null;
    this.ecarts = [];
  }

  pousser(l: Lecture): Retour {
    const dt = this.dernierT == null ? 0 : Math.min(200, Math.max(0, l.t - this.dernierT));
    this.dernierT = l.t;
    if (this.cible == null) return { etat: 'silence', progression: 0, cents: null };

    const cents = l.midi == null ? null : ecartCible(l.midi, this.cible, this.o.octaveTolere);
    const surCible = cents != null && Math.abs(cents) <= this.o.fenetreCents;

    if (!this.arme) {
      // On attend que la note précédente (même hauteur) s'arrête ou change.
      if (!surCible) this.arme = true;
      return { etat: 'attente', progression: 0, cents };
    }

    if (surCible) {
      this.cumul += dt;
      this.dernierSur = l.t;
      this.ecarts.push(cents!);
      if (this.cumul >= this.o.tenueMs) {
        const tri = [...this.ecarts].sort((a, b) => a - b);
        const ecartMedian = Math.round(tri[Math.floor(tri.length / 2)]!);
        this.hauteurValidee = this.cible;
        this.arme = false;
        this.reinitialiser();
        return { etat: 'valide', progression: 1, cents: Math.round(cents!), ecartMedian };
      }
      return { etat: 'approche', progression: this.cumul / this.o.tenueMs, cents: Math.round(cents!) };
    }

    // Hors cible : une coupure brève est pardonnée, au-delà la tenue repart de zéro.
    if (this.dernierSur != null && l.t - this.dernierSur <= this.o.graceMs) {
      return { etat: l.midi == null ? 'silence' : 'autre', progression: this.cumul / this.o.tenueMs, cents: cents == null ? null : Math.round(cents) };
    }
    this.reinitialiser();
    return { etat: l.midi == null ? 'silence' : 'autre', progression: 0, cents: cents == null ? null : Math.round(cents) };
  }
}
