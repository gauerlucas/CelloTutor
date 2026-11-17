// La séance guidée en cours : minuteur par bloc, bloc suivant, report, pause, bilan.
// Gardée dans le navigateur pour survivre à un rechargement ; enregistrée dans l'état à la fin.

import type { Bloc, Demande } from './planificateur';
import { stockage } from './stockage.svelte';
import { jourDe } from './revision';
import { clic } from './audio/son';

export interface BlocEnCours extends Bloc {
  fait: boolean;
  reporte: boolean;
  /** Secondes passées sur le bloc. */
  ecoule: number;
}

export interface Bilan {
  minutes: number;
  faits: number;
  total: number;
  reportes: string[];
}

const CLE = 'cellotutor-seance';

class SeanceEnCours {
  plan = $state<BlocEnCours[]>([]);
  indice = $state(0);
  active = $state(false);
  enPause = $state(false);
  bilan = $state<Bilan | null>(null);
  demande: Demande = { duree: 60, energie: 'normal', instrument: true };
  debut = 0;
  private minuteur: ReturnType<typeof setInterval> | null = null;
  private sonne = false;

  get bloc(): BlocEnCours | null {
    return this.active ? this.plan[this.indice] ?? null : null;
  }

  demarrer(plan: Bloc[], demande: Demande) {
    this.plan = plan.map((b) => ({ ...b, fait: false, reporte: false, ecoule: 0 }));
    this.indice = 0;
    this.demande = demande;
    this.debut = Date.now();
    this.active = true;
    this.enPause = false;
    this.bilan = null;
    this.lancerMinuteur();
    this.aller();
  }

  private aller() {
    this.sonne = false;
    const b = this.bloc;
    if (b) location.hash = b.lien;
    this.sauver();
  }

  private lancerMinuteur() {
    if (this.minuteur) clearInterval(this.minuteur);
    this.minuteur = setInterval(() => {
      const b = this.bloc;
      if (!b || this.enPause || document.hidden) return;
      b.ecoule++;
      if (!this.sonne && b.ecoule >= b.minutes * 60) {
        this.sonne = true;
        clic(0, true);
        clic(0.25, true);
      }
      if (b.ecoule % 10 === 0) this.sauver();
    }, 1000);
  }

  suivant() {
    const b = this.bloc;
    if (!b) return;
    b.fait = true;
    this.avancer();
  }

  reporter() {
    const b = this.bloc;
    if (!b) return;
    b.reporte = true;
    this.avancer();
  }

  private avancer() {
    if (this.indice + 1 >= this.plan.length) {
      this.terminer();
      return;
    }
    this.indice++;
    this.aller();
  }

  basculerPause() {
    this.enPause = !this.enPause;
    this.sauver();
  }

  /** Arrête la séance ; ce qui est fait est gardé, le reste sera proposé la prochaine fois. */
  terminer() {
    if (!this.active) return;
    if (this.minuteur) clearInterval(this.minuteur);
    this.minuteur = null;
    const secondes = this.plan.reduce((s, b) => s + b.ecoule, 0);
    this.bilan = {
      minutes: Math.max(1, Math.round(secondes / 60)),
      faits: this.plan.filter((b) => b.fait).length,
      total: this.plan.length,
      reportes: this.plan.filter((b) => !b.fait).map((b) => b.titre),
    };
    this.active = false;
    this.enregistrer();
    this.sauver();
  }

  /** Inscrit la séance dans le journal (sans ressenti : il s'ajoute ensuite d'un clic). */
  private enregistrer() {
    const b = this.bilan!;
    const etat = stockage.etat;
    etat.seances.push({
      id: `s${this.debut.toString(36)}`,
      debut: this.debut,
      dureePrevueMin: this.demande.duree,
      dureeReelleMin: b.minutes,
      energie: this.demande.energie,
      blocs: this.plan.map((x) => ({ id: x.id, type: x.type, titre: x.titre, minutes: x.minutes, fait: x.fait, cible: x.cible })),
    });
    jourDe(etat, this.debut).minutes += b.minutes;
    stockage.modifie();
  }

  noter(ressenti: 1 | 2 | 3) {
    const s = stockage.etat.seances[stockage.etat.seances.length - 1];
    if (s && s.debut === this.debut) {
      s.ressenti = ressenti;
      stockage.modifie();
    }
    this.fermerBilan();
  }

  fermerBilan() {
    this.bilan = null;
    this.sauver();
  }

  private sauver() {
    try {
      if (!this.active && !this.bilan) localStorage.removeItem(CLE);
      else localStorage.setItem(CLE, JSON.stringify({ plan: this.plan, indice: this.indice, demande: this.demande, debut: this.debut, active: this.active, enPause: this.enPause, bilan: this.bilan }));
    } catch {
      /* stockage du navigateur indisponible : la séance continue en mémoire */
    }
  }

  /** Reprend une séance interrompue par un rechargement (si elle a moins de 6 h). */
  restaurer() {
    try {
      const brut = localStorage.getItem(CLE);
      if (!brut) return;
      const s = JSON.parse(brut);
      if (!s || Date.now() - s.debut > 6 * 3600 * 1000) {
        localStorage.removeItem(CLE);
        return;
      }
      this.plan = s.plan;
      this.indice = s.indice;
      this.demande = s.demande;
      this.debut = s.debut;
      this.active = !!s.active;
      this.enPause = true; // on reprend en pause : l'utilisateur relance quand il est prêt
      this.bilan = s.bilan ?? null;
      if (this.active) this.lancerMinuteur();
    } catch {
      /* rien à reprendre */
    }
  }
}

export const seance = new SeanceEnCours();

export const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
