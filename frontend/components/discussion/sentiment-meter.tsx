"use client"
import { theme } from "@/lib/theme"
import { useT } from "@/lib/i18n/useT"

/** Настроение обсуждения — считается на клиенте из уже загруженных позиций комментариев.
 * Отделён от баланса доказательств в карточке записи (тот — официальный факт из связей, этот — мнение участников). */
export function SentimentMeter({ comments }: { comments: any[] }) {
  const t = useT()   // до раннего return: порядок хуков не должен зависеть от данных
  const flat: any[] = []
  const walk = (list: any[]) => list.forEach(c => { flat.push(c); if (c.replies?.length) walk(c.replies) })
  walk(comments)

  const withStance = flat.filter(c => c.stance)
  if (withStance.length === 0) return null

  const confirm = withStance.filter(c => c.stance === "confirm").length
  const neutral = withStance.filter(c => c.stance === "neutral").length
  const refute = withStance.filter(c => c.stance === "refute").length
  const total = confirm + neutral + refute
  const pc = Math.round((confirm / total) * 100)
  const pn = Math.round((neutral / total) * 100)
  const pr = 100 - pc - pn

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 18, marginTop: 18, paddingTop: 16, borderTop: `1px dashed ${theme.ln2}`, flexWrap: "wrap" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 11, color: theme.tx3, flexShrink: 0 }}>
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#27AE60" }} />
        {t("discussion.sentiment")}
      </div>
      <div style={{ flex: 1, minWidth: 160, height: 6, borderRadius: 3, overflow: "hidden", display: "flex", background: theme.bg3 }}>
        {pc > 0 && <span style={{ width: `${pc}%`, background: "#27AE60" }} />}
        {pn > 0 && <span style={{ width: `${pn}%`, background: "#8b91a8" }} />}
        {pr > 0 && <span style={{ width: `${pr}%`, background: "#E74C3C" }} />}
      </div>
      <div style={{ display: "flex", gap: 12, fontFamily: theme.mono, fontSize: 10.5, flexShrink: 0 }}>
        <span style={{ color: "#27AE60" }}>{pc}%</span>
        <span style={{ color: "#8b91a8" }}>{pn}%</span>
        <span style={{ color: "#E74C3C" }}>{pr}%</span>
      </div>
    </div>
  )
}
