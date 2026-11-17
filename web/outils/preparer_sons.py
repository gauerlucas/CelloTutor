"""Prépare les échantillons de violoncelle pour l'appli.

Entrée : un dossier de fichiers audio (wav, flac, aiff, mp3, ogg), une note par fichier.
Sortie : src/sons/violoncelle/<midi>.mp3 + index.json (hauteur, boucle, gain).

Pour chaque fichier : hauteur mesurée (autocorrélation), silence de début retiré, partie
tenue repérée, boucle sans clic préparée par fondu enchaîné, volume égalisé.

    python outils/preparer_sons.py <dossier> [--sortie src/sons/violoncelle] [--max 3.2]

Demande ffmpeg (décodage et encodage) et numpy.
"""

import argparse
import json
import math
import re
import subprocess
import sys
from pathlib import Path

import numpy as np

SR = 44100
EXT = {'.wav', '.flac', '.aif', '.aiff', '.mp3', '.ogg', '.m4a'}
LETTRES = {'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11}


def lire(chemin: Path) -> np.ndarray:
    brut = subprocess.run(
        ['ffmpeg', '-v', 'error', '-i', str(chemin), '-ac', '1', '-ar', str(SR), '-f', 'f32le', '-'],
        check=True, capture_output=True,
    ).stdout
    return np.frombuffer(brut, dtype=np.float32).astype(np.float64)


def ecrire_mp3(x: np.ndarray, chemin: Path) -> None:
    subprocess.run(
        ['ffmpeg', '-v', 'error', '-y', '-f', 'f32le', '-ar', str(SR), '-ac', '1', '-i', '-',
         '-codec:a', 'libmp3lame', '-b:a', '96k', str(chemin)],
        input=x.astype(np.float32).tobytes(), check=True,
    )


def midi_du_nom(nom: str) -> int | None:
    """Lit une hauteur dans le nom (« A2 », « C#3 », « Eb4 », « cello_G3 »…), s'il y en a une."""
    m = re.search(r'(?<![A-Za-z])([A-Ga-g])([#sb]?)(-?\d)(?!\d)', nom)
    if not m:
        return None
    l, alt, octave = m.group(1).upper(), m.group(2), int(m.group(3))
    return 12 * (octave + 1) + LETTRES[l] + (1 if alt in ('#', 's') else -1 if alt == 'b' else 0)


def hauteur(x: np.ndarray) -> float | None:
    """Fréquence fondamentale (Hz) par autocorrélation normalisée, sur plusieurs fenêtres."""
    n = int(0.08 * SR)
    mesures = []
    for debut in np.linspace(0.3 * len(x), 0.7 * len(x) - n, 7).astype(int):
        w = x[debut:debut + n]
        if len(w) < n or np.sqrt(np.mean(w * w)) < 1e-3:
            continue
        w = w - w.mean()
        f = np.fft.rfft(w, 2 * n)
        ac = np.fft.irfft(f * np.conj(f))[:n]
        ac /= ac[0] + 1e-12
        lo, hi = int(SR / 1100), int(SR / 55)
        seg = ac[lo:hi]
        # premier pic assez haut (évite les erreurs d'octave vers le grave)
        seuil = 0.85 * seg.max()
        k = next((i for i in range(1, len(seg) - 1) if seg[i] >= seuil and seg[i] >= seg[i - 1] and seg[i] >= seg[i + 1]), int(seg.argmax()))
        k += lo
        if 1 <= k < n - 1:
            a, b, c = ac[k - 1], ac[k], ac[k + 1]
            k = k + 0.5 * (a - c) / (a - 2 * b + c + 1e-12)
        mesures.append(SR / k)
    return float(np.median(mesures)) if mesures else None


def enveloppe(x: np.ndarray, pas: int = 441) -> np.ndarray:
    n = len(x) // pas
    return np.sqrt(np.mean(x[: n * pas].reshape(n, pas) ** 2, axis=1))


def lisser(v: np.ndarray, n: int) -> np.ndarray:
    return np.convolve(v, np.ones(n) / n, mode='same') if n > 1 else v


def attaque_nette(x: np.ndarray, garde: float = 0.06, plafond: float = 1.12) -> np.ndarray:
    """Raccourcit une attaque d'archet trop lente et adoucit une attaque trop « mordue ».

    Les enregistrements mettent jusqu'à 0,6 s à atteindre leur plein son : une note brève
    n'en jouait que le début, presque inaudible. On commence `garde` secondes avant que le son
    n'atteigne 80 % de la tenue (avec un fondu de 12 ms), puis on rabote les pointes au-dessus
    de `plafond` × la tenue, sans toucher à la tenue elle-même.
    """
    env = enveloppe(x)
    n = len(env)
    tenue = float(np.median(env[int(0.4 * n):int(0.9 * n)])) if n > 20 else float(env.max())
    if tenue <= 0:
        return x
    i80 = int(np.argmax(env >= 0.8 * tenue))
    debut = max(0, int((i80 * 0.01 - garde) * SR))
    y = x[debut:].copy()
    f = int(0.012 * SR)
    y[:f] *= np.linspace(0, 1, f)
    # limiteur doux sur l'enveloppe (fenêtre 20 ms, gain lissé sur 40 ms)
    e = np.sqrt(lisser(y * y, int(0.02 * SR)))
    g = np.minimum(1.0, plafond * tenue / np.maximum(e, 1e-9))
    g = lisser(g, int(0.04 * SR))
    return y * g


def preparer(x: np.ndarray, duree_max: float):
    env = enveloppe(x)
    pic = env.max()
    if pic <= 0:
        return None
    # début : premier dépassement de -40 dB sous le pic, avec 10 ms de marge
    i0 = max(0, int(np.argmax(env > pic * 0.01)) * 441 - 441)
    x = x[i0:]
    x = attaque_nette(x)
    env = enveloppe(x)
    # fin utile : dernier point au-dessus de -20 dB
    au_dessus = np.nonzero(env > pic * 0.1)[0]
    fin = min(len(x), (au_dessus[-1] + 1) * 441 if len(au_dessus) else len(x), int(duree_max * SR))
    x = x[:fin]
    if len(x) < int(0.6 * SR):
        return None
    # boucle dans la partie tenue : de 45 % à 92 % de la longueur, au moins 0,25 s
    L0, L1 = int(0.45 * len(x)), int(0.92 * len(x))
    f0 = hauteur(x) or 220.0
    periode = SR / f0
    # longueur de boucle = nombre entier de périodes, fin calée au mieux sur la forme d'onde
    nper = max(1, round((L1 - L0) / periode))
    L1 = L0 + int(round(nper * periode))
    meilleur, decal = -2.0, 0
    ref = x[L0:L0 + int(periode * 2)]
    for d in range(-int(periode), int(periode) + 1):
        seg = x[L1 + d:L1 + d + len(ref)]
        if len(seg) < len(ref):
            continue
        c = float(np.dot(ref, seg) / (np.linalg.norm(ref) * np.linalg.norm(seg) + 1e-12))
        if c > meilleur:
            meilleur, decal = c, d
    L1 = min(L1 + decal, len(x))
    # fondu enchaîné : la fin de la boucle glisse vers ce qui précède son début
    X = min(int(0.12 * SR), L0, (L1 - L0) // 2)
    w = 0.5 - 0.5 * np.cos(np.linspace(0, math.pi, X))
    y = x[:L1].copy()
    y[L1 - X:L1] = x[L1 - X:L1] * (1 - w) + x[L0 - X:L0] * w
    # petite montée de 3 ms contre le clic d'attaque
    a = int(0.003 * SR)
    y[:a] *= np.linspace(0, 1, a)
    tenue = y[int(0.3 * len(y)):L1]
    rms = float(np.sqrt(np.mean(tenue ** 2)))
    return y, L0 / SR, L1 / SR, rms, f0, meilleur


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('dossier')
    ap.add_argument('--sortie', default=str(Path(__file__).resolve().parent.parent / 'src' / 'sons' / 'violoncelle'))
    ap.add_argument('--max', type=float, default=3.2, help='durée maximale gardée (s)')
    ap.add_argument('--de', type=int, default=36, help='note la plus grave gardée (midi)')
    ap.add_argument('--a', type=int, default=88, help='note la plus aiguë gardée (midi)')
    o = ap.parse_args()
    sortie = Path(o.sortie)
    sortie.mkdir(parents=True, exist_ok=True)
    for ancien in sortie.glob('*.mp3'):
        ancien.unlink()
    fichiers = sorted(p for p in Path(o.dossier).rglob('*') if p.suffix.lower() in EXT)
    if not fichiers:
        sys.exit('Aucun fichier audio trouvé.')
    notes: dict[int, dict] = {}
    for p in fichiers:
        try:
            x = lire(p)
        except subprocess.CalledProcessError:
            print(f'illisible : {p.name}')
            continue
        r = preparer(x, o.max)
        if not r:
            print(f'trop court ou muet : {p.name}')
            continue
        y, b0, b1, rms, f0, qualite = r
        mesure = 69 + 12 * math.log2(f0 / 440)
        nom = midi_du_nom(p.stem)
        midi = round(mesure)
        accord = round((mesure - midi) * 100)
        if nom is not None and nom != midi:
            print(f'  {p.name} : nom {nom}, mesuré {mesure:.2f} -> on garde la mesure')
        if not (o.de <= midi <= o.a):
            continue
        cand = {'midi': midi, 'y': y, 'boucle': [round(b0, 4), round(b1, 4)], 'rms': rms, 'source': p.name, 'cents': accord, 'qualite': qualite}
        # deux fichiers pour la même note : on garde le mieux accordé
        if midi in notes and abs(notes[midi]['cents']) <= abs(accord):
            continue
        notes[midi] = cand
    if not notes:
        sys.exit('Aucune note utilisable.')
    index = []
    for midi in sorted(notes):
        n = notes[midi]
        gain = min(4.0, max(0.25, 0.12 / max(n['rms'], 1e-6)))
        fichier = f'{midi}.mp3'
        ecrire_mp3(n['y'], sortie / fichier)
        index.append({'midi': midi, 'fichier': fichier, 'boucle': n['boucle'], 'gain': round(gain, 3), 'source': n['source'], 'cents': n['cents']})
        print(f"{midi:3d}  {n['source']:<40} écart {n['cents']:+4d} c  boucle {n['boucle']}  corrélation {n['qualite']:.3f}")
    (sortie / 'index.json').write_text(json.dumps(index, indent=1, ensure_ascii=False), encoding='utf-8')
    manquantes = [m for m in range(o.de, max(notes) + 1) if m not in notes]
    print(f'{len(index)} notes gardées ; transposées par l\'appli : {len(manquantes)}')


if __name__ == '__main__':
    main()
