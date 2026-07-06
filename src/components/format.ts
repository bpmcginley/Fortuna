// Display helpers shared across the UI.

export function money(v: number, compact = false): string {
  const neg = v < 0
  const a = Math.abs(v)
  let s: string
  if (compact) {
    if (a >= 1e9) s = `$${(a / 1e9).toFixed(a >= 1e10 ? 0 : 1)}B`
    else if (a >= 1e6) s = `$${(a / 1e6).toFixed(a >= 1e7 ? 0 : 1)}M`
    else if (a >= 1e3) s = `$${(a / 1e3).toFixed(a >= 1e4 ? 0 : 1)}k`
    else s = `$${a.toFixed(0)}`
  } else {
    s = `$${a.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
  }
  return neg ? `-${s}` : s
}

export function pct(v: number, digits = 1): string {
  return `${(v * 100).toFixed(digits)}%`
}

export function signedPct(v: number, digits = 1): string {
  return `${v >= 0 ? '+' : ''}${(v * 100).toFixed(digits)}%`
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v))
}
