"use client"
import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Check } from "lucide-react"
import { Modal } from "@/components/ui/modal"
import { feedApi } from "@/lib/api"
import { theme } from "@/lib/theme"
import { useTypeRu } from "@/lib/i18n/useTypeRu"
import { useT } from "@/lib/i18n/useT"
import { TargetTypePicker } from "./target-type-picker"
import { DestinationPicker } from "./destination-picker"

export function RepostModal({ sourceType, sourceId, sourceTitle, onClose }: {
  sourceType: string; sourceId: number; sourceTitle: string; onClose: () => void
}) {
  const t = useT()
  const typeRu = useTypeRu()
  const qc = useQueryClient()
  const [targetType, setTargetType] = useState(sourceType)
  const [target, setTarget] = useState<"personal" | "lab">("personal")
  const [labId, setLabId] = useState<number | null>(null)
  const [comment, setComment] = useState("")
  const [checkDate, setCheckDate] = useState("")
  const [done, setDone] = useState(false)

  const repost = useMutation({
    mutationFn: () => feedApi.repost({
      source_type: sourceType, source_id: sourceId,
      target_type: targetType, target,
      lab_id: target === "lab" ? labId : null,
      comment,
      expected_check_date: targetType === "prediction" ? new Date(checkDate).toISOString() : undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["feed"] })
      setDone(true)
      setTimeout(onClose, 1100)
    },
  })

  const canSubmit = (target === "personal" || (target === "lab" && !!labId))
    && (targetType !== "prediction" || !!checkDate)

  return (
    <Modal open onClose={onClose} title={t("feedCard.repost")} size="md">
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>

        <div style={{ padding: "10px 12px", borderRadius: 8, background: theme.bg2, border: `1px solid ${theme.ln1}` }}>
          <div style={{ fontSize: 10, color: theme.tx4, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>
            {t("repostModal.sourceRecord")} · {typeRu[sourceType]}
          </div>
          <div style={{ fontSize: 12.5, color: theme.tx2, lineHeight: 1.4 }}>{sourceTitle}</div>
        </div>

        <div>
          <div style={{ fontSize: 11, color: theme.tx3, fontWeight: 500, marginBottom: 8 }}>
            {t("repostModal.commentLabel")}
          </div>
          <textarea
            value={comment}
            onChange={e => setComment(e.target.value)}
            placeholder={t("repostModal.commentPlaceholder")}
            rows={3}
            style={{
              width: "100%", padding: "9px 12px", borderRadius: 8,
              border: `1px solid ${theme.ln2}`, background: theme.bg2,
              color: theme.tx1, fontSize: 13, outline: "none", resize: "vertical",
              fontFamily: "inherit", boxSizing: "border-box",
            }}
          />
        </div>

        <div>
          <div style={{ fontSize: 11, color: theme.tx3, fontWeight: 500, marginBottom: 8 }}>
            {t("repostModal.saveAs")}
          </div>
          <TargetTypePicker value={targetType} onChange={setTargetType} />
          {targetType !== sourceType && (
            <div style={{ fontSize: 11, color: theme.tx4, marginTop: 6 }}>
              {t("repostModal.typeChangeNotice")}
            </div>
          )}
          {targetType === "prediction" && (
            <div style={{ marginTop: 10 }}>
              <label style={{ display: "block", fontSize: 11, color: theme.tx3, fontWeight: 500, marginBottom: 6 }}>
                {t("repostModal.checkDateLabel")}
              </label>
              <input
                type="datetime-local" required value={checkDate}
                onChange={e => setCheckDate(e.target.value)}
                style={{
                  width: "100%", padding: "9px 12px", borderRadius: 8,
                  border: `1px solid ${theme.ln2}`, background: theme.bg2,
                  color: theme.tx1, fontSize: 13, outline: "none", boxSizing: "border-box",
                }}
              />
            </div>
          )}
        </div>

        <div>
          <div style={{ fontSize: 11, color: theme.tx3, fontWeight: 500, marginBottom: 8 }}>
            {t("repostModal.destination")}
          </div>
          <DestinationPicker target={target} labId={labId} onTargetChange={setTarget} onLabChange={setLabId} />
        </div>

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", paddingTop: 4 }}>
          <button onClick={onClose} style={{
            padding: "8px 16px", borderRadius: 8, border: `1px solid ${theme.ln2}`,
            background: "transparent", color: theme.tx3, fontSize: 12, cursor: "pointer",
          }}>{t("actions.cancel")}</button>
          <button
            onClick={() => repost.mutate()}
            disabled={!canSubmit || repost.isPending || done}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "8px 18px", borderRadius: 8, border: "none",
              background: done ? "#27AE60" : "#4A90D9",
              color: "#fff", fontSize: 12, fontWeight: 600,
              cursor: canSubmit && !repost.isPending ? "pointer" : "default",
              opacity: canSubmit ? 1 : 0.5,
            }}
          >
            {done ? <><Check size={13} /> {t("confirmPrediction.done")}</> : repost.isPending ? t("repostModal.reposting") : t("repostModal.repostAction")}
          </button>
        </div>
      </div>
    </Modal>
  )
}
