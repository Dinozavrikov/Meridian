"use client"
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useQuery } from "@tanstack/react-query"
import Link from "next/link"
import { hypApi, predApi, authApi } from "@/lib/api"
import { useStore } from "@/lib/store"
import { useIsMobile } from "@/lib/use-is-mobile"
import { StatusBadge } from "@/components/ui/status-badge"
import { DriftNetwork } from "@/components/ui/drift-network"
import { v2, typeColor } from "@/lib/theme"
import { Lightbulb, TrendingUp, ArrowRight } from "lucide-react"
import { useDynamicTranslate } from "@/lib/i18n/useDynamicT"
import { collectStrings } from "@/lib/i18n/collect-strings"

const PAGE_STRINGS = [
  "С возвращением к самому себе,",
  "Вы решаете, что новая работа — правильный выбор. Проходит полгода — и оказывается, что вы уже забыли, почему были так уверены тогда, и что именно должно было это подтвердить.",
  "Меридиан — про то, чтобы такого не происходило: вы записываете гипотезу, отмечаете, какие наблюдения будут ее подтверждать или опровергать, и делаете прогноз с конкретным сроком. Дальше жизнь идет своим чередом — а Меридиан просто ждет момента, когда пора свериться: сбылось или нет, и насколько вы вообще были правы в своей уверенности.",
  "Ваша первая гипотеза",
  "Прогноз — можно проверить прямо сейчас",
  "Загляните в раздел прогнозов и отметьте, как оно на самом деле — это займет меньше минуты.",
  "И еще одна, на будущее",
  "Прогноз на три дня вперед",
  "Спешить некуда — просто загляните через несколько дней и сверьтесь, угадали ли вы.",
  "Показать еще одну гипотезу",
  "Возвращаться сюда стоит не ради галочки «сделано», а чтобы раз за разом видеть, где ваша интуиция работает хорошо, а где регулярно подводит — и постепенно научиться доверять ей ровно настолько, насколько она того заслуживает.",
  "Перейти к дашборду",
]

// ── Карточка сид-сущности ────────────────────────────────────────────────
// Тот же визуальный язык, что у настоящих карточек списков (акцентная
// полоска + иконка типа + статус), но не интерактивная — просто витрина,
// показывающая механику "гипотеза → наблюдение → прогноз" на реальных
// данных пользователя, а не абстрактной картинке.
function SeedCard({ icon: Icon, color, kicker, title, status, note, isMobile }: any) {
  return (
    <div style={{
      position: "relative", background: v2.surf, border: `1px solid ${v2.bd}`,
      borderRadius: 12, padding: isMobile ? "11px 13px 11px 15px" : "14px 16px 14px 18px", overflow: "hidden",
    }}>
      <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: color }} />
      <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 8 }}>
        <Icon size={12} style={{ color }} />
        <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color }}>
          {kicker}
        </span>
        {status && <span style={{ marginLeft: "auto" }}><StatusBadge status={status} fontSize={9.5} /></span>}
      </div>
      <div style={{ fontSize: 13, color: v2.t1, lineHeight: 1.5 }}>{title}</div>
      {note && <div style={{ fontSize: 11.5, color: v2.t3, lineHeight: 1.5, marginTop: 6 }}>{note}</div>}
    </div>
  )
}

