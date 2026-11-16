"use client"
import { theme, typeColor } from "@/lib/theme"
import { useT } from "@/lib/i18n/useT"
import { ruPluralForm } from "@/lib/i18n/ru-plural"

/** Прогноз — единственная сущность с будущим моментом проверки. Показываем движение к нему. */
export function VerifyTrack({ createdAt, expectedDate }: { createdAt: string; expectedDate?: string | null }) {
  const t = useT()
  if (!expectedDate) return null
  const created = new Date(createdAt).getTime()
  const expected = new Date(expectedDate).getTime()
  const now = Date.now()
  if (isNaN(expected) || expected <= created) return null

  const pct = Math.max(0, Math.min(100, ((now - created) / (expected - created)) * 100))
  const daysLeft = Math.max(0, Math.ceil((expected - now) / 86400000))
  const c = typeColor.prediction
  const dayForm = ruPluralForm(daysLeft)
  const dayKey = dayForm === "one" ? "verifyTrack.dayOne" : dayForm === "few" ? "verifyTrack.dayFew" : "verifyTrack.dayMany"

  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ position: "relative", height: 4, borderRadius: 2, background: theme.bg3, marginBottom: 6 }}>
        <div style={{ height: "100%", borderRadius: 2, background: c, opacity: 0.55, width: `${pct}%` }} />
        <div style={{
          position: "absolute", top: "50%", left: `${pct}%`, width: 8, height: 8, borderRadius: "50%",
          background: c, border: `2px solid ${theme.bg1}`, transform: "translate(-50%,-50%)",
        }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontFamily: theme.mono, fontSize: 10, color: theme.tx4 }}>
        <span>{t("verifyTrack.createdPrefix")} {new Date(createdAt).toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}</span>
        <span>
          {daysLeft > 0
            ? <>{t("verifyTrack.daysUntilCheck")} <b style={{ color: theme.tx3 }}>{daysLeft} {t(dayKey)}</b></>
            : <b style={{ color: c }}>{t("verifyTrack.timeToCheck")}</b>}
        </span>
        <span>{new Date(expectedDate).toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}</span>
      </div>
    </div>
  )
}
