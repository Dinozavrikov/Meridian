"use client"
import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { hypApi } from "@/lib/api"
import { createLinksFor, type PendingLink } from "./entity-link-picker"
import { getLinkTypes } from "@/components/entities/link-types"
import { Modal } from "@/components/ui/modal"
import { Button } from "@/components/ui/button"
import { ActionButton } from "@/components/ui/action-button"
import { useT } from "@/lib/i18n/useT"
import { Sparkles, Loader2 } from "lucide-react"

interface Suggestion {
  observation_id: number
  title: string
  text_snippet: string
  suggested_link_type: "подтверждает" | "опровергает" | "связано"
  quote: string | null
  already_linked_to: { id: number; name: string }[]
}

/**
 * По требованию (кнопка), не в фоне — та же дисциплина, что у
 * ContradictionNudge/ReflectionNudge: LLM-классификация не бесплатна,
 * и патернализм (автоматическое предложение без спроса) противоречит
 * принципам проекта. Модель никогда не решает за пользователя — дефолт
 * "связано" применяется по умолчанию везде, кроме случаев, где сама
 * подсказка backend'а прислала направленную связь с цитатой (см.
 * classify_observation_relations). Итоговый link_type пользователь
 * может поменять перед подтверждением, привязка — только пакетно и
 * только по явному клику.
 */
export function SuggestedObservationsButton({ hypothesisId }: { hypothesisId: number }) {
  const t = useT()
  const qc = useQueryClient()
  const linkTypes = getLinkTypes(t)
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState<Record<number, string>>({})

  const query = useQuery({
    queryKey: ["suggested-observations", hypothesisId],
    queryFn: () => hypApi.suggestedObservations(hypothesisId),
    enabled: open,
  })

  const confirm = useMutation({
    mutationFn: async () => {
      const links: PendingLink[] = Object.entries(selected).map(([obsId, linkType]) => ({
        type: "observation", id: Number(obsId), title: "", link_type: linkType,
      }))
      await createLinksFor("hypothesis", hypothesisId, links)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["related", "hypothesis", hypothesisId] })
      qc.invalidateQueries({ queryKey: ["evidence-diversity", hypothesisId] })
      setOpen(false)
      setSelected({})
    },
  })

  const toggle = (s: Suggestion) => {
    setSelected(prev => {
      const next = { ...prev }
      if (s.observation_id in next) delete next[s.observation_id]
      else next[s.observation_id] = s.suggested_link_type
      return next
    })
  }

  const suggestions: Suggestion[] = query.data ?? []
  const selectedCount = Object.keys(selected).length

  return (
    <>
      <ActionButton icon={<Sparkles size={14} />} onClick={() => setOpen(true)}>{t("suggestedObservations.button")}</ActionButton>

      <Modal open={open} onClose={() => setOpen(false)} title={t("suggestedObservations.title")} size="lg">
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ fontSize: 12, color: "#9999ad", lineHeight: 1.5 }}>
            {t("suggestedObservations.hint")}
          </div>

          {query.isLoading && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#9999ad", fontSize: 12, padding: "14px 0" }}>
              <Loader2 size={14} className="animate-spin" /> {t("suggestedObservations.loading")}
            </div>
          )}

          {!query.isLoading && suggestions.length === 0 && (
            <div style={{ fontSize: 12, color: "#9999a9", padding: "14px 0" }}>
              {t("suggestedObservations.empty")}
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 10, maxHeight: 420, overflowY: "auto" }}>
            {suggestions.map(s => {
              const isSelected = s.observation_id in selected
              const currentType = selected[s.observation_id]
              return (
                <div key={s.observation_id} style={{
                  padding: "12px 14px", borderRadius: 8, background: isSelected ? "#4A90D90c" : "#0d0d18",
                  border: `1px solid ${isSelected ? "#4A90D940" : "#1e1e2c"}`, display: "flex", flexDirection: "column", gap: 8,
                }}>
                  <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer" }}>
                    <input type="checkbox" checked={isSelected} onChange={() => toggle(s)} style={{
                      /* Глобальный стиль input{width:100%;padding;border;background}
                         не исключает type=checkbox — без явного сброса чекбокс
                         растягивается в закруглённый прямоугольник на всю ширину
                         (тот же баг, незамеченный, есть в comment-repost-modal.tsx).
                         Инлайн-стили перебивают правило из globals.css. */
                      width: 16, height: 16, padding: 0, marginTop: 3, flexShrink: 0,
                      background: "initial", border: "initial", borderRadius: "initial",
                      accentColor: "#4A90D9", cursor: "pointer",
                    }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, color: "#e0e0e0", marginBottom: 2 }}>{s.title}</div>
                      <div style={{ fontSize: 11.5, color: "#9999ad", lineHeight: 1.4 }}>{s.text_snippet}</div>
                      {s.quote && (
                        <div style={{ fontSize: 11, color: "#a0a0b8", fontStyle: "italic", marginTop: 4 }}>«{s.quote}»</div>
                      )}
                      {s.already_linked_to.length > 0 && (
                        <div style={{ fontSize: 10.5, color: "#9999a9", marginTop: 4 }}>
                          {t("suggestedObservations.alreadyLinkedTo")}: {s.already_linked_to.map(h => h.name).join(", ")}
                        </div>
                      )}
                    </div>
                  </label>
                  {isSelected && (
                    <div style={{ display: "flex", gap: 6, paddingLeft: 24 }}>
                      {linkTypes.map(lt => (
                        <button key={lt.value} type="button"
                          onClick={() => setSelected(p => ({ ...p, [s.observation_id]: lt.value }))}
                          style={{
                            fontSize: 10.5, padding: "3px 10px", borderRadius: 14,
                            border: `1px solid ${currentType === lt.value ? lt.color : "#222232"}`,
                            background: currentType === lt.value ? `${lt.color}18` : "transparent",
                            color: currentType === lt.value ? lt.color : "#9696a4",
                            cursor: "pointer", fontWeight: currentType === lt.value ? 600 : 400,
                          }}>
                          {lt.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, paddingTop: 8, borderTop: "1px solid #1e1e2c" }}>
            <Button variant="ghost" onClick={() => setOpen(false)}>{t("actions.cancel")}</Button>
            <Button variant="primary" onClick={() => confirm.mutate()} disabled={selectedCount === 0 || confirm.isPending}>
              {confirm.isPending ? t("reflectionDialog.saving") : t("suggestedObservations.confirmButton", { n: selectedCount })}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  )
}
