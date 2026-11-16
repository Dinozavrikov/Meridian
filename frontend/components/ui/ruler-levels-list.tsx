"use client"
import type { ScaleLevel } from "@/lib/scales"
import { theme } from "@/lib/theme"

interface RulerLevelsListProps {
  levels: ScaleLevel[]
  color: string
  currentValue?: number | null
}

/**
 * Список описаний значений шкалы — используется под DetailRuler на /scales.
 * Вынесен из ScaleDetail, чтобы не дублировать разметку между просмотром
 * и (в будущем) любым другим местом, где нужно показать полную расшифровку шкалы.
 */
export function RulerLevelsList({ levels, color, currentValue }: RulerLevelsListProps) {
  if (!levels || levels.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: "48px 0", color: theme.tx4, fontSize: 13 }}>
        Описания значений не заданы
      </div>
    )
  }

  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: theme.tx4, marginBottom: 14 }}>
        Значения ({levels.length})
      </div>
      <div style={{ display: "flex", flexDirection: "column", borderRadius: 12, overflow: "hidden", border: `1px solid ${theme.ln1}` }}>
        {levels.map((lvl, i) => {
          const isCurrent = currentValue === lvl.value
          return (
            <div key={lvl.value} style={{
              display: "flex", gap: 14, alignItems: "flex-start", padding: "13px 16px",
              background: isCurrent ? `${color}14` : theme.bg2,
              borderBottom: i < levels.length - 1 ? `1px solid ${theme.ln1}` : "none",
              transition: "background 0.12s",
            }}>
              <div style={{
                width: 26, height: 26, borderRadius: 7, flexShrink: 0,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontFamily: "'JetBrains Mono', 'Fira Code', monospace", fontSize: 11, fontWeight: 700,
                color: isCurrent ? color : theme.tx3,
                background: isCurrent ? `${color}28` : theme.bg3,
                border: `1px solid ${isCurrent ? color + "60" : theme.ln2}`,
              }}>
                {lvl.value}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: isCurrent ? theme.tx1 : theme.tx2, marginBottom: 2 }}>
                  {lvl.label}
                </div>
                {lvl.desc && <div style={{ fontSize: 11.5, color: theme.tx4, lineHeight: 1.5 }}>{lvl.desc}</div>}
              </div>
              {isCurrent && (
                <span style={{ fontSize: 9, fontFamily: "'JetBrains Mono', 'Fira Code', monospace", color, alignSelf: "center", flexShrink: 0 }}>
                  ● сейчас
                </span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
