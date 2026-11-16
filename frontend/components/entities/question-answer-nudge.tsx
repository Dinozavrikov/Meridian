"use client"
import { useState, useEffect } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Button } from "@/components/ui/button"
import { PillButton } from "@/components/ui/pill-button"
import { Lightbulb, X, Check } from "lucide-react"
import { useT } from "@/lib/i18n/useT"
import { questionAnswerApi, QuestionAnswerItem } from "@/lib/question-answer-api"

interface QuestionAnswerNudgeProps {
  questionId: number
  accent: string
  isOwner: boolean
}

/**
 * Аналог ContradictionNudge, но для другой задачи: "может ли что-то из
 * твоего же корпуса (Наблюдения/Гипотезы/Прогнозы) отвечать на этот
 * открытый вопрос?" (см. backend/app/services/question_answers.py).
 * Явный клик по кнопке — та же философия "не автотриггер", что у
 * ContradictionNudge — но здесь ЕЩЁ есть фоновые находки (implicit,
 * найденные при сохранении других сущностей), поэтому при заходе на
 * страницу подгружаем уже накопленные pending-записи по этому вопросу,
 * а не только те, что появились от явного клика в этой сессии.
 */
export function QuestionAnswerNudge({ questionId, accent, isOwner }: QuestionAnswerNudgeProps) {
  const t = useT()
  const qc = useQueryClient()
  const [verdicts, setVerdicts] = useState<Record<number, "accepted" | "rejected">>({})
  const [clicked, setClicked] = useState(false)

  // Уже накопленные pending-находки по этому вопросу — включая фоновые
  // (implicit), появившиеся при сохранении других записей пользователя.
  const { data: pending = [] } = useQuery({
    queryKey: ["question-answer-pending", questionId],
    queryFn: () => questionAnswerApi.listPending(),
    select: (all) => all.filter(item => item.question_id === questionId),
    enabled: isOwner,
  })

  const check = useMutation({
    mutationFn: () => questionAnswerApi.check(questionId),
    onSuccess: () => {
      setClicked(true)
      qc.invalidateQueries({ queryKey: ["question-answer-pending", questionId] })
    },
  })

  const setVerdict = useMutation({
    mutationFn: ({ feedbackId, verdict }: { feedbackId: number; verdict: "accepted" | "rejected" }) =>
      questionAnswerApi.setVerdict(feedbackId, verdict),
    onSuccess: (_data, vars) => {
      setVerdicts(prev => ({ ...prev, [vars.feedbackId]: vars.verdict }))
      qc.invalidateQueries({ queryKey: ["question-answer-pending", questionId] })
      // При "accepted" бэкенд сам пишет заметку в entity_comments (см.
      // set_answer_verdict в questions.py) — но NotesTimeline держит
      // отдельный кэш ["comments", "question", questionId], который эта
      // мутация не трогает по умолчанию. Без инвалидации заметка появится
      // только после ручного рефреша страницы.
      if (vars.verdict === "accepted") {
        qc.invalidateQueries({ queryKey: ["comments", "question", questionId] })
      }
    },
  })

  const visible = pending.filter(item => !verdicts[item.feedback_id])

  if (!isOwner) return null

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {visible.length === 0 && (
        <PillButton onClick={() => check.mutate()} disabled={check.isPending}>
          {check.isPending ? t("questionAnswerNudge.checkingButton") : t("questionAnswerNudge.checkButton")}
        </PillButton>
      )}

      {clicked && check.isSuccess && visible.length === 0 && (
        <div style={{ fontSize: 12, color: "#9999ad" }}>{t("questionAnswerNudge.noneFound")}</div>
      )}

      {visible.map(item => (
        <div key={item.feedback_id} style={{
          display: "flex", flexDirection: "column", gap: 8, padding: "10px 14px",
          borderRadius: 8, background: `${accent}10`, border: `1px solid ${accent}30`,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Lightbulb size={14} style={{ color: accent, flexShrink: 0 }} />
            <span style={{ fontSize: 11, color: accent, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>
              {t("questionAnswerNudge.possibleAnswer")}
            </span>
            <span style={{ fontSize: 11, color: "#9696aa", marginLeft: "auto" }}>{item.confidence}%</span>
          </div>
          <div style={{ fontSize: 12, color: "#9090b8", lineHeight: 1.4 }}>
            «{item.quote}»
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <Button variant="ghost" size="sm" onClick={() => setVerdict.mutate({ feedbackId: item.feedback_id, verdict: "accepted" })}>
              <Check size={12} /> {t("questionAnswerNudge.accept")}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setVerdict.mutate({ feedbackId: item.feedback_id, verdict: "rejected" })}>
              <X size={12} /> {t("questionAnswerNudge.reject")}
            </Button>
          </div>
        </div>
      ))}
    </div>
  )
}
