import React, { useEffect, useState } from "react"

export const STICKY_GAP = 16
const HEADER_FALLBACK = 53

/**
 * Верх липкой колонки. Низкая колонка прилипает под шапкой; выше экрана — уходит вверх настолько,
 * чтобы её низ оказался у нижнего края окна: дочитал до низа и остался, а вверх колонка отпускается
 * вместе со страницей.
 */
export function stickyTop(headerH: number, viewportH: number, panelH: number, gap = STICKY_GAP): number {
  return Math.min(headerH + gap, viewportH - panelH - gap)
}

function readHeaderHeight(): number {
  const h = document.querySelector("header")?.getBoundingClientRect().height
  return h ? Math.round(h) : HEADER_FALLBACK
}

/** Высота липкой шапки страницы: под ней прилипают колонки. */
export function useHeaderHeight(): number {
  const [h, setH] = useState(HEADER_FALLBACK)
  useEffect(() => {
    const measure = () => setH(readHeaderHeight())
    measure()
    window.addEventListener("resize", measure)
    return () => window.removeEventListener("resize", measure)
  }, [])
  return h
}

export function useStickyTop(ref: React.RefObject<HTMLElement | null>, enabled = true): number {
  const [top, setTop] = useState(HEADER_FALLBACK + STICKY_GAP)
  useEffect(() => {
    const el = ref.current
    if (!enabled || !el) return
    const measure = () => setTop(stickyTop(readHeaderHeight(), window.innerHeight, el.offsetHeight))
    measure()
    window.addEventListener("resize", measure)
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null
    ro?.observe(el)
    return () => { window.removeEventListener("resize", measure); ro?.disconnect() }
  }, [ref, enabled])
  return top
}
