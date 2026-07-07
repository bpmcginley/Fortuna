// Generates src-tauri/fortuna-icon.png (1024x1024) with no image dependencies:
// renders the Fortuna "◈" mark at 2x and box-downsamples for clean edges, then
// encodes a PNG via Node's built-in zlib. Run: `node scripts/make-icon.mjs`.
import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'src-tauri', 'fortuna-icon.png')
const SIZE = 1024
const SS = 2 // supersampling factor
const R = SIZE * SS

const lerp = (a, b, t) => a + (b - a) * t
const mix = (c1, c2, t) => [lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t)]
const over = (dst, src, a) => {
  // src over dst with src alpha a; dst is opaque-ish accumulator [r,g,b,a]
  const na = a + dst[3] * (1 - a)
  if (na <= 0) return [0, 0, 0, 0]
  for (let i = 0; i < 3; i++) dst[i] = (src[i] * a + dst[i] * dst[3] * (1 - a)) / na
  dst[3] = na
  return dst
}

// Rounded-rect signed test: true if (x,y) in [0,1]^2 lies inside a rounded rect.
function inRoundRect(x, y, pad, rad) {
  const lo = pad
  const hi = 1 - pad
  if (x < lo || x > hi || y < lo || y > hi) return false
  const rx = Math.min(rad, (hi - lo) / 2)
  const cxs = [lo + rx, hi - rx]
  const cys = [lo + rx, hi - rx]
  // corner regions
  const nx = x < cxs[0] ? cxs[0] : x > cxs[1] ? cxs[1] : x
  const ny = y < cys[0] ? cys[0] : y > cys[1] ? cys[1] : y
  const dx = x - nx
  const dy = y - ny
  return dx * dx + dy * dy <= rx * rx
}

const diamond = (x, y, cx, cy, hw, hh) => Math.abs(x - cx) / hw + Math.abs(y - cy) / hh

const BG_TL = [22, 35, 61]
const BG_BR = [10, 13, 20]
const FRAME_TOP = [143, 200, 255]
const FRAME_BOT = [47, 129, 247]
const CORE = [219, 238, 255]
const GLOW = [88, 166, 255]

function sample(x, y) {
  // x,y in [0,1]; returns [r,g,b,a] 0..255 / 0..1
  const px = [0, 0, 0, 0]
  if (!inRoundRect(x, y, 0.055, 0.21)) return px
  // background gradient
  const bg = mix(BG_TL, BG_BR, (x + y) / 2)
  px[0] = bg[0]; px[1] = bg[1]; px[2] = bg[2]; px[3] = 1

  const cx = 0.5, cy = 0.5
  const dOuter = diamond(x, y, cx, cy, 0.3, 0.38)
  const dInner = diamond(x, y, cx, cy, 0.3 * 0.6, 0.38 * 0.6)
  const dCore = diamond(x, y, cx, cy, 0.3 * 0.24, 0.38 * 0.24)

  // soft outer glow just outside the mark
  if (dOuter > 1 && dOuter < 1.55) {
    const g = Math.max(0, 1 - (dOuter - 1) / 0.55)
    over(px, GLOW, 0.28 * g * g)
  }
  // frame (ring): inside outer, outside inner
  if (dOuter <= 1 && dInner > 1) {
    const t = Math.min(1, Math.max(0, (y - (cy - 0.38)) / 0.76))
    over(px, mix(FRAME_TOP, FRAME_BOT, t), 1)
  }
  // bright core diamond
  if (dCore <= 1) over(px, CORE, 1)
  return px
}

// Render at 2x then box-downsample to SIZE.
const out = Buffer.alloc(SIZE * SIZE * 4)
for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    let r = 0, g = 0, b = 0, a = 0
    for (let sy = 0; sy < SS; sy++) {
      for (let sx = 0; sx < SS; sx++) {
        const fx = (x * SS + sx + 0.5) / R
        const fy = (y * SS + sy + 0.5) / R
        const p = sample(fx, fy)
        r += p[0] * p[3]; g += p[1] * p[3]; b += p[2] * p[3]; a += p[3]
      }
    }
    const n = SS * SS
    const idx = (y * SIZE + x) * 4
    const aa = a / n
    // un-premultiply for straight-alpha PNG
    out[idx] = aa > 0 ? Math.round(r / a) : 0
    out[idx + 1] = aa > 0 ? Math.round(g / a) : 0
    out[idx + 2] = aa > 0 ? Math.round(b / a) : 0
    out[idx + 3] = Math.round(aa * 255)
  }
}

// ---- minimal PNG encoder (RGBA, filter 0) ----
const crcTable = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()
function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const typeBuf = Buffer.from(type, 'ascii')
  const body = Buffer.concat([typeBuf, data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body), 0)
  return Buffer.concat([len, body, crc])
}
const ihdr = Buffer.alloc(13)
ihdr.writeUInt32BE(SIZE, 0)
ihdr.writeUInt32BE(SIZE, 4)
ihdr[8] = 8 // bit depth
ihdr[9] = 6 // color type RGBA
// filter each scanline with filter byte 0
const raw = Buffer.alloc(SIZE * (SIZE * 4 + 1))
for (let y = 0; y < SIZE; y++) {
  raw[y * (SIZE * 4 + 1)] = 0
  out.copy(raw, y * (SIZE * 4 + 1) + 1, y * SIZE * 4, (y + 1) * SIZE * 4)
}
const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
])
mkdirSync(dirname(OUT), { recursive: true })
writeFileSync(OUT, png)
console.log(`wrote ${OUT} (${(png.length / 1024).toFixed(1)} KB)`)
