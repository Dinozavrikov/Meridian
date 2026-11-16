"use client"
import { useState } from "react"
import { useMutation } from "@tanstack/react-query"
import { Button } from "@/components/ui/button"
import { ActionButton } from "@/components/ui/action-button"
import { AlertTriangle, X, Check, ShieldCheck } from "lucide-react"
import { useT } from "@/lib/i18n/useT"
import { contradictionApi, ContradictionEntityType, ContradictionItem } from "@/lib/contradiction-api"
import { ink, theme, v2 } from "@/lib/theme"

interface ContradictionNudgeProps {
  entityType: ContradictionEntityType
  entityId: number
  text: string
  accent: string
  isOwner: boolean
}

/**
 * Полоса «Противоречия» для Observation/Hypothesis/Prediction/Worldview — единственное место выбора
 * конкретной сущности снаружи (см. contradiction-api.ts). Явный клик, не авто-триггер на каждое
 * сохранение: проверка либо нужна сейчас, либо не нужна. Состояние всегда видно в самой полосе:
 * не запускалась / ничего не найдено / найдено N.
 */
export function ContradictionNudge({ entityType, entityId, text, accent, isOwner }: ContradictionNudgeProps) {
  const t = useT()
  const [results, setResults] = useState<ContradictionItem[] | null>(null)
  const [verdicts, setVerdicts] = useState<Record<number, "accepted" | "rejected">>({})

  const check = useMutation({
    mutationFn: () => contradictionApi.check(entityType, entityId, text),
    onSuccess: (data) => setResults(data),
  })

  const setVerdict = useMutation({
    mutationFn: ({ feedbackId, verdict }: { feedbackId: number; verdict: "accepted" | "rejected" }) =>
      contradictionApi.setVerdict(feedbackId, verdict),
    // После вердикта по ПОСЛЕДНЕМУ оставшемуся пункту возвращаемся в исходное состояние — иначе
    // кнопка проверки оставалась скрытой навсегда (results !== null). Чисто локальный сброс state.
    onSuccess: (_data, vars) => {
      setVerdicts(prev => {
        const next = { ...prev, [vars.feedbackId]: vars.verdict }
        const allResolved = (results ?? []).every(item => next[item.feedback_id])
        if (allResolved) {
          setResults(null)
          return {}
        }
        return next
      })
    },
  })

  // Не-владельцу нечего разбирать в чужих противоречиях; серверная проверка дублируется в
  // /api/v1/contradictions/check на случай прямого вызова API.
  if (!isOwner && results === null) return null

  const open = (results ?? []).filter(item => !verdicts[item.feedback_id])
  const canRun = isOwner && (results === null || results.length === 0)
  const failed = check.isError && results === null
  const status = failed
    ? t("contradictionNudge.failed")
    : results === null
      ? t("contradictionNudge.notChecked")
      : results.length === 0
        ? t("contradictionNudge.noneFound")
        : t("contradictionNudge.found", { n: open.length })

  return (
    <section aria-label={t("contradictionNudge.title")} style={{
      display: "flex", flexDirection: "column", gap: 10, padding: "10px 12px",
      border: `1px solid ${open.length > 0 ? `${accent}55` : ink.line}`, background: ink.well, borderRadius: 10,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <ShieldCheck size={18} style={{ flexShrink: 0, color: open.length > 0 ? accent : ink.muted }} />
        <div style={{ flex: 1, minWidth: 0, fontSize: 13, lineHeight: 1.4 }}>
          <span style={{ fontWeight: 600, color: theme.tx1 }}>{t("contradictionNudge.title")}</span>
          <span style={{ color: failed ? v2.red : ink.muted }}> · {status}</span>
        </div>
        {canRun && (
          <ActionButton size="sm" disabled={check.isPending} onClick={() => check.mutate()}>
            {check.isPending
              ? t("contradictionNudge.checkingButton")
              : results === null ? t("contradictionNudge.runShort") : t("contradictionNudge.recheck")}
          </ActionButton>
        )}
      </div>

      {open.map(item => (
        <div key={item.feedback_id} style={{
          display: "flex", flexDirection: "column", gap: 8, padding: "10px 14px",
          borderRadius: 8, background: `${accent}10`, border: `1px solid ${accent}30`,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <AlertTriangle size={14} style={{ color: accent, flexShrink: 0 }} />
            <span style={{ fontSize: 12, color: accent, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>{item.relation}</span>
            <span style={{ fontSize: 12, color: ink.muted, marginLeft: "auto" }}>{item.confidence}%</span>
          </div>
          <div style={{ fontSize: 13, color: ink.label, lineHeight: 1.5 }}>
            <div style={{ color: ink.muted, fontSize: 12, marginBottom: 2 }}>{t("contradictionNudge.existing")}</div>
            «{item.existing_quote}»
          </div>
          <div style={{ fontSize: 13, color: ink.label, lineHeight: 1.5 }}>
            <div style={{ color: ink.muted, fontSize: 12, marginBottom: 2 }}>{t("contradictionNudge.newOne")}</div>
            «{item.new_quote}»
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <Button variant="ghost" size="sm" onClick={() => setVerdict.mutate({ feedbackId: item.feedback_id, verdict: "accepted" })}>
              <Check size={12} /> {t("contradictionNudge.accept")}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setVerdict.mutate({ feedbackId: item.feedback_id, verdict: "rejected" })}>
              <X size={12} /> {t("contradictionNudge.reject")}
            </Button>
          </div>
        </div>
      ))}
    </section>
  )
}
