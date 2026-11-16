"use client"
// Размер элемента (ширина/высота содержимого), обновляется при изменении. Нужен там, где раскладка
// зависит от ширины САМОЙ панели, а не окна: панель детали меняет ширину, когда тянут разделитель.
// useIsMobile считает окно и для этого не подходит.
import { useEffect, useLayoutEffect, useRef, useState } from "react"

const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect

export function useElementSize<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })
  useIsoLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const read = () => setSize(prev =>
      prev.width === el.clientWidth && prev.height === el.clientHeight ? prev : { width: el.clientWidth, height: el.clientHeight })
    read()
    if (typeof ResizeObserver === "undefined") return
    const ro = new ResizeObserver(read)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, size] as const
}
