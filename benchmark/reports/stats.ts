// Statistik-Helfer: Perzentile, Bootstrap-Konfidenzintervalle (gepaart), Streuung.

export const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
export const median = (xs: number[]) => percentile(xs, 50);
export const percentile = (xs: number[], p: number): number => {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const idx = (p / 100) * (s.length - 1);
  const lo = Math.floor(idx), hi = Math.ceil(idx);
  return s[lo] + (s[hi] - s[lo]) * (idx - lo);
};
export const stddev = (xs: number[]) => {
  if (xs.length < 2) return NaN;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1));
};

/** Deterministischer Zufall, damit Konfidenzintervalle reproduzierbar sind. */
const rng = (seed: number) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);

/** 95%-Bootstrap-KI des Mittelwerts (Perzentil-Methode). */
export const bootstrapCI = (xs: number[], iterations = 5000, seed = 7): [number, number] => {
  if (xs.length < 2) return [NaN, NaN];
  const r = rng(seed);
  const means: number[] = [];
  for (let i = 0; i < iterations; i++) {
    let s = 0;
    for (let k = 0; k < xs.length; k++) s += xs[Math.floor(r() * xs.length)];
    means.push(s / xs.length);
  }
  return [percentile(means, 2.5), percentile(means, 97.5)];
};

/** Gepaarter Vergleich: Differenzen je Testfall (a − b), Mittel und Bootstrap-KI. */
export const pairedDiff = (a: Map<string, number>, b: Map<string, number>) => {
  const keys = [...a.keys()].filter(k => b.has(k));
  const diffs = keys.map(k => a.get(k)! - b.get(k)!);
  const [lo, hi] = bootstrapCI(diffs);
  return { n: keys.length, meanDiff: mean(diffs), ci: [lo, hi] as [number, number], diffs, significant: Number.isFinite(lo) && (lo > 0 || hi < 0) };
};

export const fmt = (x: number, d = 1) => (Number.isFinite(x) ? x.toFixed(d).replace('.', ',') : '–');
export const pct = (x: number, d = 1) => (Number.isFinite(x) ? `${(x * 100).toFixed(d).replace('.', ',')} %` : '–');
export const ct = (usd: number, d = 3) => (Number.isFinite(usd) ? `${(usd * 100).toFixed(d).replace('.', ',')} ct` : '–');
export const usd = (x: number) => (Number.isFinite(x) ? `${x.toFixed(x < 1 ? 4 : 2).replace('.', ',')} $` : '–');
export const sec = (ms: number) => (Number.isFinite(ms) ? `${(ms / 1000).toFixed(1).replace('.', ',')} s` : '–');
