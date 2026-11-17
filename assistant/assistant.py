"""Assistant local de CelloTutor.

Sert l'application sur http://127.0.0.1 et enregistre la progression dans un
dossier du PC (par défaut ``../donnees`` à côté du dépôt). Uniquement la
bibliothèque standard de Python : rien à installer en plus de Python.

    python assistant/assistant.py            # lance et ouvre le navigateur
    python assistant/assistant.py --sans-navigateur --port 8765
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import socket
import sys
import tempfile
import threading
import webbrowser
from functools import partial
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

VERSION = "0.1.0"
RACINE_DEPOT = Path(__file__).resolve().parent.parent
DOSSIER_APPLI = RACINE_DEPOT / "appli"
DOSSIER_DONNEES_DEFAUT = RACINE_DEPOT.parent / "donnees"
FICHIER_ETAT = "etat.json"
SOUS_DOSSIER_COPIES = "sauvegardes"
COPIES_GARDEES = 30
TAILLE_MAX = 20 * 1024 * 1024  # 20 Mo, largement assez pour un fichier de progression
PORT_DEFAUT = 8765


def ecrire_atomique(chemin: Path, contenu: bytes) -> None:
    """Écrit dans un fichier temporaire puis le renomme : jamais de fichier à moitié écrit."""
    chemin.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=chemin.parent, prefix=".tmp-", suffix=".json")
    try:
        with os.fdopen(fd, "wb") as f:
            f.write(contenu)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp, chemin)
    except BaseException:
        Path(tmp).unlink(missing_ok=True)
        raise


def copie_du_jour(donnees: Path, contenu: bytes, aujourd_hui: dt.date | None = None) -> None:
    """Garde une copie datée par jour (la dernière de la journée) et supprime les plus anciennes."""
    jour = (aujourd_hui or dt.date.today()).isoformat()
    copies = donnees / SOUS_DOSSIER_COPIES
    ecrire_atomique(copies / f"etat-{jour}.json", contenu)
    existantes = sorted(copies.glob("etat-????-??-??.json"))
    for vieille in existantes[:-COPIES_GARDEES]:
        vieille.unlink(missing_ok=True)


class Gestionnaire(SimpleHTTPRequestHandler):
    """Fichiers de l'appli + petite API JSON sous /api/."""

    # Types fixés ici : sous Windows, le registre peut donner de mauvais types (.js en text/plain…).
    extensions_map = {
        **SimpleHTTPRequestHandler.extensions_map,
        ".html": "text/html; charset=utf-8",
        ".js": "text/javascript",
        ".css": "text/css",
        ".svg": "image/svg+xml",
        ".json": "application/json",
        ".webmanifest": "application/manifest+json",
        ".wasm": "application/wasm",
    }

    def __init__(self, *args, donnees: Path, **kwargs):
        self.donnees = donnees
        super().__init__(*args, **kwargs)

    # Pas de cache : l'appli et l'état doivent toujours être frais.
    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, format: str, *args) -> None:  # noqa: A002 - signature imposée
        if self.path.startswith("/api/") and getattr(self, "command", "") == "GET":
            return  # pas de bruit pour les lectures fréquentes
        sys.stderr.write("[%s] %s\n" % (self.log_date_time_string(), format % args))

    def _json(self, statut: int, obj: object) -> None:
        corps = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(statut)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(corps)))
        self.end_headers()
        self.wfile.write(corps)

    def _origine_locale(self) -> bool:
        """Refuse les écritures envoyées par d'autres sites ouverts dans le navigateur."""
        origine = self.headers.get("Origin")
        if origine is None:
            return True
        hote = self.headers.get("Host", "")
        return origine in (f"http://{hote}", f"https://{hote}")

    def do_GET(self) -> None:  # noqa: N802 - nom imposé
        chemin = self.path.split("?", 1)[0]
        if chemin == "/api/sante":
            self._json(HTTPStatus.OK, {"ok": True, "version": VERSION, "dossierDonnees": str(self.donnees)})
        elif chemin == "/api/etat":
            fichier = self.donnees / FICHIER_ETAT
            if not fichier.exists():
                # 204 plutôt que 404 : ce n'est pas une erreur, juste une première utilisation.
                self.send_response(HTTPStatus.NO_CONTENT)
                self.end_headers()
                return
            corps = fichier.read_bytes()
            self.send_response(HTTPStatus.OK)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(corps)))
            self.end_headers()
            self.wfile.write(corps)
        elif chemin.startswith("/api/"):
            self._json(HTTPStatus.NOT_FOUND, {"ok": False, "erreur": "inconnu"})
        else:
            if chemin == "/":
                self.path = "/index.html"
            super().do_GET()

    def do_PUT(self) -> None:  # noqa: N802 - nom imposé
        if self.path.split("?", 1)[0] != "/api/etat":
            self._json(HTTPStatus.NOT_FOUND, {"ok": False, "erreur": "inconnu"})
            return
        if not self._origine_locale():
            self._json(HTTPStatus.FORBIDDEN, {"ok": False, "erreur": "origine refusée"})
            return
        try:
            longueur = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            longueur = -1
        if longueur <= 0 or longueur > TAILLE_MAX:
            self._json(HTTPStatus.REQUEST_ENTITY_TOO_LARGE if longueur > TAILLE_MAX else HTTPStatus.BAD_REQUEST,
                       {"ok": False, "erreur": "taille invalide"})
            return
        corps = self.rfile.read(longueur)
        try:
            etat = json.loads(corps)
        except (UnicodeDecodeError, json.JSONDecodeError):
            self._json(HTTPStatus.BAD_REQUEST, {"ok": False, "erreur": "JSON invalide"})
            return
        if not isinstance(etat, dict) or not isinstance(etat.get("version"), int):
            self._json(HTTPStatus.BAD_REQUEST, {"ok": False, "erreur": "ce n'est pas un état CelloTutor"})
            return
        joli = json.dumps(etat, ensure_ascii=False, indent=2).encode("utf-8")
        ecrire_atomique(self.donnees / FICHIER_ETAT, joli)
        copie_du_jour(self.donnees, joli)
        self._json(HTTPStatus.OK, {"ok": True})


