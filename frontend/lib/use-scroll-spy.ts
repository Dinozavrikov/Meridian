"use client"
import { useEffect, useState } from "react"

/** Какой из разделов сейчас в рабочей полосе экрана. Из пересекающихся берется первый по порядку страницы.
 *  Без IntersectionObserver (старый браузер, тестовое окружение) возвращает первый раздел и ничего не ломает. */
export function useScrollSpy(ids: readonly string[]): string {
  const [active, setActive] = useState(ids[0] ?? "")
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return
    const visible = new Set<string>()
    const io = new IntersectionObserver(entries => {
      for (const e of entries) {
        if (e.isIntersecting) visible.add(e.target.id)
        else visible.delete(e.target.id)
      }
      const first = ids.find(id => visible.has(id))
      if (first) setActive(first)
    }, { rootMargin: "-15% 0px -70% 0px" })
    for (const id of ids) {
      const el = document.getElementById(id)
      if (el) io.observe(el)
    }
    return () => io.disconnect()
  }, [ids])
  return active
}
