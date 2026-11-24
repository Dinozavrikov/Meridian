"use client"
import Link from "next/link"
import { Globe } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useDynamicTranslate } from "@/lib/i18n/useDynamicT"
import { collectStrings } from "@/lib/i18n/collect-strings"

const PAGE_STRINGS = [
  "Публичный слой",
  "Вы смотрите Meridian как гость. Через полгода ",
  "будет казаться, что вы всегда знали, чем все закончится",
  ", если не зафиксировать это сейчас.",
  "Зарегистрироваться",
  "Войти",
]

// Гостевая колонка — не урезанный Sidebar, а честная витрина: посетитель
// видит тот же зеленый "публичный" акцент, что и везде в системе видимости
// (VisibilitySelect / OrbitSelector), а не generic "залогиньтесь".
const PUBLIC_GREEN = "#27AE60"

export function GuestSidebar() {
  const dt = useDynamicTranslate(collectStrings(PAGE_STRINGS))
  return (
    <aside className="hidden md:flex" style={{
      position: "fixed", top: 0, left: 0, height: "100%", zIndex: 30,
      width: 180, flexShrink: 0,
      flexDirection: "column", alignItems: "center",
      background: "#080a10", borderRight: "0.5px solid rgba(255,255,255,0.07)",
      padding: "20px 16px 16px",
    }}>
      <Link href="/" aria-label="Meridian" style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 28, textDecoration: "none" }}>
        <div style={{
          width: 26, height: 26, borderRadius: 7,
          background: "linear-gradient(135deg, #4A90D915, #7070c010)",
          border: "1px solid #4A90D925",
          display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
        }}>
          <svg width="12" height="12" viewBox="0 0 13 13" fill="none">
            <path d="M6.5 1L12 6.5L6.5 12L1 6.5L6.5 1Z" stroke="#4A90D9" strokeWidth="1.2" fill="none" strokeLinejoin="round"/>
            <path d="M6.5 3.5L9.5 6.5L6.5 9.5L3.5 6.5L6.5 3.5Z" fill="#4A90D930" stroke="#4A90D960" strokeWidth="0.8" strokeLinejoin="round"/>
          </svg>
        </div>
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.1em", color: "#e8e8f0" }}>
          MER<span style={{ color: "#1D9E75" }}>I</span>DIAN
        </div>
      </Link>

      <div style={{
        display: "flex", alignItems: "center", gap: 7,
        background: `${PUBLIC_GREEN}10`, border: `1px solid ${PUBLIC_GREEN}28`,
        borderRadius: 8, padding: "6px 10px", marginBottom: 14, alignSelf: "stretch",
      }}>
        <Globe size={13} style={{ color: PUBLIC_GREEN, flexShrink: 0 }} />
        <span style={{ fontSize: 11, color: PUBLIC_GREEN, fontWeight: 600, letterSpacing: "0.01em" }}>
          {dt("Публичный слой")}
        </span>
      </div>

      <p style={{ fontSize: 12, color: "#9696a5", lineHeight: 1.6, margin: "0 0 24px", textAlign: "left" }}>
        {dt("Вы смотрите Meridian как гость. Через полгода ")}<strong style={{ color: "#f2efe9", fontWeight: 600 }}>{dt("будет казаться, что вы всегда знали, чем все закончится")}</strong>{dt(", если не зафиксировать это сейчас.")}
      </p>

      <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 8, alignSelf: "stretch" }}>
        <Link href="/register" style={{ textDecoration: "none" }}>
          <Button variant="primary" style={{ width: "100%" }}>{dt("Зарегистрироваться")}</Button>
        </Link>
        <Link href="/login" style={{ textDecoration: "none" }}>
          <Button variant="ghost" style={{ width: "100%" }}>{dt("Войти")}</Button>
        </Link>
      </div>
    </aside>
  )
}
