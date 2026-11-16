"use client"
import { useState, useRef, useEffect } from "react"
import { useQuery } from "@tanstack/react-query"
import { statsApi } from "@/lib/api"
import { useStore } from "@/lib/store"
import { v2 } from "@/lib/theme"
import { PageShell, PageContent } from "@/components/layout/page-shell"
import { Header } from "@/components/layout/header"

import { PracticeInstrument } from "@/components/dashboard/PracticeInstrument"
import { HypothesisRiver } from "@/components/dashboard/HypothesisRiver"
import { EvidenceBalanceList } from "@/components/dashboard/EvidenceBalanceList"
import { PredictionLedger } from "@/components/dashboard/PredictionLedger"
import { MarginNotes } from "@/components/dashboard/MarginNotes"
import { LoopRings } from "@/components/dashboard/LoopRings"
import { JournalTimeline } from "@/components/dashboard/JournalTimeline"
import { SectionHeader } from "@/components/dashboard/primitives"
import { PredictionQueueTrigger } from "@/components/entities/prediction-queue-trigger"
import { toQueueItem } from "@/lib/queue-item"
import { TaskExpectationsPanel } from "@/components/entities/task-expectations-panel"
import { OnboardingBanner } from "@/components/dashboard/OnboardingBanner"
import { useT } from "@/lib/i18n/useT"

// Раньше был захардкожен словарь всего из двух языков (ru/en) с откатом
// на "ru-RU" для всех остальных — из-за этого дата на японском (и любом
// другом языке вне словаря) не переводилась, хотя весь остальной интерфейс
// уже был переведён через локальную модель. Intl.DateTimeFormat принимает произвольный
// BCP-47 тег напрямую — передаём locale как есть, без карты-белого списка.

