"use client"
import React from "react"
import { theme } from "@/lib/theme"
import { useT } from "@/lib/i18n/useT"
import { useIsMobile } from "@/lib/use-is-mobile"

interface DetailPanelProps {
  children: React.ReactNode
  accent: string
  noTopBorder?: boolean
  style?: React.CSSProperties
}

/**
 * Вариант А «Пространство» — никаких рамок.
 * Иерархия создаётся разницей фонов: список bg1, деталь bg0.
 * accent сохранён в props для совместимости с вызывающим кодом.
 */
export function DetailPanel({ children, accent, noTopBorder, style }: DetailPanelProps) {
  const isMobile = useIsMobile()
  // Десктоп: без overflow:hidden и фиксированной высоты, иначе липкий паспорт внутри
  // прилипает к этому блоку, а не к окну (страница прокручивается одним потоком).
  // Мобильный: деталь занимает весь экран и прокручивается внутри.
  const scrollBehavior: React.CSSProperties = isMobile
    ? { overflow: "hidden", height: "100%" }
    : { overflowX: "clip" }
  return (
    <div style={{
      flex: 1, minWidth: 0, minHeight: 0,
      background: "#0b0d14",
      ...scrollBehavior,
      display: "flex",
      flexDirection: "column",
      ...style,
    }}>
      {children}
    </div>
  )
}

export function DetailPanelEmpty({ accent }: { accent: string }) {
  const t = useT()
  return (
    <div style={{
      flex: 1, minWidth: 0,
      display: "flex", alignItems: "center", justifyContent: "center",
      color: "#9999a2", fontSize: 13,
      background: "#0b0d14",
      height: "100%",
    }}>
      {t("detail.empty")}
    </div>
  )
}
