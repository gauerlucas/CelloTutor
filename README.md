# CelloTutor

Application personnelle de travail du violoncelle : positions et démanchés, lecture, gammes, oreille, morceaux-objectifs, et des séances qui s'adaptent au temps et à l'énergie du jour.

Le cahier des charges et le plan de la V1 sont dans le dossier parent du projet (`Violoncelle/docs/`).

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
| `contenu/morceaux/` | Partitions sources des morceaux fournis (Gluck, Fauré) |

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
