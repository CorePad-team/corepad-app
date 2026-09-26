/**
 * The line field: parallel mint levels that ripple (launch chaos, absorbed on Elysium)
 * and flatten into straight, evenly spaced levels (the HyperCore book).
 * Pure canvas. No DOM is touched per frame.
 */

type Bump = { x: number; l: number; wx: number; wl: number; a: number; vx: number; ph: number }

export type FieldOptions = {
  lines?: number
  /** fraction of width where the ripple is at full strength */
  calmFrom?: number
  /** fraction of width where the lines are fully flat */
  flatAt?: number
  /** vertical band (fractions of height) occupied by the lines */
  top?: number
  bottom?: number
  levels?: boolean
  dot?: boolean
  /** optional live top edge in px (e.g. below overlaid copy); overrides `top` */
  topPx?: () => number
}

const MINT = '#B4E6D2'
const CORAL = '#E0574F'
const BG = '#141B14'

export function mountField(canvas: HTMLCanvasElement, opts: FieldOptions = {}): () => void {
  const ctx = canvas.getContext('2d')!
  const o = { lines: 44, calmFrom: 0.42, flatAt: 0.78, top: 0.2, bottom: 0.9, levels: true, dot: true, ...opts }
  let w = 0, h = 0, dpr = 1
  let running = true, visible = true, raf = 0
  let t = 0, last = performance.now(), drawMs = 0
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches

  // Deterministic seed so the field looks the same on every load.
  let s = 7
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647)
  const bumps: Bump[] = Array.from({ length: 14 }, () => ({
    x: rnd() * 0.75,
    l: 0.1 + rnd() * 0.85,
    wx: 0.035 + rnd() * 0.07,
    wl: 0.06 + rnd() * 0.16,
    a: 0.35 + rnd() * 1.1,
    vx: 0.004 + rnd() * 0.01,
    ph: rnd() * Math.PI * 2,
  }))

  function resize() {
    const r = canvas.getBoundingClientRect()
    w = Math.max(1, Math.round(r.width))
    dpr = Math.min(window.devicePixelRatio || 1, w > 1200 ? 1.5 : 2)
    w = Math.max(1, Math.round(r.width))
    h = Math.max(1, Math.round(r.height))
    canvas.width = Math.round(w * dpr)
    canvas.height = Math.round(h * dpr)
    draw()
  }

  const smooth = (e0: number, e1: number, x: number) => {
    const k = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)))
    return k * k * (3 - 2 * k)
  }

  function height(xf: number, lf: number): number {
    let v = 0
    for (const b of bumps) {
      // bumps drift rightward and wrap, like pressure moving through the chamber
      const bx = (b.x + t * b.vx) % 0.8
      const fade = Math.sin((Math.PI * bx) / 0.8)
      const dx = (xf - bx) / b.wx
      const dl = (lf - b.l) / b.wl
      v += fade * b.a * Math.exp(-(dx * dx) - dl * dl) * (0.75 + 0.25 * Math.sin(t * 0.6 + b.ph))
    }
    v += 0.12 * Math.sin(xf * 23 + lf * 9 + t * 0.9) * Math.sin(xf * 7 - t * 0.4)
    return v
  }

  function draw() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.fillStyle = BG
    ctx.fillRect(0, 0, w, h)
    const n = o.lines
    const y0 = o.topPx ? Math.min(h * 0.8, Math.max(h * 0.1, o.topPx())) : h * o.top, y1 = h * o.bottom
    const gap = (y1 - y0) / (n - 1)
    const amp = Math.min(h * 0.3, gap * 15)
    const step = Math.max(4, Math.round(w / 260))
    const lw = w < 600 ? 1 : 1.25
    ctx.lineWidth = lw
    ctx.lineJoin = 'round'
    ctx.strokeStyle = MINT
    const pts: number[] = []
    let dotX = 0, dotY = 0
    const dotLine = Math.round(n * 0.34)
    const dotXf = ((t * 0.035) % 1.1)
    for (let i = 0; i < n; i++) {
      const lf = i / (n - 1)
      const base = y0 + i * gap
      // the first levels rise less, so the relief never climbs into the copy above
      const lineEnv = 0.2 + 0.8 * smooth(0, 0.35, lf)
      pts.length = 0
      for (let x = 0; x <= w + step; x += step) {
        const xf = x / w
        const env = 1 - smooth(o.calmFrom, o.flatAt, xf)
        const lift = env * lineEnv * height(xf, lf) * amp
        pts.push(x, base - lift)
      }
      // occlude the lines behind (above) with the background, then stroke
      ctx.beginPath()
      ctx.moveTo(pts[0], pts[1])
      for (let k = 2; k < pts.length; k += 2) ctx.lineTo(pts[k], pts[k + 1])
      // lines behind only ever sit above this baseline, so filling down to it is enough (cheap fills)
      const floor = Math.min(h, base + amp * 0.15 + 2)
      ctx.lineTo(w + step, floor)
      ctx.lineTo(0, floor)
      ctx.closePath()
      ctx.fillStyle = BG
      ctx.fill()
      ctx.beginPath()
      ctx.moveTo(pts[0], pts[1])
      for (let k = 2; k < pts.length; k += 2) ctx.lineTo(pts[k], pts[k + 1])
      ctx.stroke()
      if (i === dotLine) {
        const xf = Math.min(1, dotXf)
        const env = 1 - smooth(o.calmFrom, o.flatAt, xf)
        dotX = xf * w
        dotY = base - env * lineEnv * height(xf, lf) * amp
      }
    }
    if (o.levels && w > 520) {
      ctx.font = '10px "Geist Mono", ui-monospace, monospace'
      ctx.fillStyle = MINT
      ctx.globalAlpha = 0.55
      ctx.textAlign = 'right'
      for (let i = 0; i < n; i += 4) {
        const base = y0 + i * gap
        const label = 'L' + String(Math.abs(i - Math.round(n / 2))).padStart(2, '0')
        ctx.fillStyle = BG
        ctx.fillRect(w - 44, base - 7, 40, 13)
        ctx.fillStyle = MINT
        ctx.fillText(label, w - 8, base + 3.5)
      }
      ctx.globalAlpha = 1
    }
    if (o.dot && dotXf <= 1) {
      ctx.fillStyle = CORAL
      ctx.beginPath()
      ctx.arc(dotX, dotY - 9, w < 600 ? 2.5 : 3, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  function frame(now: number) {
    raf = 0
    if (!running) return
    // time-driven; cap only large jumps (tab in background) so slow devices still move in real time
    const dt = Math.min(0.25, (now - last) / 1000)
    last = now
    t += dt
    const a = performance.now()
    draw()
    drawMs = performance.now() - a
    if (visible && !reduce) raf = requestAnimationFrame(frame)
  }

  const ro = new ResizeObserver(resize)
  ro.observe(canvas)
  const io = new IntersectionObserver(([e]) => {
    visible = e.isIntersecting
    if (visible && !raf && !reduce) { last = performance.now(); raf = requestAnimationFrame(frame) }
  })
  io.observe(canvas)
  t = 14 // start mid-motion so the first frame already has relief
  resize()
  if (!reduce) raf = requestAnimationFrame(frame)
  ;(window as unknown as { __field?: () => number[] }).__field = () => [t, drawMs]

  return () => { running = false; if (raf) cancelAnimationFrame(raf); ro.disconnect(); io.disconnect() }
}
