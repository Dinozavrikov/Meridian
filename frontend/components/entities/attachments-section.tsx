"use client"
import { askConfirmText } from "@/lib/confirm"
import { useState, useRef, type CSSProperties } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { attachmentApi, resolveMediaUrl } from "@/lib/api"
import { theme, v2, parseEntityDate } from "@/lib/theme"
import { useT } from "@/lib/i18n/useT"
import { sanitizeHtml } from "@/lib/sanitize-html"
import {
  formatFileSize, highlightToHtml, MAX_ATTACHMENT_MB, CODE_LANGUAGE_OPTIONS,
  type EntityAttachment, type EntityAttachmentDetail, type EntityAttachmentVersion,
} from "@/lib/attachments"
import {
  Upload, Loader2, Trash2, Download, Copy, Check, ChevronRight, ChevronDown,
  FileCode, FileText, FileArchive, File as FileIcon,
  RefreshCw, History, Pencil, X, Save, Undo2,
} from "lucide-react"

const CSS = `
@keyframes _attspin{to{transform:rotate(360deg)}}
.att-code .hljs-comment,.att-code .hljs-quote{color:rgba(226,224,219,0.42);font-style:italic}
.att-code .hljs-keyword,.att-code .hljs-selector-tag,.att-code .hljs-doctag{color:${v2.violet}}
.att-code .hljs-string,.att-code .hljs-regexp,.att-code .hljs-addition{color:${v2.teal}}
.att-code .hljs-number,.att-code .hljs-literal,.att-code .hljs-symbol,.att-code .hljs-bullet{color:${v2.amber}}
.att-code .hljs-title,.att-code .hljs-section,.att-code .hljs-attr,.att-code .hljs-attribute,.att-code .hljs-name{color:${theme.accent}}
.att-code .hljs-built_in,.att-code .hljs-type,.att-code .hljs-meta,.att-code .hljs-variable,.att-code .hljs-template-variable{color:${v2.amber}}
.att-code .hljs-deletion{color:${v2.red}}
.att-code .hljs-emphasis{font-style:italic}
.att-code .hljs-strong{font-weight:600}
`

const iconBtn: CSSProperties = {
  display: "inline-flex", alignItems: "center", justifyContent: "center",
  width: 26, height: 26, borderRadius: 6, background: "transparent",
  border: "none", color: theme.tx3, cursor: "pointer", textDecoration: "none",
}

function KindIcon({ att }: { att: EntityAttachment }) {
  const props = { size: 16, color: theme.tx3 }
  if (att.kind === "code") return <FileCode {...props} />
  if (att.kind === "document") return <FileText {...props} />
  if (att.mime_type === "application/zip") return <FileArchive {...props} />
  return <FileIcon {...props} />
}

