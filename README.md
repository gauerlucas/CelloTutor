# CelloTutor

Bricolé pour s'adapter à mes difficultés personnelles : positions et démanchés, lecture, gammes, oreille, morceaux-objectifs, et des séances qui s'adaptent au temps et à l'énergie du jour...

## Fonctions

- **Aujourd'hui** : choisir le temps (15 min à 2 h), l'énergie et si on a le violoncelle en main ; le planificateur compose une séance en blocs minutés. Une barre en haut de l'écran suit la séance sur toutes les pages (pause, report, bloc suivant), puis un bilan en un clic.
- **Positions** : manche de la ½ à la 7ᵉ position et pouce ; nommer et trouver les notes ; démanchés jugés à l'oreille ou au micro.
- **Morceaux** : bibliothèque et morceaux-objectifs (actif, en pause, abandonné), import MusicXML / MXL, lecteur avec partition gravée, clé au choix, son, tempo, boucle, décompte, manche synchronisé, conseils par mesure, passages et compétences à préparer, doigtés corrigeables.
- **Lecture** : clés de fa, d'ut et de sol par étapes débloquées, suite chronométrée, notes des morceaux en cours, révisions.
- **Gammes** : catalogue, doigtés sur portée et manche, bourdon, métronome, justesse note par note au micro ; la gamme du jour suit les morceaux-objectifs.
- **Oreille** : accordeur, justesse tenue au micro, imaginer la note.
- **Progression** : temps de travail, courbes, ceintures de maîtrise, records, carte du parcours des morceaux, journal.

## Utilisation (Windows)

1. Installer **Python 3** une fois : <https://www.python.org/downloads/> (cocher « Add python.exe to PATH »), ou `winget install Python.Python.3.13` dans un terminal.
2. Double-cliquer sur **`Lancer CelloTutor.bat`**. Une fenêtre noire s'ouvre (c'est l'assistant local) puis le navigateur affiche l'appli. Fermer la fenêtre noire arrête l'appli.
3. Pour un raccourci sur le bureau : clic droit sur `Lancer CelloTutor.bat` → *Envoyer vers* → *Bureau (créer un raccourci)*.
4. Pour l'installer comme une appli (fenêtre à part, icône) : dans Edge ou Chrome, menu → *Applications* → *Installer CelloTutor*.

La progression est enregistrée dans **`Violoncelle/donnees/etat.json`** (à côté du dépôt, hors de Git), avec une copie datée par jour dans `donnees/sauvegardes/` (30 dernières gardées). Sans l'assistant, par exemple en ouvrant `appli/index.html` directement, l'appli fonctionne mais garde la progression dans le navigateur ; *Réglages* permet alors de télécharger ou d'importer une sauvegarde.

## Organisation

| Dossier | Contenu |
|---|---|
| `appli/` | L'appli construite, prête à l'emploi (générée par `npm run build`, ne pas modifier à la main) |
| `web/` | Code source de l'interface (TypeScript, Svelte, Vite) |
| `assistant/` | Assistant local en Python (bibliothèque standard uniquement) et ses tests |
| `contenu/morceaux/` | Partitions des morceaux fournis (MusicXML, doigtés, sources) |
| `outils/` | `generer_morceaux.py` : régénère les MusicXML de Gluck et Fauré depuis leurs sources |

## Développement

```bash
cd web
npm install
npm run dev      # serveur de développement
npm test         # tests de la logique (Vitest)
npm run check    # vérification des types
npm run build    # reconstruit appli/
cd ..
python -m unittest discover -s assistant   # tests de l'assistant
```

`appli/` est versionné volontairement : l'appli s'utilise sans installer Node.js.

## Sources des partitions

- Gluck, *Mélodie* (Danse des Esprits bienheureux) : arrangement au registre de l'enregistrement de Camille Thomas, doigtés vérifiés (`contenu/morceaux/gluck-melodie/source/`).
- Fauré, *Après un rêve*, op. 7 nº 1 : ligne de chant de l'édition Choudens (1880), saisie LilyPond du [Mutopia Project](https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=368), domaine public.

La gravure des partitions utilise [Verovio](https://www.verovio.org) (LGPL), intégré à `appli/index.html`.
