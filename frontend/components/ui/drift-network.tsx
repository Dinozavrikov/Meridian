"use client"
import { useEffect, useRef } from "react"

// ── Дрейфующая сеть узлов на фоне ───────────────────────────────────────
// Тот же визуальный язык, что и LocalGraphPanel в приложении, но приглушенный
// и медленный: фон, а не фокус внимания.
// При настройке системы "уменьшить движение" рисуется один неподвижный кадр,
// смена настройки на открытой странице подхватывается сразу.
// Скорость задана на кадр при 60 Гц и пересчитывается по настоящему времени кадра,
// иначе на экранах 120 и 144 Гц сеть плыла бы в два с лишним раза быстрее.
const FRAME_MS = 1000 / 60
// После паузы (вкладка была скрыта) сеть не должна делать скачок.
const MAX_STEP_MS = 50

export function DriftNetwork() {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    const reduce = typeof window.matchMedia === "function"
      ? window.matchMedia("(prefers-reduced-motion: reduce)")
      : null
    const reduced = () => reduce?.matches === true
    let raf = 0
    let last = 0
    let w = 0, h = 0
    const N = 26
    const pts = Array.from({ length: N }, () => ({
      x: Math.random(), y: Math.random(),
      vx: (Math.random() - 0.5) * 0.00018,
      vy: (Math.random() - 0.5) * 0.00018,
    }))
    const resize = () => {
      w = canvas.clientWidth; h = canvas.clientHeight
      canvas.width = w * devicePixelRatio; canvas.height = h * devicePixelRatio
      ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0)
    }
    const paint = () => {
      ctx.clearRect(0, 0, w, h)
      for (let i = 0; i < N; i++) {
        for (let j = i + 1; j < N; j++) {
          const a = pts[i], b = pts[j]
          const dx = (a.x - b.x) * w, dy = (a.y - b.y) * h
          const d = Math.sqrt(dx * dx + dy * dy)
          if (d < 150) {
            ctx.strokeStyle = `rgba(77,207,166,${0.09 * (1 - d / 150)})`
            ctx.lineWidth = 1
            ctx.beginPath()
            ctx.moveTo(a.x * w, a.y * h)
            ctx.lineTo(b.x * w, b.y * h)
            ctx.stroke()
          }
        }
      }
      for (const p of pts) {
        ctx.fillStyle = "rgba(139,128,240,0.35)"
        ctx.beginPath()
        ctx.arc(p.x * w, p.y * h, 1.6, 0, Math.PI * 2)
        ctx.fill()
      }
    }
    const step = (k: number) => {
      for (const p of pts) {
        p.x += p.vx * k; p.y += p.vy * k
        if (p.x < 0 || p.x > 1) p.vx *= -1
        if (p.y < 0 || p.y > 1) p.vy *= -1
      }
    }
    const tick = (now: number) => {
      const dt = last ? Math.min(now - last, MAX_STEP_MS) : FRAME_MS
      last = now
      step(dt / FRAME_MS)
      paint()
      raf = requestAnimationFrame(tick)
    }
    const stop = () => {
      if (raf) cancelAnimationFrame(raf)
      raf = 0
    }
    const sync = () => {
      stop()
      if (reduced()) { paint(); return }
      last = 0
      raf = requestAnimationFrame(tick)
    }
    const onResize = () => {
      resize()
      if (reduced()) paint()
    }
    resize()
    window.addEventListener("resize", onResize)
    reduce?.addEventListener("change", sync)
    sync()
    return () => { stop(); window.removeEventListener("resize", onResize); reduce?.removeEventListener("change", sync) }
  }, [])
  return <canvas ref={ref} style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} />
}
