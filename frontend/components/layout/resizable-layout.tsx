"use client"
import React, { useState, useRef, useEffect, useCallback } from "react"
import { ArrowLeft } from "lucide-react"
import { useIsMobile } from "@/lib/use-is-mobile"
import { useT } from "@/lib/i18n/useT"
import { useHeaderHeight } from "@/lib/use-sticky-top"

export { useIsMobile }

interface ResizableLayoutProps {
  left: React.ReactNode
  right: React.ReactNode
  showRight: boolean
  onBack?: () => void
  accent?: string
  backLabel?: string
}

export function ResizableLayout({
  left, right, showRight, onBack, accent = "#4A90D9", backLabel,
}: ResizableLayoutProps) {
  const t = useT()
  const effectiveBackLabel = backLabel ?? t("resizableLayout.back")
  const isMobile = useIsMobile()
  const [leftW, setLeftW] = useState(320)
  const dragging = useRef(false)
  const startX = useRef(0)
  const startW = useRef(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const headerH = useHeaderHeight()

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    dragging.current = true
    startX.current = e.clientX
    startW.current = leftW
    document.body.style.cursor = "col-resize"
    document.body.style.userSelect = "none"
  }, [leftW])

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging.current) return
      const delta = e.clientX - startX.current
      const container = containerRef.current
      if (!container) return
      const total = container.clientWidth
      const next = Math.max(200, Math.min(total - 200, startW.current + delta))
      setLeftW(next)
    }
    const onUp = () => {
      dragging.current = false
      document.body.style.cursor = ""
      document.body.style.userSelect = ""
    }
    window.addEventListener("mousemove", onMove)
    window.addEventListener("mouseup", onUp)
    return () => {
      window.removeEventListener("mousemove", onMove)
      window.removeEventListener("mouseup", onUp)
    }
  }, [])

  if (isMobile) {
    if (showRight) {
      return (
        <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
          <button
            type="button"
            onClick={onBack}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "10px 16px", background: "transparent",
              border: "none", borderBottom: "1px solid #0e0e18",
              color: accent, fontSize: 13, fontWeight: 500,
              cursor: "pointer", flexShrink: 0,
            }}>
            <ArrowLeft size={14} /> {effectiveBackLabel}
          </button>
          <div style={{ flex: 1, minHeight: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>{right}</div>
        </div>
      )
    }
    return (
      <div style={{ height: "100%", minHeight: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>{left}</div>
    )
  }

  return (
    <div ref={containerRef} style={{ display: "flex", gap: 0, flex: 1, minHeight: 0 }}>
      <div style={{
        width: leftW, flexShrink: 0, minWidth: 0, minHeight: 0, display: "flex", flexDirection: "column",
        position: "sticky", top: headerH, alignSelf: "flex-start", height: `calc(100vh - ${headerH}px)`,
      }}>
        {left}
      </div>
      <div
        onMouseDown={onMouseDown}
        style={{ width: 8, flexShrink: 0, cursor: "col-resize", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 10 }}>
        <div
          style={{ width: 2, height: 40, borderRadius: 2, background: "#1e1e28", transition: "background 0.12s" }}
          onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = accent + "80")}
          onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = "#1e1e28")}
        />
      </div>
      <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: "flex", flexDirection: "column" }}>
        {right}
      </div>
    </div>
  )
}
