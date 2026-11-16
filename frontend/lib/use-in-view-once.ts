"use client"
// «Элемент дошёл до экрана»: срабатывает один раз и дальше остаётся true. Нужен, чтобы тяжёлое (граф)
// не рисовалось, пока его никто не видит. Без IntersectionObserver (старые браузеры, тесты) — сразу true.
import { useCallback, useEffect, useState } from "react"

export function useInViewOnce<T extends HTMLElement>(rootMargin = "240px") {
  const [el, setEl] = useState<T | null>(null)
  const [seen, setSeen] = useState(false)
  const supported = typeof IntersectionObserver !== "undefined"
  const ref = useCallback((node: T | null) => setEl(node), [])
  useEffect(() => {
    if (!supported || seen || !el) return
    const io = new IntersectionObserver(entries => {
      if (entries.some(e => e.isIntersecting)) { setSeen(true); io.disconnect() }
    }, { rootMargin })
    io.observe(el)
    return () => io.disconnect()
  }, [el, seen, supported, rootMargin])
  return [ref, !supported || seen] as const
}
