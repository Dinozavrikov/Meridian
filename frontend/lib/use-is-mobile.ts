"use client"
import { useState, useEffect } from "react"

// Единый источник истины про "мобильный ли экран" для всего приложения.
// Брейкпоинт (768px) совпадает с Tailwind `md`, чтобы JS-условия (этот хук)
// и чисто CSS-условия (классы md:...) не расходились — как раньше, когда
// Sidebar/AppShell вообще не знали про мобильный режим, а Header и
// EntityHeader проверяли его по-разному.
export function useIsMobile(breakpoint = 768) {
  // Ленивый инициализатор — вычисляем правильное значение СИНХРОННО при
  // монтировании на клиенте, а не всегда стартуем с false в ожидании
  // useEffect. Раньше это создавало гонку: другие эффекты, читающие
  // isMobile при монтировании компонента (например useEntityUrlSync),
  // видели устаревшее false на первом проходе и успевали принять решение
  // до того, как этот хук обновлялся — воспроизводилось при переходе по
  // ссылке на другую страницу и обратно (полное перемонтирование).
  // На SSR-проходе window ещё нет — там честно false, это ожидаемо и
  // не относится к багу (там нет кликов/переходов, о которых идёт речь).
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== "undefined" && typeof window.matchMedia === "function" ? window.matchMedia(`(max-width: ${breakpoint}px)`).matches : false
  )
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return
    const mq = window.matchMedia(`(max-width: ${breakpoint}px)`)
    setIsMobile(mq.matches)
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mq.addEventListener("change", handler)
    return () => mq.removeEventListener("change", handler)
  }, [breakpoint])
  return isMobile
}
