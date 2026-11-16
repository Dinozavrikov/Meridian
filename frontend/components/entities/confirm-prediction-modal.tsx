"use client"
import { useState, useEffect, useRef } from "react"
import { Modal } from "@/components/ui/modal"
import { Textarea } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Check, X, Minus } from "lucide-react"
import { ReflectionDialog, ReflectionFactorInput } from "./reflection-dialog"
import { ReflectionInsightPanel, ReflectionInsight } from "./reflection-insight-panel"
import { predApi } from "@/lib/api"
import { useT } from "@/lib/i18n/useT"
import { closeWarnings } from "@/lib/close-warnings"

export interface ConfirmPredictionTarget {
  id: number
  title?: string
  text?: string
  confidence?: number | null
  confirms_hypothesis_if_true?: boolean
  hypothesis_id?: number | null
}

type Step = "outcome" | "reflection" | "insight"
const POLL_INTERVAL_MS = 3000
const POLL_MAX_TRIES = 40  // ~2 минуты — локальная Ollama/Qwen может генерировать заметно дольше облачного Mistral

interface ConfirmPredictionModalProps {
  target: ConfirmPredictionTarget | null
  onClose: () => void
  onSave: (status: string, resultNotes: string) => Promise<any>
  isPending?: boolean
}

export function ConfirmPredictionModal({ target, onClose, onSave }: ConfirmPredictionModalProps) {
  const t = useT()
  // ВАЖНО: значения status ("подтвердился" и т.п.) уходят в API как есть —
  // это данные, не UI-текст. Переводим только label.
  const OUTCOMES = [
    { status: "подтвердился",          label: t("confirmPrediction.outcome.confirmed"), icon: Check, color: "#27AE60" },
    { status: "частично подтвердился", label: t("confirmPrediction.outcome.partial"),   icon: Minus, color: "#F5A623" },
    { status: "не подтвердился",       label: t("confirmPrediction.outcome.refuted"),   icon: X,     color: "#E74C3C" },
  ] as const

  const [step, setStep] = useState<Step>("outcome")
  const [status, setStatus] = useState<string | null>(null)
  const [notes, setNotes] = useState("")
  const [busy, setBusy] = useState(false)
  const [insight, setInsight] = useState<ReflectionInsight | null>(null)
  const [polling, setPolling] = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const warnings = target ? closeWarnings({ status, notes, confidence: target.confidence,
    confirms_hypothesis_if_true: target.confirms_hypothesis_if_true, hypothesis_id: target.hypothesis_id }) : []

  useEffect(() => {
    setStep("outcome"); setStatus(null); setNotes(""); setInsight(null); setPolling(false)
    if (pollRef.current) clearInterval(pollRef.current)
  }, [target?.id])

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current) }, [])

  if (!target) return null

  const reset = () => {
    setStep("outcome"); setStatus(null); setNotes(""); setInsight(null); setPolling(false)
    if (pollRef.current) clearInterval(pollRef.current)
  }

  const handleClose = () => { reset(); onClose() }

  const startPolling = () => {
    setPolling(true)
    let tries = 0
    pollRef.current = setInterval(async () => {
      tries += 1
      try {
        const rows = await predApi.listInsights(target.id, "resolution")
        if (rows?.length) {
          setInsight(rows[0]); setPolling(false)
          if (pollRef.current) clearInterval(pollRef.current)
          return
        }
      } catch { /* попробуем на следующем тике */ }
      if (tries >= POLL_MAX_TRIES) {
        setPolling(false)
        if (pollRef.current) clearInterval(pollRef.current)
      }
    }, POLL_INTERVAL_MS)
  }

  const handleSkipReflection = async () => {
    setBusy(true)
    try {
      await onSave(status!, notes)
      handleClose()
    } finally { setBusy(false) }
  }

  const handleSubmitReflection = async (factors: ReflectionFactorInput[], rawText: string) => {
    setBusy(true)
    try {
      await predApi.addReflection(target.id, { stage: "resolution", factors, raw_dialogue_text: rawText })
      await onSave(status!, notes)
      setStep("insight")
      startPolling()
    } finally { setBusy(false) }
  }

  return (
    <Modal open={!!target} onClose={handleClose} title={t("confirmPrediction.title")} size="md" preventClose={step === "insight"}>
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <div style={{ fontSize: 13, color: "#c0c0d8", lineHeight: 1.5 }}>
          {target.title || target.text?.slice(0, 140)}
        </div>

        {step === "outcome" && (
          <>
            <div>
              <div style={{ fontSize: 11, color: "#9696aa", marginBottom: 8 }}>{t("confirmPrediction.outcomeQuestion")}</div>
              <div style={{ display: "flex", gap: 8 }}>
                {OUTCOMES.map(o => {
                  const Icon = o.icon
                  const active = status === o.status
                  return (
                    <button key={o.status} type="button" onClick={() => setStatus(o.status)}
                      style={{
                        flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
                        padding: "10px 8px", borderRadius: 8, cursor: "pointer",
                        border: `1px solid ${active ? o.color + "70" : "#1e1e2c"}`,
                        background: active ? o.color + "18" : "#0d0d18",
                        color: active ? o.color : "#9898a7",
                        transition: "all 0.12s",
                      }}>
                      <Icon size={15} />
                      <span style={{ fontSize: 11, fontWeight: 600 }}>{o.label}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            <div>
              <div style={{ fontSize: 11, color: "#9696aa", marginBottom: 8 }}>{t("confirmPrediction.notesLabel")}</div>
              <Textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                rows={3}
                placeholder={t("confirmPrediction.notesPlaceholder")}
              />
            </div>

            {warnings.length > 0 && (
              <div data-testid="close-warnings" role="status" style={{ display: "flex", flexDirection: "column", gap: 4, padding: "8px 10px", borderRadius: 8, border: "1px solid #F5A62359", background: "#F5A6231a", fontSize: 12, color: "#F5A623" }}>
                {warnings.map(k => <div key={k}>{t(k)}</div>)}
              </div>
            )}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <Button variant="ghost" onClick={handleClose}>{t("actions.cancel")}</Button>
              <Button variant="primary" onClick={() => setStep("reflection")} disabled={!status}>
                {t("confirmPrediction.next")}
              </Button>
            </div>
          </>
        )}

        {step === "reflection" && (
          <ReflectionDialog
            stage="resolution"
            onSubmit={handleSubmitReflection}
            onSkip={handleSkipReflection}
            isPending={busy}
          />
        )}

        {step === "insight" && (
          <>
            <ReflectionInsightPanel
              insight={insight}
              loading={polling && !insight}
              emptyHint={t("confirmPrediction.emptyHint")}
              entityType="prediction"
              entityId={target.id}
            />
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <Button variant="primary" onClick={handleClose}>{t("confirmPrediction.done")}</Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}
