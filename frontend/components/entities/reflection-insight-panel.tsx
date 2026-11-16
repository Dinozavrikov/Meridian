"use client"
import { useState } from "react"
import { useMutation } from "@tanstack/react-query"
import { Loader2, ArrowRight, Plus, Minus, MessageCircleQuestion, AlertTriangle, RotateCw, Sparkles } from "lucide-react"
import { discussionApi } from "@/lib/api"
import { reflectionApiFor, ReflectionEntityType } from "@/lib/reflection-api"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/input"
import { useT } from "@/lib/i18n/useT"
import { ink, theme } from "@/lib/theme"
import { readableOn } from "@/lib/color"

export interface ReflectionInsight {
  id: number
  matched: { factor_before: string; factor_after: string; shift: string }[]
  added: string[]
  dropped: string[]
  insight: string
}

interface ReflectionInsightPanelProps {
  insight: ReflectionInsight | null | undefined
  loading?: boolean
  /** сравнение не удалось (ИИ недоступен): вместо вывода — сообщение и «Повторить» */
  error?: boolean
  onRetry?: () => void
  emptyHint?: string
  entityType?: ReflectionEntityType
  entityId?: number
}

const BLUE = "#4A90D9"
const GREEN = "#27AE60"
const RED = "#E74C3C"
const AMBER = "#F5A623"

const card: React.CSSProperties = { borderRadius: 12, background: ink.card, border: `1px solid ${ink.line}`, boxSizing: "border-box", minWidth: 0 }

function FollowupQuestion({ entityType, entityId, insightId }: { entityType: ReflectionEntityType; entityId: number; insightId: number }) {
  const t = useT()
  const [answer, setAnswer] = useState("")
  const [saved, setSaved] = useState(false)
  const reflectionApi = reflectionApiFor(entityType)

  const askQuestion = useMutation({
    mutationFn: () => reflectionApi.reflectionQuestion(entityId, insightId),
  })
  const saveAnswer = useMutation({
    mutationFn: () => discussionApi.post(entityType, entityId, { content: answer, source: "reflection_followup" }),
    onSuccess: () => setSaved(true),
  })

  if (saved) {
    return <div style={{ fontSize: 13, color: readableOn(GREEN) }}>{t("reflectionInsight.savedNote")}</div>
  }

  if (!askQuestion.data?.question) {
    return (
      <Button variant="ghost" size="sm" onClick={() => askQuestion.mutate()} disabled={askQuestion.isPending}>
        <MessageCircleQuestion size={14} />
        {askQuestion.isPending ? t("reflectionInsight.thinkingQuestion") : t("reflectionInsight.helpFormulate")}
      </Button>
    )
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ fontSize: 13, color: ink.label, fontStyle: "italic", lineHeight: 1.55 }}>{askQuestion.data.question}</div>
      <Textarea value={answer} onChange={e => setAnswer(e.target.value)} rows={2} placeholder={t("reflectionInsight.answerPlaceholder")} />
      <Button variant="primary" size="sm" onClick={() => saveAnswer.mutate()} disabled={!answer.trim() || saveAnswer.isPending} className="self-start">
        {saveAnswer.isPending ? t("reflectionDialog.saving") : t("reflectionInsight.saveConclusion")}
      </Button>
    </div>
  )
}

function FactorList({ title, items, color, icon }: { title: string; items: string[]; color: string; icon: React.ReactNode }) {
  return (
    <div style={{ flex: "1 1 200px", minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, color: readableOn(color), marginBottom: 8 }}>
        {icon}{title}
      </div>
      <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 6 }}>
        {items.map((x, i) => (
          <li key={i} style={{ fontSize: 13, lineHeight: 1.5, color: "#d6d9ec", padding: "6px 10px", borderRadius: 8, background: `${color}14`, border: `1px solid ${color}33`, overflowWrap: "anywhere" }}>{x}</li>
        ))}
      </ul>
    </div>
  )
}

export function ReflectionInsightPanel({ insight, loading, error, onRetry, emptyHint, entityType, entityId }: ReflectionInsightPanelProps) {
  const t = useT()

  if (loading) {
    return (
      <div role="status" style={{ ...card, display: "flex", alignItems: "center", gap: 10, padding: "14px 16px", color: ink.label, fontSize: 13 }}>
        <Loader2 size={15} className="animate-spin" />
        {t("reflectionInsight.comparing")}
      </div>
    )
  }

  if (error) {
    return (
      <div role="alert" style={{ ...card, display: "flex", alignItems: "center", flexWrap: "wrap", gap: 12, padding: "14px 16px", borderColor: `${AMBER}55`, background: `${AMBER}10` }}>
        <AlertTriangle size={16} aria-hidden style={{ color: readableOn(AMBER), flexShrink: 0 }} />
        <span style={{ flex: "1 1 220px", minWidth: 0, fontSize: 13, lineHeight: 1.5, color: "#d6d9ec" }}>{t("reflectionInsight.error")}</span>
        {onRetry && (
          <Button variant="ghost" size="sm" onClick={onRetry}>
            <RotateCw size={13} />{t("reflectionInsight.retry")}
          </Button>
        )}
      </div>
    )
  }

  if (!insight) {
    return (
      <div style={{ ...card, padding: "14px 16px", color: ink.muted, fontSize: 13 }}>
        {emptyHint || t("reflectionInsight.nothingToCompare")}
      </div>
    )
  }

  const hasMatched = insight.matched.length > 0
  const hasAdded = insight.added.length > 0
  const hasDropped = insight.dropped.length > 0

  return (
    <div style={{ ...card, display: "flex", flexDirection: "column", gap: 16, padding: 16 }}>
      {insight.insight && (
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <span aria-hidden style={{ width: 24, height: 24, borderRadius: 7, background: `${BLUE}1f`, color: readableOn(BLUE), display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Sparkles size={13} />
            </span>
            <h4 style={{ margin: 0, fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: readableOn(BLUE) }}>
              {t("reflectionInsight.title")}
            </h4>
          </div>
          <div style={{ fontSize: 14, color: theme.tx1, lineHeight: 1.7, overflowWrap: "anywhere" }}>{insight.insight}</div>
        </div>
      )}

      {hasMatched && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {insight.matched.map((m, i) => (
            <div key={i} style={{ padding: "10px 12px", borderRadius: 10, background: ink.well, border: `1px solid ${ink.line}`, display: "flex", flexDirection: "column", gap: 4 }}>
              <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8, fontSize: 13, color: "#d6d9ec" }}>
                <span>{m.factor_before}</span>
                <ArrowRight size={13} aria-hidden style={{ flexShrink: 0, color: readableOn(BLUE) }} />
                <span>{m.factor_after}</span>
              </div>
              {m.shift && <div style={{ fontSize: 12, color: ink.muted, lineHeight: 1.5 }}>{m.shift}</div>}
            </div>
          ))}
        </div>
      )}

      {(hasAdded || hasDropped) && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
          {hasAdded && <FactorList title={t("reflectionInsight.added")} items={insight.added} color={GREEN} icon={<Plus size={13} />} />}
          {hasDropped && <FactorList title={t("reflectionInsight.dropped")} items={insight.dropped} color={RED} icon={<Minus size={13} />} />}
        </div>
      )}

      {entityType && entityId && (
        <div style={{ paddingTop: 12, borderTop: `1px solid ${ink.line}` }}>
          <FollowupQuestion entityType={entityType} entityId={entityId} insightId={insight.id} />
        </div>
      )}
    </div>
  )
}
