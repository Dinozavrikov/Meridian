"use client"
import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import Link from "next/link"
import { Modal } from "@/components/ui/modal"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/input"
import { taskApi } from "@/lib/api"
import { entityHref } from "@/lib/entity-routes"
import { useT } from "@/lib/i18n/useT"
import { Clock, ChevronRight } from "lucide-react"

interface TaskExpectationItem {
  id: number
  task_id: number
  expectation_confidence: number
  expectation_text: string
  check_at: string
}

/**
 * Компактный триггер на дашборде — тот же паттерн, что PredictionQueueTrigger
 * (банер + счётчик, а не встроенный список неограниченной высоты). Вторая
 * половина цикла TaskExpectation: без этого блока GET /tasks/expectations/pending
 * никогда никем не вызывается — данные копятся, но пользователь их не видит
 * (см. обсуждение в чате: "Продакт" настоял, что без этого фича не замкнута).
 */
export function TaskExpectationsPanel() {
  const t = useT()
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [resolving, setResolving] = useState<Record<number, { confidence: number; text: string }>>({})

  const { data: items = [] } = useQuery<TaskExpectationItem[]>({
    queryKey: ["task-expectations-pending"],
    queryFn: () => taskApi.pendingExpectations(),
    staleTime: 60_000,
  })

  const resolve = useMutation({
    mutationFn: ({ id, outcome_confidence, outcome_text }: { id: number; outcome_confidence: number; outcome_text: string }) =>
      taskApi.resolveExpectation(id, { outcome_confidence, outcome_text }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["task-expectations-pending"] }),
  })
  const dismiss = useMutation({
    mutationFn: (id: number) => taskApi.dismissExpectation(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["task-expectations-pending"] }),
  })

  if (items.length === 0) return null

  const getState = (id: number) => resolving[id] ?? { confidence: 50, text: "" }
  const setState = (id: number, patch: Partial<{ confidence: number; text: string }>) =>
    setResolving(prev => ({ ...prev, [id]: { ...getState(id), ...patch } }))

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        style={{
          display: "flex", alignItems: "center", gap: 12, width: "100%",
          padding: "14px 18px", borderRadius: 12, cursor: "pointer",
          border: "1px solid #4A90D940",
          background: "linear-gradient(90deg, #4A90D914, transparent 70%)",
          textAlign: "left", transition: "border-color 0.15s",
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = "#4A90D970" }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = "#4A90D940" }}
      >
        <div style={{
          width: 34, height: 34, borderRadius: 9, background: "#4A90D918",
          display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
        }}>
          <Clock size={16} style={{ color: "#4A90D9" }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#f2efe9" }}>
            {t(items.length === 1 ? "taskExpectations.pending.one" : "taskExpectations.pending.many", { n: items.length })}
          </div>
          <div style={{ fontSize: 11, color: "rgba(242,239,233,0.45)", marginTop: 2 }}>
            {t("taskExpectations.clickToCheck")}
          </div>
        </div>
        <ChevronRight size={16} style={{ color: "rgba(242,239,233,0.3)", flexShrink: 0 }} />
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title={t("taskExpectations.modalTitle")} size="lg">
        <div style={{ display: "flex", flexDirection: "column", gap: 12, maxHeight: 480, overflowY: "auto" }}>
          {items.map(item => {
            const st = getState(item.id)
            return (
              <div key={item.id} style={{
                padding: "14px 16px", borderRadius: 10, background: "#0d0d18", border: "1px solid #1e1e2c",
                display: "flex", flexDirection: "column", gap: 10,
              }}>
                <div>
                  <div style={{ fontSize: 12, color: "#9999a9", marginBottom: 4 }}>
                    {t("taskExpectations.thenConfidence", { n: item.expectation_confidence })}
                  </div>
                  <div style={{ fontSize: 13, color: "#c8c8e0", fontStyle: "italic", lineHeight: 1.5 }}>
                    «{item.expectation_text}»
                  </div>
                  <Link href={entityHref("task", item.task_id)} style={{ fontSize: 11, color: "#4A90D9", textDecoration: "none" }}>
                    {t("taskExpectations.goToTask")} →
                  </Link>
                </div>
                <Textarea
                  label={t("taskExpectations.outcomeTextLabel")}
                  placeholder={t("taskExpectations.outcomeTextPlaceholder")}
                  value={st.text}
                  onChange={(e: any) => setState(item.id, { text: e.target.value })}
                  rows={2}
                />
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <label style={{ fontSize: 11, color: "#9999ad" }}>
                    {t("taskExpectations.outcomeConfidenceLabel")}: {st.confidence}%
                  </label>
                  <input type="range" min={0} max={100} step={5} value={st.confidence}
                    onChange={e => setState(item.id, { confidence: +e.target.value })}
                    style={{ width: "100%", accentColor: "#4A90D9" }} />
                </div>
                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                  <Button variant="ghost" onClick={() => dismiss.mutate(item.id)} disabled={dismiss.isPending}>
                    {t("taskExpectations.dismiss")}
                  </Button>
                  <Button variant="primary"
                    onClick={() => resolve.mutate({ id: item.id, outcome_confidence: st.confidence, outcome_text: st.text })}
                    disabled={resolve.isPending}>
                    {t("taskExpectations.resolve")}
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      </Modal>
    </>
  )
}
