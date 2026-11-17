// État partagé de l'appli (runes Svelte 5) et synchronisation navigateur ↔ dossier.

import { choisirPlusRecent, etatInitial, type Etat, type Reglages } from './etat';
import * as p from './persistance';

export type StatutSauvegarde =
  | 'chargement'
  | 'dossier' // enregistré dans donnees/ par l'assistant
  | 'navigateur' // assistant absent : navigateur seulement
  | 'erreur';

class Stockage {
  etat = $state<Etat>(etatInitial());
  statut = $state<StatutSauvegarde>('chargement');
  assistant = $state<p.InfoAssistant | null>(null);
  private minuteur: ReturnType<typeof setTimeout> | null = null;

  async charger(): Promise<void> {
    const [nav, info] = await Promise.all([p.lireNavigateur(), p.sonderAssistant()]);
    this.assistant = info;
    const dossier = info ? await p.lireDossier() : null;
    const choisi = choisirPlusRecent(nav, dossier);
    if (choisi) this.etat = choisi;
    // Recopie l'état retenu des deux côtés, pour que les deux copies concordent.
    await this.enregistrerMaintenant();
  }

  /** À appeler après chaque modification de l'état. */
  modifie(): void {
    this.etat.majLe = Date.now();
    void p.ecrireNavigateur($state.snapshot(this.etat) as Etat);
    if (this.minuteur) clearTimeout(this.minuteur);
    this.minuteur = setTimeout(() => void this.enregistrerMaintenant(), 800);
  }

  regler<K extends keyof Reglages>(cle: K, valeur: Reglages[K]): void {
    this.etat.reglages[cle] = valeur;
    this.modifie();
  }

  async enregistrerMaintenant(): Promise<void> {
    const instantane = $state.snapshot(this.etat) as Etat;
    const okNav = await p.ecrireNavigateur(instantane);
    if (this.assistant) {
      const okDossier = await p.ecrireDossier(instantane);
      if (okDossier) {
        this.statut = 'dossier';
        return;
      }
      // L'assistant a peut-être été fermé : on le signale sans bloquer.
      this.assistant = await p.sonderAssistant();
    }
    this.statut = okNav ? 'navigateur' : 'erreur';
  }

  async remplacer(nouvel: Etat): Promise<void> {
    this.etat = nouvel;
    this.modifie();
    await this.enregistrerMaintenant();
  }
}

export const stockage = new Stockage();