function AttachmentViewer({ att, entityType, entityId, isOwner, onSaved }: {
  att: EntityAttachment
  entityType: string
  entityId: number
  isOwner: boolean
  onSaved: () => void
}) {
  const t = useT()
  const [copied, setCopied] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState("")
  const [draftLanguage, setDraftLanguage] = useState<string | null>(null)

  const detail = useQuery<EntityAttachmentDetail>({
    queryKey: ["entity-attachment", att.id],
    queryFn: () => attachmentApi.get(att.id),
  })
  const text = detail.data?.text_content ?? null

  // Содержимое вложения теперь МОЖЕТ меняться при том же id (PUT .../file,
  // .../text, restore версии) — size_bytes меняется при любой такой замене,
  // поэтому включаем его в ключ подсветки: старый HTML не переживёт смену
  // контента даже при неизменном language. Раньше здесь было "вложения
  // неизменяемы (id ↔ содержимое)" — это допущение перестало быть верным
  // с версионированием (26.09), баг найден и закрыт здесь же.
  const highlighted = useQuery<string | null>({
    queryKey: ["entity-attachment-html", att.id, att.language, att.size_bytes],
    queryFn: () => highlightToHtml(text as string, att.language),
    enabled: text !== null && !editing,
    staleTime: Infinity,
  })

  const saveMutation = useMutation({
    mutationFn: () => attachmentApi.replaceText(
      entityType, entityId, att.id, draft, att.kind === "code" ? draftLanguage : undefined,
    ),
    onSuccess: () => { setEditing(false); onSaved() },
  })

  if (detail.isLoading) {
    return <div style={{ padding: "10px 14px", fontSize: 12, color: theme.tx3 }}>{t("attachmentsTab.viewLoading")}</div>
  }
  if (detail.isError || text === null) {
    return <div style={{ padding: "10px 14px", fontSize: 12, color: "#E74C3C" }}>{t("attachmentsTab.viewError")}</div>
  }

  const lines = text.split("\n")
  if (text.endsWith("\n")) lines.pop()
  const html = highlighted.data ?? null

  async function copy() {
    try {
      await navigator.clipboard.writeText(text as string)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // буфер обмена недоступен (http-контекст / нет прав) — молча
    }
  }

  function startEditing() {
    setDraft(text as string)
    setDraftLanguage(att.language)
    setEditing(true)
  }

  if (editing) {
    return (
      <div style={{ borderTop: `1px solid ${theme.ln2}`, padding: 10 }}>
        {att.kind === "code" && (
          <select
            value={draftLanguage ?? ""}
            onChange={e => setDraftLanguage(e.target.value || null)}
            style={{
              marginBottom: 8, fontSize: 12, padding: "4px 6px", borderRadius: 6,
              border: `1px solid ${theme.ln2}`, background: theme.bg0, color: theme.tx1,
            }}
          >
            {CODE_LANGUAGE_OPTIONS.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
        )}
        <textarea
          value={draft}
          onChange={e => setDraft(e.target.value)}
          rows={Math.min(24, Math.max(6, lines.length))}
          style={{
            width: "100%", boxSizing: "border-box", fontFamily: theme.mono, fontSize: 12,
            lineHeight: "18px", color: theme.tx1, background: theme.bg0,
            border: `1px solid ${theme.ln2}`, borderRadius: 6, padding: 10, resize: "vertical",
          }}
        />
        {saveMutation.isError && (
          <div style={{ fontSize: 12, color: "#E74C3C", marginTop: 6 }}>{t("attachmentsTab.saveError")}</div>
        )}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 8 }}>
          <button type="button" onClick={() => setEditing(false)} disabled={saveMutation.isPending}
            style={{ ...iconBtn, width: "auto", padding: "0 10px", gap: 5, fontSize: 12 }}>
            <X size={13} />{t("attachmentsTab.cancel")}
          </button>
          <button type="button" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}
            style={{ ...iconBtn, width: "auto", padding: "0 10px", gap: 5, fontSize: 12, color: theme.accent }}>
            <Save size={13} />{t("attachmentsTab.save")}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ borderTop: `1px solid ${theme.ln2}` }}>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 4, padding: "6px 10px" }}>
        {isOwner && (
          <button type="button" onClick={startEditing}
            style={{ ...iconBtn, width: "auto", padding: "0 8px", gap: 5, fontSize: 11 }}>
            <Pencil size={12} />{t("attachmentsTab.edit")}
          </button>
        )}
        <button type="button" onClick={copy}
          style={{ ...iconBtn, width: "auto", padding: "0 8px", gap: 5, fontSize: 11 }}>
          {copied ? <Check size={12} /> : <Copy size={12} />}
          {copied ? t("attachmentsTab.copied") : t("attachmentsTab.copy")}
        </button>
      </div>
      <div className="att-code" style={{
        display: "flex", background: theme.bg0, maxHeight: 420, overflow: "auto",
        fontFamily: theme.mono, fontSize: 12, lineHeight: "18px", color: theme.tx1,
      }}>
        <pre data-testid="att-gutter" aria-hidden="true" style={{
          margin: 0, padding: "10px 8px 10px 12px", textAlign: "right", color: theme.tx3,
          userSelect: "none", flexShrink: 0, position: "sticky", left: 0, background: theme.bg0,
        }}>{lines.map((_, i) => i + 1).join("\n")}</pre>
        <pre style={{ margin: 0, padding: "10px 12px", flex: 1, minWidth: 0 }}>
          {html
            ? <code data-testid="att-code" dangerouslySetInnerHTML={{ __html: sanitizeHtml(html) }} />
            : <code data-testid="att-code">{text}</code>}
        </pre>
      </div>
    </div>
  )
}

