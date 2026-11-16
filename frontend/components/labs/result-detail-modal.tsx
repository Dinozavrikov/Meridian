"use client"
// Детальный просмотр Result: тело документа, публикация (owner/admin, только
// из visibility=="lab" — см. results.py publish_result), список предложенных
// правок с клиентским диффом (сам диф нигде не хранится, только полное
// proposed_body — см. решение в сессии по Result), форма "предложить правку"
// для участников лабы, accept/reject для owner/admin.
import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { diffWords } from "diff"
import { Check, X as XIcon, Send, Globe2, Lock, Users, Link2, ExternalLink, BookMarked } from "lucide-react"
import { resultApi, resolveHtmlImages, API_BASE_URL } from "@/lib/api"
import { Modal } from "@/components/ui/modal"
import { Button } from "@/components/ui/button"
import { RichTextEditor } from "@/components/entities/rich-text-editor"
import { RichHtml } from "@/components/entities/rich-html"
import { ResultSourcePicker } from "@/components/labs/result-source-picker"
import { v2 } from "@/lib/theme"
import { TYPE_RU } from "@/lib/utils"
import { useT } from "@/lib/i18n/useT"
import { stripHtml } from "@/lib/strip-html"
import { sanitizeHtml } from "@/lib/sanitize-html"
import { useStore } from "@/lib/store"
import { isOwner } from "@/lib/ownership"
import { useTranslatedField } from "@/lib/i18n/useContentT"
import { toast } from "@/lib/toast"
import { scheduleDelete, cancelDelete, commitDelete, DELETE_SAFETY_MS } from "@/lib/deferred-delete"
import { invalidateLabCard } from "@/lib/lab-queries"