def port_libre(depart: int, essais: int = 20) -> int:
    for port in range(depart, depart + essais):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            if os.name != "nt":
                # Comme le serveur : ignore les connexions récemment fermées (TIME_WAIT).
                # Pas sous Windows, où cette option permettrait de voler un port occupé.
                s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            try:
                s.bind(("127.0.0.1", port))
                return port
            except OSError:
                continue
    raise SystemExit(f"Aucun port libre entre {depart} et {depart + essais - 1}.")


def creer_serveur(port: int, donnees: Path, appli: Path = DOSSIER_APPLI) -> ThreadingHTTPServer:
    donnees.mkdir(parents=True, exist_ok=True)
    gestionnaire = partial(Gestionnaire, directory=str(appli), donnees=donnees)
    return ThreadingHTTPServer(("127.0.0.1", port), gestionnaire)


def main(argv: list[str] | None = None) -> None:
    p = argparse.ArgumentParser(description="Assistant local de CelloTutor")
    p.add_argument("--port", type=int, default=PORT_DEFAUT)
    p.add_argument("--donnees", type=Path, default=DOSSIER_DONNEES_DEFAUT, help="dossier où enregistrer la progression")
    p.add_argument("--sans-navigateur", action="store_true", help="ne pas ouvrir le navigateur")
    args = p.parse_args(argv)

    if not (DOSSIER_APPLI / "index.html").exists():
        raise SystemExit(f"L'appli construite est introuvable dans {DOSSIER_APPLI}.")

    port = port_libre(args.port)
    serveur = creer_serveur(port, args.donnees.resolve())
    adresse = f"http://127.0.0.1:{port}/"
    print(f"CelloTutor {VERSION} : {adresse}")
    print(f"Progression enregistrée dans : {args.donnees.resolve()}")
    print("Ferme cette fenêtre (ou Ctrl+C) pour arrêter CelloTutor.")
    if not args.sans_navigateur:
        threading.Timer(0.5, lambda: webbrowser.open(adresse)).start()
    try:
        serveur.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        serveur.server_close()


if __name__ == "__main__":
    main()