export default function DashboardPage() {
  const t = useT()
  const user = useStore(s => s.user)
  const locale = useStore(s => s.locale)
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard"],
    queryFn: statsApi.dashboard,
    staleTime: 30_000,
  })
  const leftColRef = useRef<HTMLDivElement>(null)
  const rightColRef = useRef<HTMLDivElement>(null)
  const journalRef = useRef<HTMLDivElement>(null)
  const journalOnLeftRef = useRef(true)
  const journalHeightRef = useRef(180)
  const [journalOnLeft, setJournalOnLeft] = useState(true)

  // Измеряем высоту Journal отдельно — нужно для расчёта без дребезга
  useEffect(() => {
    const el = journalRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) journalHeightRef.current = e.contentRect.height
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [journalOnLeft])

  // Балансируем: Journal идёт туда, где после его размещения максимальная
  // высота колонок будет меньше. Гистерезис 40px чтобы не дребезжало.
  useEffect(() => {
    const left = leftColRef.current
    const right = rightColRef.current
    if (!left || !right) return
    const ro = new ResizeObserver((entries) => {
      let lh = 0, rh = 0
      for (const e of entries) {
        if (e.target === left) lh = e.contentRect.height
        if (e.target === right) rh = e.contentRect.height
      }
      const jh = journalHeightRef.current
      const cur = journalOnLeftRef.current
      const leftWithout = lh - (cur ? jh : 0)
      const rightWithout = rh - (!cur ? jh : 0)
      const maxIfLeft = Math.max(leftWithout + jh, rightWithout)
      const maxIfRight = Math.max(leftWithout, rightWithout + jh)
      const threshold = 40
      if (maxIfLeft < maxIfRight - threshold && !cur) {
        journalOnLeftRef.current = true
        setJournalOnLeft(true)
      } else if (maxIfRight < maxIfLeft - threshold && cur) {
        journalOnLeftRef.current = false
        setJournalOnLeft(false)
      }
    })
    ro.observe(left)
    ro.observe(right)
    return () => ro.disconnect()
  }, [isLoading])
  const dateLabel = new Intl.DateTimeFormat(locale || "ru", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  }).format(new Date())

  const dayRu   = ["Воскресенье","Понедельник","Вторник","Среда","Четверг","Пятница","Суббота"]
  const monthRu = ["января","февраля","марта","апреля","мая","июня","июля","августа","сентября","октября","ноября","декабря"]
  const now = new Date()

  if (isLoading) return (
    <PageShell>
      <Header titleKey="page.dashboard.title" />
      <PageContent>
        <div style={{ display: "flex", flexDirection: "column", gap: 14, paddingTop: 8 }}>
          {[...Array(5)].map((_, i) => (
            <div key={i} style={{ height: 72, borderRadius: 9, background: v2.surf2, border: `0.5px solid ${v2.bd}`, opacity: 0.5 - i * 0.08 }} />
          ))}
        </div>
      </PageContent>
    </PageShell>
  )

  const loopsTotal =
    (data?.loops?.hyps_no_obs?.length ?? 0) +
    (data?.loops?.hyps_no_pred?.length ?? 0) +
    (data?.loops?.questions_no_answer?.length ?? 0)  +
    (data?.loops?.worldview_no_reflection?.length ?? 0)

  return (
    <PageShell>
      <Header titleKey="page.dashboard.title" />
      <PageContent noPadding>
        <div className="dashboard-content" style={{ display: "flex", flexDirection: "column", gap: 20 }}>

          {/* ── Штамп + приветствие ─────────────────────────────────── */}
          <div>
            <p style={{
              fontSize: 10, color: v2.t3, fontFamily: v2.fontMono,
              marginBottom: 4, letterSpacing: "0.03em", textTransform: "uppercase",
            }}>
              {dateLabel}
            </p>
            <h1 style={{ fontSize: 22, fontWeight: 600, color: v2.t1, letterSpacing: "-0.02em" }}>
              {t("dashboard.greeting", { name: user?.display_name || user?.username || "" })}
            </h1>
          </div>

          <OnboardingBanner />

          {/* ── Триггер очереди проверки: банер + модалка (как на /predictions) ── */}
          <PredictionQueueTrigger
            items={(data?.urgent_preds ?? []).map(toQueueItem)}
            invalidateKeys={[["dashboard"], ["predictions"]]}
          />
          <TaskExpectationsPanel />

          {/* ── Инструмент калибровки: прибор + орбиты + ранг/серия ─── */}
          <PracticeInstrument
            totals={data?.totals ?? {}}
            accuracy={data?.pred_accuracy ?? null}
            checked={data?.pred_checked ?? 0}
            streakDays={data?.streak_days ?? 0}
            rank={data?.practice_rank ?? null}
            deletedUnverified={data?.pred_deleted_unverified ?? 0}
          />

          <div className="dash-cols">
            <div className="dash-col" ref={leftColRef}>
              <div>
                <SectionHeader label={t("dashboard.river.label")} />
                <HypothesisRiver hypByStatus={data?.hyp_by_status ?? {}} />
              </div>
              <div>
                <SectionHeader label={t("dashboard.evidence.label")} count={data?.evidence_balance?.length} />
                <EvidenceBalanceList rows={data?.evidence_balance ?? []} />
              </div>
              <div>
                <SectionHeader label={t("dashboard.section.predictions")} count={data?.preds_by_hyp?.length} />
                <PredictionLedger rows={data?.preds_by_hyp ?? []} />
              </div>
              {journalOnLeft && (
                <div ref={journalRef}>
                  <SectionHeader label={t("dashboard.section.journal")} />
                  <JournalTimeline items={data?.recent_activity ?? []} />
                </div>
              )}
            </div>

            <div className="dash-col" ref={rightColRef}>
              <div>
                <SectionHeader label={t("dashboard.section.notes")} accent={v2.amber} />
                <MarginNotes
                  urgentPreds={(data?.urgent_preds ?? []).map((p: any) => ({ ...p, status: "не проверен" }))}
                  openQuestions={data?.open_questions ?? []}
                />
              </div>
              <div>
                <SectionHeader label={t("dashboard.section.loops")} accent={v2.violet} count={loopsTotal} />
                <LoopRings loops={data?.loops ?? { hyps_no_obs: [], hyps_no_pred: [], questions_no_answer: [], worldview_no_reflection: [] }} total={loopsTotal} />
              </div>
              {!journalOnLeft && (
                <div ref={journalRef}>
                  <SectionHeader label={t("dashboard.section.journal")} />
                  <JournalTimeline items={data?.recent_activity ?? []} />
                </div>
              )}
            </div>
          </div>

        </div>
      </PageContent>
    </PageShell>
  )
}