function DiffView({ oldText, newText }: { oldText: string; newText: string }) {
  const parts = diffWords(stripHtml(oldText || ""), stripHtml(newText || ""))
  return (
    <div style={{ fontSize: 12.5, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
      {parts.map((p: any, i: number) => (
        <span key={i} style={{
          background: p.added ? "#2ECC7122" : p.removed ? "#E74C3C22" : "transparent",
          color: p.added ? "#2ECC71" : p.removed ? "#E74C3C" : v2.t2,
          textDecoration: p.removed ? "line-through" : "none",
        }}>{p.value}</span>
      ))}
    </div>
  )
}

export function ResultDetailModal({ resultId, onClose, canManage, isMember, labIsPublic }: {
  resultId: number | null; onClose: () => void; canManage: boolean; isMember: boolean; labIsPublic: boolean
}) {
  const t = useT()
  const qc = useQueryClient()
  const user = useStore(s => s.user)
  const [proposedBody, setProposedBody] = useState("")
  const [showProposeForm, setShowProposeForm] = useState(false)
  const [showSourcePicker, setShowSourcePicker] = useState(false)

  const { data: res } = useQuery({
    queryKey: ["results", resultId],
    queryFn: () => resultApi.get(resultId as number),
    enabled: !!resultId,
  })
  // ВАЖНО: здесь нельзя просто завернуть весь res в useTranslatedEntityQuery
  // — res.body используется не только для чтения, но и как база диффа
  // с proposed_body, и подставляется как исходный текст в форму правки
  // (см. ниже setProposedBody(res.body)). Перевод нужен ТОЛЬКО для
  // read-only рендера — отсюда отдельные displayTitle/displayBody, а не
  // подмена res.body целиком.
  const isOwnResult = isOwner(user, res)
  const displayTitle = useTranslatedField("result", res?.id ?? 0, "title", res?.title ?? "", isOwnResult || !res)
  const displayBody = useTranslatedField("result", res?.id ?? 0, "body", res?.body ?? "", isOwnResult || !res)
  const { data: suggestions = [] } = useQuery({
    queryKey: ["results", resultId, "suggestions"],
    queryFn: () => resultApi.listSuggestions(resultId as number),
    enabled: !!resultId,
  })
  const { data: linkedSources = [] } = useQuery({
    queryKey: ["results", resultId, "sources", "linked"],
    queryFn: () => resultApi.listLinkedSources(resultId as number),
    enabled: !!resultId,
  })

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["results", resultId] })
    qc.invalidateQueries({ queryKey: ["results", resultId, "suggestions"] })
    qc.invalidateQueries({ queryKey: ["results", resultId, "sources"] })
    qc.invalidateQueries({ queryKey: ["results", "lab"] })
  }

  const publish = useMutation({
    mutationFn: () => resultApi.publish(resultId as number),
    onSuccess: invalidate,
  })
  const unpublish = useMutation({
    mutationFn: () => resultApi.unpublish(resultId as number),
    onSuccess: invalidate,
  })
  const unlink = useMutation({
    mutationFn: (linkId: number) => resultApi.unlinkSource(resultId as number, linkId),
    onSuccess: invalidate,
  })
  const propose = useMutation({
    mutationFn: () => resultApi.createSuggestion(resultId as number, proposedBody),
    onSuccess: () => { invalidate(); setShowProposeForm(false); setProposedBody("") },
  })
  const accept = useMutation({
    mutationFn: (sid: number) => resultApi.acceptSuggestion(resultId as number, sid),
    onSuccess: invalidate,
  })
  const reject = useMutation({
    mutationFn: (sid: number) => resultApi.rejectSuggestion(resultId as number, sid),
    onSuccess: invalidate,
  })

  if (!resultId || !res) return null

  const pendingSuggestions = suggestions.filter((s: any) => s.status === "pending")
  const publishHint = !labIsPublic && (
    <div style={{
      display: "flex", alignItems: "flex-start", gap: 6, padding: "6px 8px",
      borderRadius: 6, background: `${v2.t3}14`, fontSize: 10.5, color: v2.t3, lineHeight: 1.4,
    }}>
      <Lock size={11} style={{ marginTop: 1, flexShrink: 0 }} />
      <span>{t("results.publishNote")}</span>
    </div>
  )

  // Результат = то, чем поделились: удаляется только личный черновик (сервер: 409 для остального). Откат: DELETE уходит, когда тост закрылся без «Вернуть».
  const draftId = resultId as number
  const canDeleteDraft = isOwner(user, res) && res.visibility === "private"
  const removeDraft = () => {
    const key = `result:${draftId}`
    const refresh = () => qc.invalidateQueries({ queryKey: ["results", "lab"] })
    const scheduled = scheduleDelete(key, {
      run: () => resultApi.delete(draftId),
      delayMs: DELETE_SAFETY_MS,
      leave: () => { void fetch(`${API_BASE_URL}/api/v1/results/${draftId}`, { method: "DELETE", credentials: "include", keepalive: true }) },
      onSettled: ok => { refresh(); void invalidateLabCard(qc, res.lab_id); if (!ok) toast({ message: t("results.deleteFailed"), tone: "error" }) },
    })
    if (!scheduled) return
    qc.setQueriesData<any[]>({ queryKey: ["results", "lab"] }, old => Array.isArray(old) ? old.filter(r => r.id !== draftId) : old)
    onClose()
    toast({ message: t("results.deleted"), tone: "info",
      onClose: reason => { if (reason === "closed") commitDelete(key) },
      undo: { run: async () => {
        if (!cancelDelete(key)) throw new Error("delete already sent")
        refresh()
      } } })
  }

  return (
    <Modal open={!!resultId} onClose={onClose} title={displayTitle} size="lg">
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, color: v2.t3 }}>
          {res.visibility === "private" ? (
            <><Lock size={12} /> {t("visibility.private")}</>
          ) : (
            <><Users size={12} /> {t("visibility.lab")}</>
          )}
          {res.is_published && labIsPublic && <><Globe2 size={12} style={{ marginLeft: 8 }} /> {t("results.published")}</>}
        </div>

        <RichHtml html={resolveHtmlImages(sanitizeHtml(displayBody))} accent="#4A90D9" className="result-body-html" muted={v2.t3}
                style={{ fontSize: 13.5, color: v2.t1, lineHeight: 1.6 }} />

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: v2.t2, display: "flex", alignItems: "center", gap: 5 }}>
              <BookMarked size={12} /> {t("results.sourcesLabel")}
            </div>
            {isOwner(user, res) && (
              <button type="button" onClick={() => setShowSourcePicker(true)}
                style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10.5, fontWeight: 600, color: "#4A90D9", background: "none", border: "none", cursor: "pointer" }}>
                <Link2 size={11} /> {t("results.sourcesAttachButton")}
              </button>
            )}
          </div>
          {linkedSources.length === 0 ? (
            <div style={{ fontSize: 11.5, color: v2.t3 }}>{t("results.sourcesEmpty")}</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {linkedSources.map((l: any) => (
                <div key={l.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "7px 10px", borderRadius: 7, background: v2.bg, border: `1px solid ${v2.bd}` }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <a href={l.source.url} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: v2.t1, textDecoration: "none", display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {l.source.title || l.source.url}
                    </a>
                    <div style={{ fontSize: 10, color: v2.t3, marginTop: 2 }}>
                      {t("results.sourcesPickerFrom", { type: TYPE_RU[l.origin.entity_type] ?? l.origin.entity_type, name: l.origin.entity_name })}
                    </div>
                  </div>
                  {isOwner(user, res) && (
                    <button type="button" onClick={() => unlink.mutate(l.id)} disabled={unlink.isPending}
                      style={{ flexShrink: 0, background: "none", border: "none", color: v2.t3, cursor: "pointer", display: "flex" }}>
                      <XIcon size={12} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
        {showSourcePicker && (
          <ResultSourcePicker resultId={resultId as number} open={showSourcePicker} onClose={() => setShowSourcePicker(false)} />
        )}

        {canManage && res.visibility === "lab" && !res.is_published && (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <Button variant="primary" onClick={() => publish.mutate()} disabled={publish.isPending}>
              {t("results.publish")}
            </Button>
            {publishHint}
          </div>
        )}
        {canManage && res.is_published && (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <Button variant="ghost" onClick={() => unpublish.mutate()} disabled={unpublish.isPending}>
              {t("results.unpublish")}
            </Button>
            {publishHint}
          </div>
        )}

        {pendingSuggestions.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: v2.t2 }}>{t("results.suggestionsLabel")}</div>
            {pendingSuggestions.map((s: any) => (
              <div key={s.id} style={{ padding: "12px 14px", borderRadius: 10, background: v2.bg, border: `1px solid ${v2.bd}` }}>
                <DiffView oldText={res.body} newText={s.proposed_body} />
                {canManage && (
                  <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                    <button onClick={() => accept.mutate(s.id)} disabled={accept.isPending}
                      style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10.5, fontWeight: 600, padding: "4px 8px", borderRadius: 5, border: "1px solid #2ECC7140", background: "#2ECC7114", color: "#2ECC71", cursor: "pointer" }}>
                      <Check size={11} /> {t("labTabs.attach")}
                    </button>
                    <button onClick={() => reject.mutate(s.id)} disabled={reject.isPending}
                      style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10.5, fontWeight: 600, padding: "4px 8px", borderRadius: 5, border: "1px solid #E74C3C40", background: "#E74C3C14", color: "#E74C3C", cursor: "pointer" }}>
                      <XIcon size={11} /> {t("labTabs.reject")}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {isMember && !showProposeForm && (
          <button onClick={() => { setShowProposeForm(true); setProposedBody(res.body) }}
            style={{
              width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
              padding: 10, borderRadius: 10, cursor: "pointer",
              background: "transparent", border: `1px dashed ${v2.bd2}`, color: v2.t3,
              fontSize: 11.5, fontWeight: 600,
            }}>
            <Send size={13} /> {t("results.proposeEdit")}
          </button>
        )}

        {showProposeForm && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <RichTextEditor value={proposedBody} onChange={setProposedBody} entityType="result" entityId={resultId} />
            <DiffView oldText={res.body} newText={proposedBody} />
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <Button type="button" variant="ghost" onClick={() => setShowProposeForm(false)}>{t("actions.cancel")}</Button>
              <Button type="button" variant="primary" onClick={() => propose.mutate()} disabled={propose.isPending}>
                {t("actions.save")}
              </Button>
            </div>
          </div>
        )}
        {canDeleteDraft && (
          <Button type="button" variant="ghost" onClick={removeDraft}>{t("results.delete")}</Button>
        )}
      </div>
    </Modal>
  )
}
