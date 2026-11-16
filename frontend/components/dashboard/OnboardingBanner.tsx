"use client"
import { useQuery } from "@tanstack/react-query"
import Link from "next/link"
import { hypApi, authApi } from "@/lib/api"
import { useStore } from "@/lib/store"
import { Sparkles, ChevronRight } from "lucide-react"

const GREEN = "#27AE60"

/**
 * Баннер стартового онбординга — тот же визуальный язык, что и у
 * PredictionQueueTrigger (плашка-иконка + заголовок/подпись + chevron),
 * но зелёный акцент (уже принятая в проекте семантика "позитивное/успех",
 * см. GuestSidebar "Публичный слой"). Показывается один раз, пока
 * user.onboarding_completed === false — сеется вместе с пользователем
 * при регистрации (см. backend/app/api/v1/auth.py::register). Не туториал
 * из шагов, а приглашение открыть уже готовую гипотезу с наблюдением
 * и прогнозом внутри — учит через собственные данные, а не абстракцию.
 */
export function OnboardingBanner() {
  const user = useStore(s => s.user)
  const setUser = useStore(s => s.setUser)

  const { data: hyps } = useQuery({
    queryKey: ["hypotheses", "onboarding-seed"],
    queryFn: () => hypApi.list(),
    enabled: !!user && !user.onboarding_completed,
  })

  if (!user || user.onboarding_completed) return null
  if (!hyps || hyps.length === 0) return null

  const seedHyp = [...hyps].sort((a: any, b: any) => a.id - b.id)[0]

  const dismiss = async () => {
    try {
      await authApi.updateOnboarding(1, true)
    } finally {
      setUser({ ...user, onboarding_completed: true })
    }
  }

  return (
    <Link
      href={`/hypotheses?id=${seedHyp.id}&tab=detail`}
      onClick={dismiss}
      style={{
        display: "flex", alignItems: "center", gap: 12, width: "100%",
        padding: "14px 18px", borderRadius: 12, cursor: "pointer",
        border: `1px solid ${GREEN}40`,
        background: `linear-gradient(90deg, ${GREEN}14, transparent 70%)`,
        textAlign: "left", transition: "border-color 0.15s", textDecoration: "none",
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = `${GREEN}70` }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = `${GREEN}40` }}
    >
      <div style={{
        width: 34, height: 34, borderRadius: 9, background: `${GREEN}18`,
        display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
      }}>
        <Sparkles size={16} style={{ color: GREEN }} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#f2efe9" }}>
          Мы завели для вас первую гипотезу
        </div>
        <div style={{ fontSize: 11, color: "rgba(242,239,233,0.45)", marginTop: 2 }}>
          С наблюдением и прогнозом внутри — посмотрите, как это работает
        </div>
      </div>
      <ChevronRight size={16} style={{ color: `${GREEN}90`, flexShrink: 0 }} />
    </Link>
  )
}
