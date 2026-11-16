"use client"
import { useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Check } from "lucide-react"
import { Modal } from "@/components/ui/modal"
import { commentRepostApi, resolveMediaUrl } from "@/lib/api"
import { theme } from "@/lib/theme"
import { TargetTypePicker } from "@/components/feed/target-type-picker"
import { DestinationPicker } from "@/components/feed/destination-picker"
import { isImageUrl, getYouTubeId, getVimeoId } from "@/lib/embed-utils"
import { useT } from "@/lib/i18n/useT"

function extractAttachments(text: string): string[] {
  return text.split("\n").map(l => l.trim()).filter(l => l && (isImageUrl(l) || getYouTubeId(l) || getVimeoId(l)))
}

export function CommentRepostModal({ commentId, content, authorName, onClose }: {
  commentId: number; content: string; authorName: string; onClose: () => void
}) {
  const t = useT()
  const qc = useQueryClient()
  const attachments = extractAttachments(content)
  const [targetType, setTargetType] = useState("observation")
  const [target, setTarget] = useState<"personal" | "lab">("personal")
  const [labId, setLabId] = useState<number | null>(null)
  const [comment, setComment] = useState("")
  const [checkDate, setCheckDate] = useState("")
  const [keepAttachments, setKeepAttachments] = useState(true)
  const [done, setDone] = useState(false)

  const repost = useMutation({
    mutationFn: () => commentRepostApi.repost({
      comment_id: commentId, target_type: targetType, target,
      lab_id: target === "lab" ? labId : null, comment, keep_attachments: keepAttachments,
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
    <Modal open onClose={onClose} title={t("commentRepostModal.title")} size="md">
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>

        <div style={{ padding: "10px 12px", borderRadius: 8, background: theme.bg2, border: `1px solid ${theme.ln1}` }}>
          <div style={{ fontSize: 10, color: theme.tx4, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>
            {t("commentRepostModal.sourceLabel", { author: authorName })}
          </div>
          <div style={{ fontSize: 12.5, color: theme.tx2, lineHeight: 1.4 }}>{content.split("\n")[0] || "…"}</div>
        </div>

        {attachments.length > 0 && (
          <div>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: theme.tx2, cursor: "pointer" }}>
              <input type="checkbox" checked={keepAttachments} onChange={e => setKeepAttachments(e.target.checked)} />
              {t("commentRepostModal.keepAttachments", { count: attachments.length })}
            </label>
            <div style={{ display: "flex", gap: 6, marginTop: 8, opacity: keepAttachments ? 1 : 0.35 }}>
              {attachments.filter(isImageUrl).map((a, i) => (
                <img key={i} src={resolveMediaUrl(a) ?? a} alt="" style={{ width: 44, height: 44, borderRadius: 6, objectFit: "cover" }} />
              ))}
              {attachments.some(a => getYouTubeId(a) || getVimeoId(a)) && (
                <div style={{ fontSize: 11, color: theme.tx4, alignSelf: "center" }}>{t("commentRepostModal.videoNotice")}</div>
              )}
            </div>
          </div>
        )}

        <div>
          <div style={{ fontSize: 11, color: theme.tx3, fontWeight: 500, marginBottom: 8 }}>{t("commentRepostModal.commentLabel")}</div>
          <textarea value={comment} onChange={e => setComment(e.target.value)} rows={2}
            style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: `1px solid ${theme.ln2}`, background: theme.bg2, color: theme.tx1, fontSize: 13, resize: "vertical" }} />
        </div>

        <div>
          <div style={{ fontSize: 11, color: theme.tx3, fontWeight: 500, marginBottom: 8 }}>{t("commentRepostModal.saveAs")}</div>
          <TargetTypePicker value={targetType} onChange={setTargetType} />
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
          <div style={{ fontSize: 11, color: theme.tx3, fontWeight: 500, marginBottom: 8 }}>{t("commentRepostModal.destination")}</div>
          <DestinationPicker target={target} labId={labId} onTargetChange={setTarget} onLabChange={setLabId} />
        </div>

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{ padding: "8px 16px", borderRadius: 8, border: `1px solid ${theme.ln2}`, background: "transparent", color: theme.tx3, fontSize: 12 }}>{t("actions.cancel")}</button>
          <button onClick={() => repost.mutate()} disabled={!canSubmit || repost.isPending || done}
            style={{
              display: "flex", alignItems: "center", gap: 6, padding: "8px 18px", borderRadius: 8, border: "none",
              background: done ? "#27AE60" : "#4A90D9", color: "#fff", fontSize: 12, fontWeight: 600,
              opacity: canSubmit ? 1 : 0.5,
            }}>
            {done ? <><Check size={13} /> {t("commentRepostModal.done")}</> : repost.isPending ? t("commentRepostModal.reposting") : t("commentRepostModal.repostAction")}
          </button>
        </div>
      </div>
    </Modal>
  )
}
