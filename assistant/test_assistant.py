"""Tests de l'assistant local : python -m unittest discover -s assistant"""

import datetime as dt
import json
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from pathlib import Path

import assistant as a


class TestAssistant(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        racine = Path(self.tmp.name)
        self.appli = racine / "appli"
        self.appli.mkdir()
        (self.appli / "index.html").write_text("<!doctype html><title>CelloTutor</title>", encoding="utf-8")
        self.donnees = racine / "donnees"
        self.serveur = a.creer_serveur(0, self.donnees, self.appli)
        self.base = f"http://127.0.0.1:{self.serveur.server_address[1]}"
        threading.Thread(target=self.serveur.serve_forever, daemon=True).start()

    def tearDown(self):
        self.serveur.shutdown()
        self.serveur.server_close()
        self.tmp.cleanup()

    def requete(self, chemin, methode="GET", corps=None, entetes=None):
        req = urllib.request.Request(self.base + chemin, data=corps, method=methode, headers=entetes or {})
        try:
            with urllib.request.urlopen(req) as r:
                return r.status, r.read()
        except urllib.error.HTTPError as e:
            return e.code, e.read()

    def test_sert_l_appli(self):
        statut, corps = self.requete("/")
        self.assertEqual(statut, 200)
        self.assertIn(b"CelloTutor", corps)

    def test_sante(self):
        statut, corps = self.requete("/api/sante")
        self.assertEqual(statut, 200)
        j = json.loads(corps)
        self.assertTrue(j["ok"])
        self.assertEqual(j["dossierDonnees"], str(self.donnees))

    def test_etat_absent_puis_ecrit_puis_relu(self):
        self.assertEqual(self.requete("/api/etat")[0], 204)
        etat = {"version": 1, "majLe": 5, "reglages": {"theme": "sombre"}, "note": "é"}
        statut, _ = self.requete("/api/etat", "PUT", json.dumps(etat).encode(), {"Content-Type": "application/json"})
        self.assertEqual(statut, 200)
        statut, corps = self.requete("/api/etat")
        self.assertEqual(statut, 200)
        self.assertEqual(json.loads(corps), etat)
        self.assertTrue((self.donnees / "etat.json").exists())
        self.assertEqual(len(list((self.donnees / "sauvegardes").glob("etat-*.json"))), 1)

    def test_refuse_le_contenu_invalide(self):
        self.assertEqual(self.requete("/api/etat", "PUT", b"pas du json")[0], 400)
        self.assertEqual(self.requete("/api/etat", "PUT", b'{"sansVersion": true}')[0], 400)
        self.assertEqual(self.requete("/api/etat", "PUT", b"[1, 2]")[0], 400)
        self.assertFalse((self.donnees / "etat.json").exists())

    def test_refuse_une_ecriture_venant_d_un_autre_site(self):
        statut, _ = self.requete("/api/etat", "PUT", b'{"version": 1}', {"Origin": "https://exemple.com"})
        self.assertEqual(statut, 403)
        statut, _ = self.requete("/api/etat", "PUT", b'{"version": 1}', {"Origin": self.base})
        self.assertEqual(statut, 200)

    def test_copies_limitees_a_30(self):
        debut = dt.date(2026, 1, 1)
        for i in range(35):
            a.copie_du_jour(self.donnees, b'{"version": 1}', debut + dt.timedelta(days=i))
        copies = sorted((self.donnees / "sauvegardes").glob("etat-*.json"))
        self.assertEqual(len(copies), 30)
        self.assertEqual(copies[0].name, "etat-2026-01-06.json")


if __name__ == "__main__":
    unittest.main()
