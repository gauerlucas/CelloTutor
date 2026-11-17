// Détection de hauteur (méthode NSDF de McLeod), reprise de l'ébauche « Atelier »
// où elle a été éprouvée sur le violoncelle. Pure : testable sans micro.

export interface Mesure {
  freq: number;
  clarte: number;
  rms: number;
}

export function decimer(x: Float32Array, sr: number, cible = 16000): { y: Float32Array; sr: number } {
  const f = Math.max(1, Math.round(sr / cible));
  if (f === 1) return { y: x, sr };
  const n = Math.floor(x.length / f), y = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let k = 0; k < f; k++) s += x[i * f + k]!;
    y[i] = s / f;
  }
  return { y, sr: sr / f };
}

export function detecterHauteur(x: Float32Array, sr: number, fmin = 55, fmax = 1150, rmsMin = 0.006): Mesure | null {
  const N = x.length;
  let rms = 0;
  for (let i = 0; i < N; i++) rms += x[i]! * x[i]!;
  rms = Math.sqrt(rms / N);
  if (rms < rmsMin) return null;
  const tauMin = Math.floor(sr / fmax), tauMax = Math.min(N - 2, Math.ceil(sr / fmin));
  const nsdf = new Float32Array(tauMax + 2);
  for (let tau = tauMin; tau <= tauMax; tau++) {
    let acf = 0, m = 0;
    for (let i = 0, L = N - tau; i < L; i++) {
      const a = x[i]!, b = x[i + tau]!;
      acf += a * b;
      m += a * a + b * b;
    }
    nsdf[tau] = m > 0 ? (2 * acf) / m : 0;
  }
  const pics: [number, number][] = [];
  let tau = tauMin;
  while (tau <= tauMax && nsdf[tau]! > 0) tau++;
  while (tau <= tauMax) {
    while (tau <= tauMax && nsdf[tau]! <= 0) tau++;
    let best = -1, bt = -1;
    while (tau <= tauMax && nsdf[tau]! > 0) {
      if (nsdf[tau]! > best) {
        best = nsdf[tau]!;
        bt = tau;
      }
      tau++;
    }
    if (bt > 0) pics.push([bt, best]);
  }
  if (!pics.length) return null;
  const maxv = Math.max(...pics.map((p) => p[1]));
  const pk = pics.find((p) => p[1] >= 0.9 * maxv)!;
  let t = pk[0];
  if (t > tauMin && t < tauMax) {
    const a = nsdf[t - 1]!, b = nsdf[t]!, c = nsdf[t + 1]!, den = a - 2 * b + c;
    if (den !== 0) t = t + (0.5 * (a - c)) / den;
  }
  return { freq: sr / t, clarte: pk[1], rms };
}