function VersionsPanel({ att, entityType, entityId, isOwner, onRestored }: {
  att: EntityAttachment
  entityType: string
  entityId: number
  isOwner: boolean
  onRestored: () => void
}) {
  const t = useT()
  const versions = useQuery<EntityAttachmentVersion[]>({
    queryKey: ["entity-attachment-versions", att.id],
    queryFn: () => attachmentApi.listVersions(entityType, entityId, att.id),
  })
  const restoreMutation = useMutation({
    mutationFn: (versionId: number) => attachmentApi.restoreVersion(entityType, entityId, att.id, versionId),
    onSuccess: onRestored,
  })

  if (versions.isLoading) {
    return <div style={{ padding: "10px 14px", fontSize: 12, color: theme.tx3, borderTop: `1px solid ${theme.ln2}` }}>{t("attachmentsTab.versionsLoading")}</div>
  }
  if (versions.isError) {
    return <div style={{ padding: "10px 14px", fontSize: 12, color: "#E74C3C", borderTop: `1px solid ${theme.ln2}` }}>{t("attachmentsTab.versionsLoadError")}</div>
  }
  const list = versions.data ?? []
  if (list.length === 0) {
    return <div style={{ padding: "10px 14px", fontSize: 12, color: theme.tx3, borderTop: `1px solid ${theme.ln2}` }}>{t("attachmentsTab.versionsEmpty")}</div>
  }

  return (
    <div style={{ borderTop: `1px solid ${theme.ln2}` }}>
      {list.map(v => {
        const date = parseEntityDate(v.superseded_at)
        const label = date
          ? date.toLocaleString("ru-RU", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })
          : v.superseded_at
        return (
          <div key={v.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 14px", fontSize: 12 }}>
            <div style={{ flex: 1, minWidth: 0, color: theme.tx3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              <span style={{ color: theme.tx1 }}>{v.filename}</span>
              {" · "}{label}{" · "}{formatFileSize(v.size_bytes, t)}
            </div>
            <a href={resolveMediaUrl(v.download_url) ?? "#"} download={v.filename} rel="noopener"
              aria-label={t("attachmentsTab.download")} title={t("attachmentsTab.download")} style={iconBtn}>
              <Download size={13} />
            </a>
            {isOwner && (
              <button type="button" style={iconBtn}
                aria-label={t("attachmentsTab.restore")} title={t("attachmentsTab.restore")}
                disabled={restoreMutation.isPending}
                onClick={async () => { if (await askConfirmText(t("attachmentsTab.confirmRestore"), t("confirm.restore"), "default")) restoreMutation.mutate(v.id) }}>
                <Undo2 size={13} />
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}

export function AttachmentsSection({ entityType, entityId, isOwner = true }: {
  entityType: string
  entityId: number
  isOwner?: boolean
}) {
  const t = useT()
  const qc = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const replaceInputRef = useRef<HTMLInputElement>(null)
  const [replaceTargetId, setReplaceTargetId] = useState<number | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [openId, setOpenId] = useState<number | null>(null)
  const [openVersionsId, setOpenVersionsId] = useState<number | null>(null)
  const [uploadErrors, setUploadErrors] = useState<string[]>([])
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null)
  const listKey = ["entity-attachments", entityType, entityId]

  const { data, isLoading, isError } = useQuery<EntityAttachment[]>({
    queryKey: listKey,
    queryFn: () => attachmentApi.list(entityType, entityId),
  })
  const items = data ?? []

  function invalidateAttachment(attachmentId: number) {
    qc.invalidateQueries({ queryKey: listKey })
    qc.invalidateQueries({ queryKey: ["entity-attachment", attachmentId] })
    qc.invalidateQueries({ queryKey: ["entity-attachment-versions", attachmentId] })
  }

  const uploadMutation = useMutation({
    // Строго по одному файлу на запрос (см. attachmentApi.upload): ошибка одного
    // файла не отменяет остальные, причины собираем и показываем списком.
    mutationFn: async (files: File[]) => {
      const errors: string[] = []
      for (let i = 0; i < files.length; i++) {
        setProgress({ current: i + 1, total: files.length })
        try {
          await attachmentApi.upload(entityType, entityId, [files[i]])
        } catch (e) {
          const detail = (e as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail
          errors.push(t("attachmentsTab.uploadErrorItem", {
            name: files[i].name,
            reason: typeof detail === "string" ? detail : t("attachmentsTab.uploadError"),
          }))
        }
      }
      return errors
    },
    onSuccess: errors => setUploadErrors(errors),
    onSettled: () => {
      setProgress(null)
      qc.invalidateQueries({ queryKey: listKey })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (attachmentId: number) => attachmentApi.delete(entityType, entityId, attachmentId),
    onSuccess: (_r, attachmentId) => {
      if (openId === attachmentId) setOpenId(null)
      if (openVersionsId === attachmentId) setOpenVersionsId(null)
      qc.invalidateQueries({ queryKey: listKey })
    },
  })

  const replaceFileMutation = useMutation({
    mutationFn: ({ attachmentId, file }: { attachmentId: number; file: File }) =>
      attachmentApi.replaceFile(entityType, entityId, attachmentId, file),
    onSuccess: (_r, { attachmentId }) => invalidateAttachment(attachmentId),
  })

  function handleFiles(fileList: FileList | File[] | null) {
    if (!fileList || fileList.length === 0) return
    setUploadErrors([])
    uploadMutation.mutate(Array.from(fileList))
  }

  function handleReplaceFile(file: File | null) {
    if (!file || replaceTargetId === null) return
    replaceFileMutation.mutate({ attachmentId: replaceTargetId, file })
  }

  return (
    <div style={{ padding: "16px 20px" }}>
      <style>{CSS}</style>

      {isOwner && (
        <div
          onDragOver={e => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files) }}
          onClick={() => fileInputRef.current?.click()}
          style={{
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            border: `1.5px dashed ${dragOver ? theme.accent : "#242438"}`,
            borderRadius: 8, padding: "18px", cursor: "pointer",
            background: dragOver ? "rgba(74,144,217,0.06)" : "transparent",
            transition: "border-color 0.15s, background 0.15s", marginBottom: 16,
          }}
        >
          <input ref={fileInputRef} type="file" multiple hidden
            onChange={e => { handleFiles(e.target.files); e.target.value = "" }} />
          {progress ? (
            <>
              <Loader2 size={16} style={{ animation: "_attspin 0.8s linear infinite" }} color={theme.tx3} />
              <span style={{ fontSize: 12, color: theme.tx3 }}>
                {t("attachmentsTab.uploadingProgress", { current: progress.current, total: progress.total })}
              </span>
            </>
          ) : (
            <>
              <Upload size={16} color={theme.tx3} />
              <span style={{ fontSize: 12, color: theme.tx3 }}>
                {t("attachmentsTab.dropHint", { max: MAX_ATTACHMENT_MB })}
              </span>
            </>
          )}
        </div>
      )}

      {isOwner && (
        <input ref={replaceInputRef} type="file" hidden
          onChange={e => { handleReplaceFile(e.target.files?.[0] ?? null); e.target.value = "" }} />
      )}

      {uploadErrors.length > 0 && (
        <div style={{ fontSize: 12, color: "#E74C3C", marginBottom: 12 }}>
          {uploadErrors.map((msg, i) => <div key={i}>{msg}</div>)}
        </div>
      )}
      {replaceFileMutation.isError && (
        <div style={{ fontSize: 12, color: "#E74C3C", marginBottom: 12 }}>{t("attachmentsTab.replaceError")}</div>
      )}

      {isLoading ? (
        <div style={{ fontSize: 12, color: theme.tx3 }}>{t("attachmentsTab.loading")}</div>
      ) : isError ? (
        <div style={{ fontSize: 12, color: "#E74C3C" }}>{t("attachmentsTab.loadError")}</div>
      ) : items.length === 0 ? (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, padding: "24px 0", color: theme.tx3 }}>
          <FileIcon size={20} />
          <span style={{ fontSize: 12 }}>{t("attachmentsTab.empty")}</span>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {items.map(att => {
            const open = openId === att.id
            const versionsOpen = openVersionsId === att.id
            const badge = att.kind === "code"
              ? (att.language ?? "code")
              : att.kind === "document" ? t("attachmentsTab.kindDocument") : t("attachmentsTab.kindOther")
            return (
              <div key={att.id} style={{ border: `1px solid ${theme.ln2}`, borderRadius: 8, background: theme.bg1, overflow: "hidden" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px" }}>
                  <KindIcon att={att} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, color: theme.tx1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {att.filename}
                    </div>
                    <div style={{ fontSize: 11, color: theme.tx3, display: "flex", gap: 8, marginTop: 2 }}>
                      <span>{badge}</span>
                      <span>{formatFileSize(att.size_bytes, t)}</span>
                      {!att.has_text_content && <span>{t("attachmentsTab.downloadOnly")}</span>}
                    </div>
                  </div>
                  {att.has_text_content && (
                    <button type="button" style={iconBtn}
                      aria-label={open ? t("attachmentsTab.hide") : t("attachmentsTab.view")}
                      title={open ? t("attachmentsTab.hide") : t("attachmentsTab.view")}
                      onClick={() => setOpenId(open ? null : att.id)}>
                      {open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                    </button>
                  )}
                  <a href={resolveMediaUrl(att.download_url) ?? "#"} download={att.filename} rel="noopener"
                    aria-label={t("attachmentsTab.download")} title={t("attachmentsTab.download")} style={iconBtn}>
                    <Download size={14} />
                  </a>
                  {isOwner && (
                    <button type="button" style={iconBtn}
                      aria-label={t("attachmentsTab.replace")} title={t("attachmentsTab.replace")}
                      disabled={replaceFileMutation.isPending && replaceFileMutation.variables?.attachmentId === att.id}
                      onClick={() => { setReplaceTargetId(att.id); replaceInputRef.current?.click() }}>
                      <RefreshCw size={13} />
                    </button>
                  )}
                  <button type="button" style={iconBtn}
                    aria-label={versionsOpen ? t("attachmentsTab.hideVersions") : t("attachmentsTab.showVersions")}
                    title={versionsOpen ? t("attachmentsTab.hideVersions") : t("attachmentsTab.showVersions")}
                    onClick={() => setOpenVersionsId(versionsOpen ? null : att.id)}>
                    <History size={13} />
                  </button>
                  {isOwner && (
                    <button type="button" style={iconBtn}
                      aria-label={t("attachmentsTab.delete")} title={t("attachmentsTab.delete")}
                      disabled={deleteMutation.isPending && deleteMutation.variables === att.id}
                      onClick={async () => { if (await askConfirmText(t("attachmentsTab.confirmDelete"))) deleteMutation.mutate(att.id) }}>
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
                {open && att.has_text_content && (
                  <AttachmentViewer att={att} entityType={entityType} entityId={entityId} isOwner={isOwner}
                    onSaved={() => invalidateAttachment(att.id)} />
                )}
                {versionsOpen && (
                  <VersionsPanel att={att} entityType={entityType} entityId={entityId} isOwner={isOwner}
                    onRestored={() => invalidateAttachment(att.id)} />
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
