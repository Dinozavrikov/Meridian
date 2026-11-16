"use client"
import Link from "next/link"
import { v2 } from "@/lib/theme"
import { Card, Label, EmptyState } from "./primitives"
import { getUrgency, daysLeft, URGENCY_COLOR } from "@/lib/prediction-urgency"
import { entityHref, type EntityType } from "@/lib/entity-routes"
import { PreviewLink } from "@/components/entities/preview-link"
import { Clock, Feather } from "lucide-react"
import { useT } from "@/lib/i18n/useT"
import { OnboardingBadge } from "@/components/ui/onboarding-badge"

export interface UrgentPred {
  entity_type?: EntityType // приходит с бэка как "prediction"; опционально — на случай старых кэшей ответа
  id: number; title: string; check_date: string; status?: string; is_onboarding?: boolean
}
export interface OpenQuestion {
  entity_type?: EntityType // приходит с бэка как "question"
  id: number; title: string; priority: string
}

const PRIORITY_COLOR: Record<string, string> = {
  "низкий": v2.t3, "средний": v2.teal, "высокий": v2.amber, "критический": v2.red,
}
const PRIORITY_SHORT_KEY: Record<string, string> = {
  "низкий": "priority.low", "средний": "priority.medium", "высокий": "priority.high", "критический": "priority.critical",
}

function Note({ children, seal, sealColor, rotate, href, preview }: {
  children: React.ReactNode; seal: string; sealColor: string; rotate: number; href?: string; preview?: { type: string; id: number }
}) {
  const body = (
    <div style={{
      position: "relative", background: v2.bg, border: `0.5px solid ${v2.bd}`,
      borderLeft: `2px solid ${sealColor}`, borderRadius: "0 8px 8px 0",
      padding: "10px 14px 10px 16px", marginBottom: 8, transform: `rotate(${rotate}deg)`,
      boxShadow: "0 3px 8px rgba(0,0,0,.25)",
      cursor: href ? "pointer" : undefined,
      transition: href ? "transform .15s ease, box-shadow .15s ease" : undefined,
    }}>
      <div style={{
        position: "absolute", top: -6, right: 10, fontFamily: v2.fontMono, fontSize: 8,
        fontWeight: 700, letterSpacing: "0.05em", padding: "2px 7px", borderRadius: 3,
        textTransform: "uppercase", background: `${sealColor}30`, color: sealColor,
        border: `0.5px solid ${sealColor}60`,
        boxShadow: "0 2px 6px rgba(0,0,0,.5)",
      }}>{seal}</div>
      {children}
    </div>
  )

  if (!href) return body

  if (preview) {
    return (
      <PreviewLink type={preview.type} id={preview.id} href={href} style={{ textDecoration: "none", display: "block" }}>
        {body}
      </PreviewLink>
    )
  }
  return (
    <Link href={href} style={{ textDecoration: "none", display: "block" }}>
      {body}
    </Link>
  )
}

/**
 * Прогнозы в «заметках» — та же срочность, тот же источник правды
 * (getUrgency/URGENCY_COLOR), что и в PredictionQueue на /predictions.
 * Раньше все срочные прогнозы получали одинаковую печать «крит.» независимо
 * от реального статуса — дашборд и /predictions расходились. Больше не расходятся.
 *
 * Клик по заметке ведёт на detail-таб сущности (entityHref из
 * lib/entity-routes.ts). Сейчас бэк отдаёт только прогнозы и вопросы, но
 * маппинг маршрутов уже общий на все 6 сущностей — когда наблюдения, задачи,
 * убеждения или гипотезы тоже начнут попадать в заметки, менять здесь
 * ничего не придётся, достаточно проставить entity_type на бэке.
 */
export function MarginNotes({ urgentPreds, openQuestions }: { urgentPreds: UrgentPred[]; openQuestions: OpenQuestion[] }) {
  const t = useT()
  const isEmpty = urgentPreds.length === 0 && openQuestions.length === 0

  return (
    <Card>
      {isEmpty ? (
        <EmptyState
          icon={<Feather size={15} />}
          title={t("dashboard.notes.empty.title")}
        />
      ) : (
        <div>
          {urgentPreds.map((p, i) => {
            const urg = getUrgency({ status: p.status ?? "не проверен", expected_check_date: p.check_date })
            const dl = daysLeft({ expected_check_date: p.check_date })
            const color = URGENCY_COLOR[urg]
            const seal = urg === "overdue" ? t("note.seal.critical") : urg === "soon" ? t("note.seal.soon") : t("note.seal.done")
            const href = entityHref(p.entity_type ?? "prediction", p.id)
            return (
              <Note key={`p-${p.id}`} seal={seal} sealColor={color} rotate={i % 2 === 0 ? -1.2 : 1} href={href} preview={{ type: p.entity_type ?? "prediction", id: p.id }}>
                {p.is_onboarding && <div style={{ marginBottom: 5 }}><OnboardingBadge fontSize={9} /></div>}
                <div style={{ fontSize: 12, color: v2.t1, lineHeight: 1.4, paddingRight: 44 }}>{p.title}</div>
                {p.check_date && (
                  <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 5, fontFamily: v2.fontMono, fontSize: 10, color }}>
                    <Clock size={9} /> {urg === "overdue" ? t("note.overdueBy", { n: Math.abs(dl ?? 0) }) : dl != null ? t("note.dueIn", { n: dl }) : p.check_date}
                  </div>
                )}
              </Note>
            )
          })}
          {openQuestions.map((q, i) => {
            const href = entityHref(q.entity_type ?? "question", q.id)
            return (
              <Note key={`q-${q.id}`} seal={PRIORITY_SHORT_KEY[q.priority] ? t(PRIORITY_SHORT_KEY[q.priority]) : q.priority} sealColor={PRIORITY_COLOR[q.priority] ?? v2.t3} rotate={i % 2 === 0 ? 1 : -1.2} href={href} preview={{ type: q.entity_type ?? "question", id: q.id }}>
                <div style={{ fontSize: 12, color: v2.t1, lineHeight: 1.4, paddingRight: 44 }}>{q.title}</div>
              </Note>
            )
          })}
        </div>
      )}
    </Card>
  )
}
