/**
 * The line field: parallel mint rails, flat at the entry, rising into a topographic relief (the launch
 * burst absorbed on Elysium), then level again before they leave the frame (the HyperCore book).
 * Hidden-line rendering: each rail masks the rails behind it, so lines never cross or merge.
 * Pure canvas, drawn into its own bounded zone. No DOM is touched per frame.
 */

type Bump = { x: number; l: number; wx: number; wl: number; a: number; vx: number; ph: number }

export type FieldOptions = {
  /** rail pitch in px (8–11) */
  pitch?: number
  /** fraction of the zone height above the first rail, left empty for the relief to rise into */
  headroom?: number
  /** slow drift of the relief; off under prefers-reduced-motion */
  animate?: boolean
  /** relief height and ridge width multipliers (phones: lower, wider ridges) */
  amp?: number
  spread?: number
}

const MINT = '#B4E6D2'
const BG = '#141B14'
const ENTRY = 0.12 // first 12 % of the width: perfectly level
const EXIT = 0.75 // last 25 %: perfectly level

export function mountField(canvas: HTMLCanvasElement, opts: FieldOptions = {}): () => void {
  const ctx = canvas.getContext('2d')!
  const o = { pitch: 9, headroom: 0.3, animate: true, amp: 1, spread: 1, ...opts }
  let w = 0, h = 0, dpr = 1
  let running = true, visible = true, raf = 0
  let t = 0, last = performance.now()
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
  const animate = o.animate && !reduce

  // seeded so the relief is the same on every load
  let s = 11
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647)
  const bumps: Bump[] = Array.from({ length: 12 }, () => ({
    x: 0.2 + rnd() * 0.45,
    l: 0.08 + rnd() * 0.8,
    wx: (0.035 + rnd() * 0.06) * (opts.spread ?? 1),
    wl: 0.07 + rnd() * 0.16,
    a: 0.35 + rnd() * 0.9,
    vx: (rnd() - 0.5) * 0.004,
    ph: rnd() * Math.PI * 2,
  }))

  /** zero value and zero slope at both ends of the relief window */
  function envelope(xf: number): number {
    if (xf <= ENTRY || xf >= EXIT) return 0
    const k = (xf - ENTRY) / (EXIT - ENTRY)
    const e = Math.sin(Math.PI * k)
    return e * e
  }

  function height(xf: number, lf: number): number {
    let v = 0
    for (const b of bumps) {
      const bx = b.x + Math.sin(t * 0.05 + b.ph) * 0.02 + b.vx * Math.sin(t * 0.03)
      const dx = (xf - bx) / b.wx
      const dl = (lf - b.l) / b.wl
      v += b.a * Math.exp(-(dx * dx) - dl * dl) * (0.85 + 0.15 * Math.sin(t * 0.25 + b.ph))
    }
    return v
  }

  function resize() {
    const r = canvas.getBoundingClientRect()
    w = Math.max(1, Math.round(r.width))
    h = Math.max(1, Math.round(r.height))
    dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = Math.round(w * dpr)
    canvas.height = Math.round(h * dpr)
    draw()
  }

  function draw() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.fillStyle = BG
    ctx.fillRect(0, 0, w, h)
    const pitch = w < 600 ? Math.max(o.pitch, 10) : o.pitch
    const y0 = Math.round(h * o.headroom)
    const n = Math.max(8, Math.floor((h - y0 - 2) / pitch) + 1)
    const amp = Math.min(y0 - 8, pitch * 11) * o.amp // the relief never leaves the zone
    const step = Math.max(3, Math.round(w / 320))
    ctx.lineWidth = w < 600 ? 1 : 1.6
    ctx.lineJoin = 'round'
    ctx.strokeStyle = MINT
    const pts: number[] = []
    for (let i = 0; i < n; i++) {
      const lf = i / (n - 1)
      const base = y0 + i * pitch
      pts.length = 0
      for (let x = 0; x <= w + step; x += step) {
        const xf = x / w
        const env = envelope(xf)
        pts.push(x, env ? base - env * height(xf, lf) * amp : base)
      }
      // mask the rails behind (above) this one, down to its own baseline only: cheap fills
      ctx.beginPath()
      ctx.moveTo(pts[0], pts[1])
      for (let k = 2; k < pts.length; k += 2) ctx.lineTo(pts[k], pts[k + 1])
      ctx.lineTo(w + step, base + 1)
      ctx.lineTo(0, base + 1)
      ctx.closePath()
      ctx.fillStyle = BG
      ctx.fill()
      ctx.beginPath()
      ctx.moveTo(pts[0], pts[1])
      for (let k = 2; k < pts.length; k += 2) ctx.lineTo(pts[k], pts[k + 1])
      ctx.stroke()
    }
  }

  function frame(now: number) {
    raf = 0
    if (!running) return
    // real time, only big gaps capped (background tab), so slow devices still move at real speed
    t += Math.min(0.25, (now - last) / 1000)
    last = now
    draw()
    if (visible) raf = requestAnimationFrame(frame)
  }

  const ro = new ResizeObserver(resize)
  ro.observe(canvas)
  const io = new IntersectionObserver(([e]) => {
    visible = e.isIntersecting
    if (animate && visible && !raf) { last = performance.now(); raf = requestAnimationFrame(frame) }
  })
  io.observe(canvas)
  t = 3
  resize()
  if (animate) raf = requestAnimationFrame(frame)

  return () => { running = false; if (raf) cancelAnimationFrame(raf); ro.disconnect(); io.disconnect() }
}
