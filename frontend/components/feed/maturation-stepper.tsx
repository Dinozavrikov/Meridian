"use client"
import { OBSERVATION_STATUSES } from "@/lib/observation-constants"
import { theme, typeColor } from "@/lib/theme"
import { useDynamicTranslate } from "@/lib/i18n/useDynamicT"

const STAGES = OBSERVATION_STATUSES

/** Статус наблюдения — это путь созревания мысли, а не ярлык. */
export function MaturationStepper({ status }: { status: string }) {
  const dt = useDynamicTranslate(STAGES)
  const idx = STAGES.indexOf(status)
  if (idx === -1) return null
  const c = typeColor.observation

  return (
    <div style={{ display: "flex", alignItems: "center", marginBottom: 11 }}>
      {STAGES.map((stage, i) => {
        const reached = i <= idx
        const current = i === idx
        return (
          <div key={stage} style={{ display: "flex", alignItems: "center", flex: i < STAGES.length - 1 ? 1 : "0 0 auto" }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5 }}>
              <div style={{
                width: current ? 9 : 7, height: current ? 9 : 7, borderRadius: "50%",
                background: reached ? c : theme.ln2, border: `1.5px solid ${reached ? c : theme.ln2}`,
                boxShadow: current ? `0 0 0 3px ${c}30` : "none", flexShrink: 0,
              }} />
              <span style={{
                fontSize: 8.5, fontFamily: theme.mono, letterSpacing: "0.02em", whiteSpace: "nowrap",
                color: current ? c : reached ? theme.tx3 : theme.tx4, fontWeight: current ? 700 : 400,
              }}>{dt(stage)}</span>
            </div>
            {i < STAGES.length - 1 && (
              <div style={{ flex: 1, height: 1, margin: "0 4px 15px", background: i < idx ? `${c}66` : theme.ln2 }} />
            )}
          </div>
        )
      })}
    </div>
  )
}
