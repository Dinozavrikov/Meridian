"use client"
// Общее поведение шкал-«линеек» (ScaleControl и Ruler): перетаскивание указателем
// (мышь/палец/перо), клавиатура и «оптимистичное» значение. Рисуют компоненты сами.
import { useCallback, useEffect, useRef, useState } from "react"
import type { ScaleLevel } from "@/lib/scales"

export function levelFor(levels: ScaleLevel[] | undefined, v: number): ScaleLevel | undefined {
  if (!levels || levels.length === 0) return undefined
  const exact = levels.find(l => l.value === v)
  if (exact) return exact
  return levels.filter(l => l.value <= v).sort((a, b) => b.value - a.value)[0]
}

export function roundToStep(raw: number, min: number, max: number, step: number) {
  const snapped = Math.round((raw - min) / step) * step + min
  return Math.min(max, Math.max(min, snapped))
}

/** Сколько ждём подтверждения сохранения. Если за это время значение из пропсов не изменилось
 *  (сохранение не удалось), снова показываем то, что реально лежит на сервере. */
export const OPTIMISTIC_TTL_MS = 5000

interface Options {
  value: number | null | undefined
  min: number
  max: number
  step: number
  onChange?: (v: number) => void
  /** Полоса из равных делений (шагов ≤ 10): значение — номер деления под указателем, а не ближайшее число. */
  segmented?: boolean
}

export function useScaleTrack({ value, min, max, step, onChange, segmented = false }: Options) {
  const [liveDrag, setLiveDrag] = useState<number | null>(null)
  const [optimistic, setOptimistic] = useState<number | null>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)
  const valueAtCommit = useRef<number | null | undefined>(undefined)
  const interactive = !!onChange

  // Оптимистичное значение живёт, пока значение из пропсов не изменится
  // (сервер подтвердил ИЛИ ответил иначе — например, откат в «не оценено»).
  useEffect(() => {
    if (optimistic != null && value !== valueAtCommit.current) setOptimistic(null)
  }, [value, optimistic])
  // Если значение из пропсов так и не изменилось (сохранение не прошло) — снимаем по таймауту.
  useEffect(() => {
    if (optimistic == null) return
    const id = setTimeout(() => setOptimistic(null), OPTIMISTIC_TTL_MS)
    return () => clearTimeout(id)
  }, [optimistic])

  const effectiveValue = optimistic ?? (value ?? null)
  const isSet = effectiveValue != null

  const commit = useCallback((v: number) => {
    valueAtCommit.current = value
    setOptimistic(v)
    onChange?.(v)
  }, [onChange, value])

  const valueFromClientX = useCallback((clientX: number) => {
    const el = trackRef.current
    if (!el) return null
    const rect = el.getBoundingClientRect()
    if (rect.width <= 0) return null
    const pct = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
    if (segmented) {
      // Делений на одно больше, чем шагов, каждое занимает свою долю ширины.
      const count = Math.max(1, Math.round((max - min) / step))
      const idx = Math.min(count, Math.floor(pct * (count + 1)))
      return roundToStep(min + idx * step, min, max, step)
    }
    return roundToStep(min + pct * (max - min), min, max, step)
  }, [min, max, step, segmented])

  // Pointer events работают одинаково для мыши, пальца и пера; setPointerCapture держит поток
  // событий на полосе, даже если палец ушёл за её границы, поэтому глобальные слушатели не нужны.
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!interactive) return
    try { e.currentTarget.setPointerCapture?.(e.pointerId) } catch { /* не критично */ }
    dragging.current = true
    const v = valueFromClientX(e.clientX)
    if (v != null) setLiveDrag(v)
  }
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return
    const v = valueFromClientX(e.clientX)
    if (v != null) setLiveDrag(v)
  }
  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return
    dragging.current = false
    const v = valueFromClientX(e.clientX)
    setLiveDrag(null)
    if (v != null) commit(v)
  }
  const onPointerCancel = () => {
    dragging.current = false
    setLiveDrag(null)
  }
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!interactive) return
    const base = isSet ? (effectiveValue as number) : min
    let next: number | null = null
    switch (e.key) {
      case "ArrowRight": case "ArrowUp":   next = base + step; break
      case "ArrowLeft":  case "ArrowDown": next = base - step; break
      case "PageUp":   next = base + step * 4; break
      case "PageDown": next = base - step * 4; break
      case "Home": next = min; break
      case "End":  next = max; break
    }
    if (next == null) return
    e.preventDefault()
    const clamped = roundToStep(next, min, max, step)
    if (!isSet || clamped !== base) commit(clamped)
  }

  return {
    trackRef, liveDrag, effectiveValue, isSet, interactive, commit,
    trackProps: {
      onPointerDown, onPointerMove, onPointerUp, onPointerCancel, onKeyDown,
      tabIndex: interactive ? 0 : undefined,
      "aria-readonly": interactive ? undefined : (true as const),
    },
    // Без touch-action:none браузер забирает горизонтальный жест как скролл и шлёт pointercancel.
    touchAction: interactive ? ("none" as const) : undefined,
  }
}
