import { useState } from "react"

export type ViewMode = "masonry" | "timeline" | "compact"

export function useView(key: string, def: ViewMode = "masonry") {
  const stored = typeof window !== "undefined" ? (localStorage.getItem(`view:${key}`) as ViewMode | null) : null
  const [view, setViewRaw] = useState<ViewMode>(stored ?? def)
  const setView = (v: ViewMode) => {
    localStorage.setItem(`view:${key}`, v)
    setViewRaw(v)
  }
  return [view, setView] as const
}
