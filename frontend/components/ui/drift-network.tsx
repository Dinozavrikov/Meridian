"use client"
import { useEffect, useRef } from "react"

// ── Дрейфующая сеть узлов на фоне ───────────────────────────────────────
// Тот же визуальный язык, что и LocalGraphPanel в приложении, но приглушённый
// и медленный — фон, а не фокус внимания.
export function DriftNetwork() {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    let raf: number
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
    resize()
    window.addEventListener("resize", resize)
    const tick = () => {
      ctx.clearRect(0, 0, w, h)
      for (const p of pts) {
        p.x += p.vx; p.y += p.vy
        if (p.x < 0 || p.x > 1) p.vx *= -1
        if (p.y < 0 || p.y > 1) p.vy *= -1
      }
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
      raf = requestAnimationFrame(tick)
    }
    tick()
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", resize) }
  }, [])
  return <canvas ref={ref} style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} />
}