export default function OnboardingPage() {
  const dt = useDynamicTranslate(collectStrings(PAGE_STRINGS))
  const router = useRouter()
  const user = useStore(s => s.user)
  const setUser = useStore(s => s.setUser)
  const isMobile = useIsMobile()
  const [showMore, setShowMore] = useState(false)

  useEffect(() => { document.title = "Добро пожаловать · Meridian" }, [])

  // Онбординг имеет смысл только сразу после регистрации, пока сид-данные
  // еще не тронуты. Если пользователя нет или он уже прошел онбординг —
  // отправляем на дашборд, а не показываем пустой экран.
  useEffect(() => {
    if (user === null) router.replace("/login")
    else if (user?.onboarding_completed) router.replace("/dashboard")
  }, [user])

  const { data: hyps } = useQuery({ queryKey: ["hypotheses", "seed"], queryFn: () => hypApi.list(), enabled: !!user })
  const { data: preds } = useQuery({ queryKey: ["predictions", "seed"], queryFn: () => predApi.list(), enabled: !!user })

  const seedHyps  = hyps  ? [...hyps].filter((h: any) => h.is_onboarding).sort((a: any, b: any) => a.id - b.id)   : []
  const seedPreds = preds ? [...preds].filter((p: any) => p.is_onboarding).sort((a: any, b: any) => a.id - b.id) : []
  const [instantHyp, delayedHyp]   = seedHyps
  const [instantPred, delayedPred] = seedPreds

  const finish = async () => {
    try { await authApi.updateOnboarding(1, true) } finally {
      if (user) setUser({ ...user, onboarding_completed: true })
      router.push("/dashboard")
    }
  }

  return (
    <div style={{
      position: "relative", minHeight: "100vh", overflow: "hidden",
      background: `radial-gradient(ellipse 900px 500px at 50% -10%, rgba(77,207,166,0.08), transparent 60%), ${v2.bg}`,
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: 24, fontFamily: v2.fontSans,
    }}>
      <DriftNetwork />

      <div style={{ position: "relative", width: "100%", maxWidth: 560 }}>
        <div style={{ textAlign: "center", marginBottom: isMobile ? 16 : 28 }}>
          <h1 style={{ fontSize: isMobile ? 18 : 22, fontWeight: 800, color: v2.t1, margin: "0 0 10px", letterSpacing: "-0.02em" }}>
            {dt("С возвращением к самому себе,")} {user?.display_name || user?.username}
          </h1>
          <p style={{ fontSize: isMobile ? 12.5 : 13.5, color: v2.t2, lineHeight: isMobile ? 1.5 : 1.7, maxWidth: 500, margin: "0 auto 12px" }}>
            {dt("Вы решаете, что новая работа — правильный выбор. Проходит полгода — и оказывается, что вы уже забыли, почему были так уверены тогда, и что именно должно было это подтвердить.")}
          </p>
          <p style={{ fontSize: isMobile ? 12.5 : 13.5, color: v2.t2, lineHeight: isMobile ? 1.5 : 1.7, maxWidth: 500, margin: "0 auto" }}>
            {dt("Меридиан — про то, чтобы такого не происходило: вы записываете гипотезу, отмечаете, какие наблюдения будут ее подтверждать или опровергать, и делаете прогноз с конкретным сроком. Дальше жизнь идет своим чередом — а Меридиан просто ждет момента, когда пора свериться: сбылось или нет, и насколько вы вообще были правы в своей уверенности.")}
          </p>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: isMobile ? 7 : 10, marginBottom: isMobile ? 16 : 26 }}>
          {instantHyp && (
            <SeedCard icon={Lightbulb} color={typeColor.hypothesis} kicker={dt("Ваша первая гипотеза")}
              title={instantHyp.name} status={instantHyp.status} isMobile={isMobile} />
          )}
          {instantPred && (
            <SeedCard icon={TrendingUp} color={typeColor.prediction} kicker={dt("Прогноз — можно проверить прямо сейчас")}
              title={instantPred.text || instantPred.title} status={instantPred.status}
              note={dt("Загляните в раздел прогнозов и отметьте, как оно на самом деле — это займет меньше минуты.")}
              isMobile={isMobile} />
          )}
          {(!isMobile || showMore) && delayedHyp && (
            <SeedCard icon={Lightbulb} color={typeColor.hypothesis} kicker={dt("И еще одна, на будущее")}
              title={delayedHyp.name} status={delayedHyp.status} isMobile={isMobile} />
          )}
          {(!isMobile || showMore) && delayedPred && (
            <SeedCard icon={TrendingUp} color={typeColor.prediction} kicker={dt("Прогноз на три дня вперед")}
              title={delayedPred.text || delayedPred.title} status={delayedPred.status}
              note={dt("Спешить некуда — просто загляните через несколько дней и сверьтесь, угадали ли вы.")}
              isMobile={isMobile} />
          )}
        </div>

        {isMobile && !showMore && (delayedHyp || delayedPred) && (
          <button onClick={() => setShowMore(true)}
            style={{
              display: "block", width: "100%", textAlign: "center", background: "none", border: "none",
              color: v2.t2, fontSize: 12, padding: "0 0 16px", cursor: "pointer", textDecoration: "underline",
            }}>
            {dt("Показать еще одну гипотезу")}
          </button>
        )}

        {!isMobile && (
          <>
            <div style={{
              height: 1, margin: "0 auto 20px", maxWidth: 280,
              background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.13) 20%, rgba(255,255,255,0.13) 80%, transparent)",
            }} />

            <p style={{
              fontSize: 13.5, color: v2.t1, textAlign: "center", lineHeight: 1.75,
              fontFamily: v2.fontSerif, fontStyle: "italic", maxWidth: 480, margin: "0 auto 26px",
            }}>
              {dt("Возвращаться сюда стоит не ради галочки «сделано», а чтобы раз за разом видеть, где ваша интуиция работает хорошо, а где регулярно подводит — и постепенно научиться доверять ей ровно настолько, насколько она того заслуживает.")}
            </p>
          </>
        )}

        <button
          onClick={finish}
          style={{
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            width: "100%", padding: "13px 0", borderRadius: 10, border: "none", cursor: "pointer",
            fontSize: 13.5, fontWeight: 600, color: "#062018",
            background: "linear-gradient(135deg, #4dcfa6, #3fb894)",
          }}
        >
          {dt("Перейти к дашборду")} <ArrowRight size={15} />
        </button>
      </div>
    </div>
  )
}
