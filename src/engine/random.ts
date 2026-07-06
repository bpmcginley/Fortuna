// Small, fast, seedable RNG so every Monte-Carlo run is reproducible from the
// scenario's `seed`. mulberry32 is a solid 32-bit generator; good enough for
// financial simulation and far cheaper than crypto RNG.

export type Rng = () => number // returns a float in [0, 1)

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Standard normal via Box-Muller. Draws two uniforms, returns one normal.
export function normal(rng: Rng): number {
  let u = 0
  let v = 0
  while (u === 0) u = rng()
  while (v === 0) v = rng()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

// Student-t draw with `df` degrees of freedom, scaled to UNIT variance so it is
// a drop-in fat-tailed replacement for a standard normal. t has variance
// df/(df-2), so dividing by sqrt(df/(df-2)) normalises it. Built from a normal
// over a chi-square/df, with chi-square approximated as a sum of squared normals
// for small integer-ish df and a gamma-style draw otherwise.
export function studentT(rng: Rng, df: number): number {
  const d = Math.max(2.1, df) // keep variance finite
  const z = normal(rng)
  const chi2 = chiSquare(rng, d)
  const t = z / Math.sqrt(chi2 / d)
  return t / Math.sqrt(d / (d - 2))
}

// Chi-square with `k` degrees of freedom via the Marsaglia-Tsang gamma method
// (chi-square(k) == Gamma(shape=k/2, scale=2)). Handles fractional df.
function chiSquare(rng: Rng, k: number): number {
  return gamma(rng, k / 2) * 2
}

function gamma(rng: Rng, shape: number): number {
  if (shape < 1) {
    // Boost: Gamma(a) = Gamma(a+1) * U^(1/a)
    const u = rng()
    return gamma(rng, shape + 1) * Math.pow(u, 1 / shape)
  }
  const d = shape - 1 / 3
  const c = 1 / Math.sqrt(9 * d)
  for (;;) {
    let x = 0
    let v = 0
    do {
      x = normal(rng)
      v = 1 + c * x
    } while (v <= 0)
    v = v * v * v
    const u = rng()
    if (u < 1 - 0.0331 * x * x * x * x) return d * v
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v
  }
}
