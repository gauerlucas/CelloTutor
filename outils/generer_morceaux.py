"""Génère les partitions MusicXML des morceaux fournis avec CelloTutor.

    python outils/generer_morceaux.py

- Gluck : à partir des données de l'ébauche (notes, doigtés, cordes, positions).
- Fauré : à partir de la ligne de chant LilyPond du Mutopia Project.

Les fichiers produits (contenu/morceaux/<id>/partition.musicxml et, pour Gluck,
doigtes.json) sont versionnés : ce script ne sert qu'à les régénérer.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from fractions import Fraction as F
from pathlib import Path
from xml.sax.saxutils import escape

RACINE = Path(__file__).resolve().parent.parent
MORCEAUX = RACINE / "contenu" / "morceaux"
PAS = "CDEFGAB"
DEMITONS = [0, 2, 4, 5, 7, 9, 11]


@dataclass
class Evt:
    """Une note ou un silence, déjà découpé en valeurs écrivables."""
    duree: F  # en noires
    degre: int | None = None  # degré diatonique (C4 = 28), None pour un silence
    alter: int = 0
    lie_suivant: bool = False
    lie_precedent: bool = False
    triolet: int = 0  # 0 aucun, sinon position : 1 début, 2 milieu, 3 fin
    doigt: str | None = None
    corde: int | None = None  # numérotation MusicXML : 1 = La … 4 = Do
    point_orgue: bool = False
    nuance: str | None = None
    texte: str | None = None
    alter_ecrite: int | None = None


@dataclass
class Mesure:
    numero: int
    evts: list[Evt] = field(default_factory=list)


# ------------------------------------------------------------ écriture MusicXML

TYPES = {
    F(4): ("whole", 0), F(3): ("half", 1), F(2): ("half", 0), F(3, 2): ("quarter", 1), F(1): ("quarter", 0),
    F(3, 4): ("eighth", 1), F(1, 2): ("eighth", 0), F(3, 8): ("16th", 1), F(1, 4): ("16th", 0),
    F(3, 16): ("32nd", 1), F(1, 8): ("32nd", 0),
}
NIVEAU_CROCHES = {"eighth": 1, "16th": 2, "32nd": 3}


def type_de(e: Evt) -> tuple[str, int]:
    d = e.duree * F(3, 2) if e.triolet else e.duree
    return TYPES[d]


def decouper(duree: F) -> list[F]:
    """Découpe une durée quelconque en valeurs écrivables liées (de la plus longue à la plus courte)."""
    reste, out = duree, []
    for v in sorted(TYPES, reverse=True):
        while reste >= v:
            out.append(v)
            reste -= v
    if reste:
        raise ValueError(f"durée non écrivable : {duree}")
    return out


def poser_ligatures(evts: list[Evt], debut_temps: F = F(0)) -> list[dict[int, str]]:
    """Ligatures par temps (noire) : renvoie pour chaque événement {niveau: begin|continue|end|forward hook|backward hook}."""
    res: list[dict[int, str]] = [{} for _ in evts]
    t = debut_temps
    groupes: list[list[int]] = []
    courant: list[int] = []
    temps_courant = None
    for i, e in enumerate(evts):
        temps = int(t)  # numéro du temps
        typ, _ = type_de(e)
        crochable = e.degre is not None and typ in NIVEAU_CROCHES
        if not crochable or temps != temps_courant:
            if len(courant) > 1:
                groupes.append(courant)
            courant = []
            temps_courant = temps
        if crochable:
            courant.append(i)
        t += e.duree
    if len(courant) > 1:
        groupes.append(courant)
    for g in groupes:
        for niveau in (1, 2, 3):
            dans = [i for i in g if NIVEAU_CROCHES[type_de(evts[i])[0]] >= niveau]
            for i in dans:
                k = g.index(i)
                prec = k > 0 and g[k - 1] in dans
                suiv = k < len(g) - 1 and g[k + 1] in dans
                if niveau == 1:
                    res[i][1] = "begin" if k == 0 else "end" if k == len(g) - 1 else "continue"
                elif prec and suiv:
                    res[i][niveau] = "continue"
                elif suiv:
                    res[i][niveau] = "begin"
                elif prec:
                    res[i][niveau] = "end"
                else:
                    res[i][niveau] = "forward hook" if k < len(g) - 1 else "backward hook"
    return res


ORDRE_DIESES = "FCGDAEB"


def alterations_armure(quintes: int) -> dict[str, int]:
    if quintes >= 0:
        return {p: 1 for p in ORDRE_DIESES[:quintes]}
    return {p: -1 for p in ORDRE_DIESES[::-1][: -quintes]}


def poser_alterations(mesures: list["Mesure"], quintes: int) -> None:
    """Décide quelles notes portent une altération écrite (règle usuelle : valable jusqu'à la barre)."""
    armure = alterations_armure(quintes)
    for m in mesures:
        vues: dict[tuple[int, int], int] = {}
        for e in m.evts:
            if e.degre is None:
                continue
            cle = (e.degre % 7, e.degre // 7)
            attendu = vues.get(cle, armure.get(PAS[e.degre % 7], 0))
            if e.lie_precedent:
                vues[cle] = e.alter
                e.alter_ecrite = None
                continue
            e.alter_ecrite = e.alter if e.alter != attendu else None
            vues[cle] = e.alter


def xml_note(e: Evt, div: int, ligatures: dict[int, str]) -> str:
    typ, points = type_de(e)
    duree = int(e.duree * div)
    x = ["      <note>"]
    if e.degre is None:
        x.append("        <rest/>")
    else:
        pas, octave = PAS[e.degre % 7], e.degre // 7
        alter = f"<alter>{e.alter}</alter>" if e.alter else ""
        x.append(f"        <pitch><step>{pas}</step>{alter}<octave>{octave}</octave></pitch>")
    x.append(f"        <duration>{duree}</duration>")
    if e.lie_precedent:
        x.append('        <tie type="stop"/>')
    if e.lie_suivant:
        x.append('        <tie type="start"/>')
    x.append("        <voice>1</voice>")
    x.append(f"        <type>{typ}</type>")
    x += ["        <dot/>"] * points
    if e.degre is not None and e.alter_ecrite is not None:
        x.append({1: "        <accidental>sharp</accidental>", -1: "        <accidental>flat</accidental>",
                  0: "        <accidental>natural</accidental>"}.get(e.alter_ecrite, ""))
    if e.triolet:
        x.append("        <time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification>")
    if e.degre is not None:
        x.append(f"        <stem>{'down' if e.degre >= 34 else 'up'}</stem>")
    for niveau, val in sorted(ligatures.items()):
        x.append(f'        <beam number="{niveau}">{val}</beam>')
    notations = []
    if e.lie_precedent:
        notations.append('<tied type="stop"/>')
    if e.lie_suivant:
        notations.append('<tied type="start"/>')
    if e.triolet == 1:
        notations.append('<tuplet type="start" bracket="no"/>')
    if e.triolet == 3:
        notations.append('<tuplet type="stop"/>')
    if e.point_orgue:
        notations.append("<fermata/>")
    tech = ""
    if e.doigt is not None:
        tech += f"<fingering>{escape(e.doigt)}</fingering>"
    if e.corde is not None:
        tech += f"<string>{e.corde}</string>"
    if tech:
        notations.append(f"<technical>{tech}</technical>")
    if notations:
        x.append("        <notations>" + "".join(notations) + "</notations>")
    x.append("      </note>")
    return "\n".join(l for l in x if l)


def xml_partition(titre: str, compositeur: str, sous_titre: str, mesures: list[Mesure], div: int,
                  quintes: int, mode: str, cle: tuple[str, int], tempo: int, indication: str) -> str:
    out = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 3.1 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">',
        '<score-partwise version="3.1">',
        f"  <work><work-title>{escape(titre)}</work-title></work>",
        f'  <identification><creator type="composer">{escape(compositeur)}</creator>'
        f"<encoding><software>CelloTutor outils/generer_morceaux.py</software></encoding></identification>",
        f'  <credit page="1"><credit-type>subtitle</credit-type><credit-words>{escape(sous_titre)}</credit-words></credit>',
        '  <part-list><score-part id="P1"><part-name>Violoncelle</part-name>'
        '<score-instrument id="P1-I1"><instrument-name>Violoncelle</instrument-name></score-instrument>'
        '<midi-instrument id="P1-I1"><midi-program>43</midi-program></midi-instrument></score-part></part-list>',
        '  <part id="P1">',
    ]
    poser_alterations(mesures, quintes)
    for k, m in enumerate(mesures):
        out.append(f'    <measure number="{m.numero}">')
        if k == 0:
            out.append(
                f"      <attributes><divisions>{div}</divisions><key><fifths>{quintes}</fifths><mode>{mode}</mode></key>"
                f"<time><beats>3</beats><beat-type>4</beat-type></time><clef><sign>{cle[0]}</sign><line>{cle[1]}</line></clef></attributes>"
            )
            out.append(
                '      <direction placement="above"><direction-type><words font-weight="bold">'
                f'{escape(indication)}</words></direction-type><direction-type><metronome><beat-unit>quarter</beat-unit>'
                f"<per-minute>{tempo}</per-minute></metronome></direction-type><sound tempo=\"{tempo}\"/></direction>"
            )
        ligs = poser_ligatures(m.evts)
        for e, lg in zip(m.evts, ligs):
            if e.nuance:
                out.append(f'      <direction placement="below"><direction-type><dynamics><{e.nuance}/></dynamics></direction-type></direction>')
            if e.texte:
                out.append(f'      <direction placement="below"><direction-type><words font-style="italic">{escape(e.texte)}</words></direction-type></direction>')
            out.append(xml_note(e, div, lg))
        if k == len(mesures) - 1:
            out.append('      <barline location="right"><bar-style>light-heavy</bar-style></barline>')
        out.append("    </measure>")
    out += ["  </part>", "</score-partwise>", ""]
    return "\n".join(out)


def verifier(mesures: list[Mesure], longueur: F = F(3)) -> None:
    for m in mesures:
        total = sum((e.duree for e in m.evts), F(0))
        if total != longueur:
            raise ValueError(f"mesure {m.numero} : {total} noires au lieu de {longueur}")


# ------------------------------------------------------------ Gluck

NUANCES_GLUCK = {2: "p", 10: "f", 16: "p", 18: "mp", 20: "f", 26: "f", 30: "pp", 34: "f", 37: "ppp"}
TEXTES_GLUCK = {9: "cresc.", 12: "dim.", 22: "dim.", 27: "dim.", 32: "cresc.", 35: "dim."}


def gluck() -> None:
    src = json.loads((MORCEAUX / "gluck-melodie" / "source" / "ebauche.json").read_text(encoding="utf-8"))
    notes = src["notes"]
    par_mesure: dict[int, list[dict]] = {}
    for n in notes:
        par_mesure.setdefault(n["b"], []).append(n)
    mesures: list[Mesure] = []
    doigtes = []  # un par note jouée (attaque), dans l'ordre de la partition
    prec = None  # note précédente de l'ébauche, pour repérer les prolongations d'une mesure à l'autre
    for b in sorted(par_mesure):
        m = Mesure(numero=b - 1)  # l'ébauche commençait à 2 ; la partition imprimée à 1
        t = F(0)
        premiere = True
        for n in sorted(par_mesure[b], key=lambda x: x["bt"]):
            bt, du = F(n["bt"]).limit_denominator(16), F(n["du"]).limit_denominator(16)
            if bt > t:
                for v in decouper(bt - t):
                    m.evts.append(Evt(duree=v))
                t = bt
            degre = n["d"]
            alter = n["m"] - (12 * (degre // 7 + 1) + DEMITONS[degre % 7])
            morceaux = decouper(du)
            doigt = "p" if n["f"] == "P" else str(n["f"])
            for k, v in enumerate(morceaux):
                e = Evt(duree=v, degre=degre, alter=alter,
                        lie_suivant=k < len(morceaux) - 1 or bool(n.get("tie")),
                        lie_precedent=k > 0,
                        point_orgue=bool(n.get("fer")) and k == len(morceaux) - 1)
                if k == 0:
                    e.doigt, e.corde = doigt, 4 - n["si"]
                if premiere:
                    e.nuance = NUANCES_GLUCK.get(b)
                    e.texte = TEXTES_GLUCK.get(b)
                    premiere = False
                m.evts.append(e)
            t += du
            if not (prec and prec.get("tie") and prec["m"] == n["m"]):  # une prolongation n'est pas une attaque
                doigtes.append({"mesure": b - 1, "corde": n["si"], "position": n["p"], "doigt": n["f"], "demiTons": n["sm"]})
            prec = n
        if t < 3:
            for v in decouper(F(3) - t):
                m.evts.append(Evt(duree=v))
        mesures.append(m)
    # les notes liées d'une mesure à l'autre : marquer l'arrêt de liaison sur la suivante
    tous = [e for m in mesures for e in m.evts]
    for a, b in zip(tous, tous[1:]):
        if a.lie_suivant and b.degre == a.degre:
            b.lie_precedent = True
    verifier(mesures)
    xml = xml_partition("Mélodie", "Christoph Willibald Gluck",
                        "Danse des Esprits bienheureux — section centrale, au registre de l’enregistrement de Camille Thomas",
                        mesures, 8, -1, "minor", ("G", 2), 57, "Lento")
    dossier = MORCEAUX / "gluck-melodie"
    (dossier / "partition.musicxml").write_text(xml, encoding="utf-8")
    conseils = {str(int(k) - 1): v for k, v in src["conseils"].items()}
    (dossier / "doigtes.json").write_text(json.dumps({"doigtes": doigtes, "conseils": conseils}, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"Gluck : {len(mesures)} mesures, {len(doigtes)} notes")


# ------------------------------------------------------------ Fauré (lecteur LilyPond minimal)

NOTE_LY = re.compile(r"^([a-g])((?:isis|eses|is|es)?)([',]*)$")


def lire_chant_ly(texte: str) -> list[Mesure]:
    """Lit le bloc « chant = \\relative c'' { … } » : notes, durées, liaisons, triolets, silences."""
    bloc = texte[texte.index("chant ="): texte.index("poesie =")]
    bloc = re.sub(r"%[^\n]*", "", bloc)
    bloc = re.sub(r"\\override[^\n]*|\\set[^\n]*|\\tupletSpan \d+|\\dynamicUp|\\key \w+ \\\w+|\\time \d+/\d+|\\bar \"[^\"]*\"", " ", bloc)
    # textes ^\markup{\italic "…"} gardés comme indications
    bloc = re.sub(r'\^\\markup\{\s*\\italic\s*"([^"]*)"\s*\}', lambda m: f' TEXTE:{m.group(1).replace(" ", "_")} ', bloc)
    bloc = bloc[bloc.index("{") + 1: bloc.rindex("}")]
    jetons = re.findall(r"\\tuplet\s+3/2|\{|\}|\||~|TEXTE:\S+|\\[a-z]+|[\[\]()]|\\[<>!]|[a-gRr](?:isis|eses|is|es)?[',]*(?:\d+\.?)?", bloc)

    ref = 7 * 5 + 0  # c'' = C5
    duree_prec = F(1)
    mesures = [Mesure(1)]
    triolet = False
    pos_triolet = 0
    texte_en_attente = None
    nuance_en_attente = None
    for j in jetons:
        if j == "|":
            mesures.append(Mesure(len(mesures) + 1))
        elif j.startswith("\\tuplet"):
            triolet, pos_triolet = True, 0
        elif j == "{":
            continue
        elif j == "}":
            triolet = False
        elif j == "~":
            for m in reversed(mesures):
                if m.evts:
                    m.evts[-1].lie_suivant = True
                    break
        elif j.startswith("TEXTE:"):
            texte_en_attente = j[6:].replace("_", " ")
        elif j in ("\\p", "\\pp", "\\f", "\\mf", "\\mp", "\\ff"):
            # la nuance suit la note dans LilyPond : on l'attache à la dernière note
            for m in reversed(mesures):
                if m.evts:
                    m.evts[-1].nuance = j[1:]
                    break
        elif re.match(r"^[a-gRr]", j):
            mm = re.match(r"^([a-gRr])((?:isis|eses|is|es)?)([',]*)(\d+)?(\.)?$", j)
            lettre, alt, octs, dur, point = mm.groups()
            if dur:
                duree_prec = F(4, int(dur)) * (F(3, 2) if point else 1)
            d = duree_prec * (F(2, 3) if triolet else 1)
            if lettre in "Rr":
                if lettre == "R" and not dur:
                    d = F(3)
                mesures[-1].evts.append(Evt(duree=d))
                continue
            pas = "cdefgab".index(lettre)
            # mode relatif : l'octave la plus proche (à moins d'une quinte) de la note précédente
            candidat = (ref // 7) * 7 + pas
            while candidat - ref > 3:
                candidat -= 7
            while ref - candidat > 3:
                candidat += 7
            candidat += 7 * octs.count("'") - 7 * octs.count(",")
            ref = candidat
            alter = {"": 0, "is": 1, "es": -1, "isis": 2, "eses": -2}[alt]
            e = Evt(duree=d, degre=candidat, alter=alter, texte=texte_en_attente, nuance=nuance_en_attente)
            texte_en_attente = nuance_en_attente = None
            if triolet:
                pos_triolet += 1
            mesures[-1].evts.append(e)
    mesures = [m for m in mesures if m.evts]
    return mesures


def marquer_triolets(mesures: list[Mesure]) -> None:
    """Regroupe les notes de triolet par noire (tupletSpan 4) et pose début / fin."""
    for m in mesures:
        t = F(0)
        groupe: list[Evt] = []
        for e in m.evts:
            est_triolet = e.duree.denominator % 3 == 0
            if est_triolet:
                if not groupe:
                    debut = t
                groupe.append(e)
                if t + e.duree - debut == 1:
                    for k, g in enumerate(groupe):
                        g.triolet = 1 if k == 0 else 3 if k == len(groupe) - 1 else 2
                    groupe = []
            t += e.duree


def faure() -> None:
    texte = (MORCEAUX / "faure-apres-un-reve" / "source" / "apres.ly").read_text(encoding="utf-8")
    mesures = lire_chant_ly(texte)
    marquer_triolets(mesures)
    tous = [e for m in mesures for e in m.evts]
    for a, b in zip(tous, tous[1:]):
        if a.lie_suivant:
            b.lie_precedent = True
    verifier(mesures)
    # Les éditions pour violoncelle jouent la ligne de chant à la même hauteur, en do mineur.
    xml = xml_partition("Après un rêve", "Gabriel Fauré",
                        "op. 7 nº 1 — ligne de chant, édition Choudens (1880), Mutopia Project (domaine public)",
                        mesures, 12, -3, "minor", ("G", 2), 60, "Andantino")
    (MORCEAUX / "faure-apres-un-reve" / "partition.musicxml").write_text(xml, encoding="utf-8")
    print(f"Fauré : {len(mesures)} mesures, {sum(1 for e in tous if e.degre is not None and not e.lie_precedent)} notes")


if __name__ == "__main__":
    gluck()
    faure()
