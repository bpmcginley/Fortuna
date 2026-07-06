import { useEffect, useRef, useState } from 'react'
import type { Scenario, SimResult } from '../engine/types'
import { money } from './format'

export interface Overlay {
  label: string
  color: string
  ages: number[]
  p50: number[]
}

interface Props {
  result: SimResult
  scenario: Scenario
  nominal: boolean
  overlays?: Overlay[]
}

// Canvas fan-chart: 5-95 and 25-75 percentile bands with a median line, a
// retirement marker, and hover read-outs. Redraws on data / size / hover change.
export function FanChart({ result, scenario, nominal, overlays = [] }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [w, setW] = useState(760)
  const [hoverX, setHoverX] = useState<number | null>(null)
  const h = 340

  // Track container width for responsiveness.
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      const cw = entries[0].contentRect.width
      if (cw > 0) setW(Math.floor(cw))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    const cv = canvasRef.current
    if (!cv) return
    const dpr = Math.min(2, (globalThis as { devicePixelRatio?: number }).devicePixelRatio ?? 1)
    cv.width = w * dpr
    cv.height = h * dpr
    const g = cv.getContext('2d')!
    g.setTransform(dpr, 0, 0, dpr, 0, 0)
    draw(g, w, h, result, scenario, nominal, overlays, hoverX)
  }, [w, result, scenario, nominal, overlays, hoverX])

  const infl = (k: number) => (nominal ? Math.pow(1 + scenario.inflation, k) : 1)
  const b = result.bands
  const L = 62
  const R = w - 14
  const idxAt = (clientX: number): number => {
    const cv = canvasRef.current!
    const rect = cv.getBoundingClientRect()
    const x = clientX - rect.left
    const t = (x - L) / (R - L)
    return Math.round(Math.min(1, Math.max(0, t)) * (b.ages.length - 1))
  }

  const hi = hoverX
  return (
    <div ref={wrapRef} className="chart-wrap">
      <canvas
        ref={canvasRef}
        style={{ width: w, height: h }}
        onMouseMove={(e) => setHoverX(idxAt(e.clientX))}
        onMouseLeave={() => setHoverX(null)}
      />
      {hi !== null && b.ages[hi] !== undefined && (
        <div className="chart-tip">
          <b>age {b.ages[hi]}</b>
          <span className="tip-row"><span className="dot p95" />p95 {money(b.p95[hi] * infl(hi), true)}</span>
          <span className="tip-row"><span className="dot p50" />median {money(b.p50[hi] * infl(hi), true)}</span>
          <span className="tip-row"><span className="dot p5" />p5 {money(b.p5[hi] * infl(hi), true)}</span>
        </div>
      )}
    </div>
  )
}

function draw(
  g: CanvasRenderingContext2D,
  w: number,
  h: number,
  result: SimResult,
  s: Scenario,
  nominal: boolean,
  overlays: Overlay[],
  hoverX: number | null,
) {
  g.clearRect(0, 0, w, h)
  const b = result.bands
  const n = b.ages.length
  const infl = (k: number) => (nominal ? Math.pow(1 + s.inflation, k) : 1)

  const L = 62
  const R = w - 14
  const T = 12
  const B = h - 26

  let lo = 0
  let hi = -Infinity
  for (let k = 0; k < n; k++) {
    const v = b.p95[k] * infl(k)
    if (v > hi) hi = v
  }
  for (const o of overlays) for (let k = 0; k < o.p50.length; k++) if (o.p50[k] * infl(k) > hi) hi = o.p50[k] * infl(k)
  hi *= 1.06
  if (hi <= lo) hi = lo + 1

  const X = (k: number) => L + ((R - L) * k) / Math.max(1, n - 1)
  const Y = (v: number) => T + (B - T) * (1 - (v - lo) / (hi - lo))

  // gridlines + $ labels
  g.font = '10px Segoe UI, system-ui, sans-serif'
  g.textBaseline = 'middle'
  g.strokeStyle = '#21262d'
  g.fillStyle = '#8b949e'
  g.lineWidth = 1
  for (let i = 0; i <= 4; i++) {
    const v = lo + ((hi - lo) * i) / 4
    const y = Y(v)
    g.beginPath()
    g.moveTo(L, y)
    g.lineTo(R, y)
    g.stroke()
    g.textAlign = 'right'
    g.fillText(money(v, true), L - 6, y)
  }

  // x-axis age labels
  g.textAlign = 'center'
  const ticks = Math.min(8, n)
  for (let i = 0; i < ticks; i++) {
    const k = Math.round((i * (n - 1)) / Math.max(1, ticks - 1))
    g.fillText(String(b.ages[k]), X(k), h - 8)
  }

  // retirement marker
  const rk = s.retirementAge - s.currentAge
  if (rk > 0 && rk < n) {
    g.strokeStyle = '#d29922'
    g.setLineDash([4, 4])
    g.beginPath()
    g.moveTo(X(rk), T)
    g.lineTo(X(rk), B)
    g.stroke()
    g.setLineDash([])
    g.fillStyle = '#d29922'
    g.textAlign = 'left'
    g.fillText('retire', X(rk) + 4, T + 6)
  }

  // bands
  const fill = (upper: number[], lower: number[], color: string, alpha: number) => {
    g.beginPath()
    g.moveTo(X(0), Y(upper[0] * infl(0)))
    for (let k = 1; k < n; k++) g.lineTo(X(k), Y(upper[k] * infl(k)))
    for (let k = n - 1; k >= 0; k--) g.lineTo(X(k), Y(lower[k] * infl(k)))
    g.closePath()
    g.globalAlpha = alpha
    g.fillStyle = color
    g.fill()
    g.globalAlpha = 1
  }
  fill(b.p95, b.p5, '#58a6ff', 0.12)
  fill(b.p75, b.p25, '#58a6ff', 0.2)

  // median line
  g.strokeStyle = '#58a6ff'
  g.lineWidth = 2
  g.beginPath()
  for (let k = 0; k < n; k++) {
    const p = [X(k), Y(b.p50[k] * infl(k))] as const
    k ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])
  }
  g.stroke()

  // overlays (comparison medians) — mapped by actual age onto the main axis so
  // a scenario that starts at a different age still lines up correctly.
  const age0 = b.ages[0]
  g.lineWidth = 1.5
  for (const o of overlays) {
    g.strokeStyle = o.color
    g.setLineDash([5, 3])
    g.beginPath()
    let started = false
    for (let j = 0; j < o.p50.length; j++) {
      const km = o.ages[j] - age0
      if (km < 0 || km > n - 1) continue
      const px = X(km)
      const py = Y(o.p50[j] * infl(km))
      started ? g.lineTo(px, py) : g.moveTo(px, py)
      started = true
    }
    g.stroke()
  }
  g.setLineDash([])
  g.lineWidth = 1

  // hover crosshair
  if (hoverX !== null && hoverX >= 0 && hoverX < n) {
    const x = X(hoverX)
    g.strokeStyle = '#30363d'
    g.beginPath()
    g.moveTo(x, T)
    g.lineTo(x, B)
    g.stroke()
    for (const [arr, r] of [
      [b.p95, 2.5],
      [b.p50, 3.5],
      [b.p5, 2.5],
    ] as const) {
      g.fillStyle = '#58a6ff'
      g.beginPath()
      g.arc(x, Y(arr[hoverX] * infl(hoverX)), r, 0, Math.PI * 2)
      g.fill()
    }
  }
}
