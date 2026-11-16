"use client"
// Единая модалка предпросмотра узла графа (глобальный, личный, лабораторный и локальный граф записи).
// Данные берёт /{type}/{id}/preview: сервер сам проверяет доступ (публичное, своё, лаборатория) и отдаёт чипы эффекта.
// Везде, где запись видит её автор или участники лабы, используется PreviewLink (ссылки React) и RichHtml
// (ссылки meridian:// в тексте) с проверкой доступа.
import { useQuery } from "@tanstack/react-query"
import Link from "next/link"
import { X } from "lucide-react"
import { resultApi } from "@/lib/api"
import { stripHtml } from "@/lib/strip-html"
import { safeEntityHref } from "@/lib/entity-routes"
import { typeColor, statusBadge, theme } from "@/lib/theme"
import { useTypeRu } from "@/lib/i18n/useTypeRu"
import { useStore } from "@/lib/store"
import { useTranslatedField } from "@/lib/i18n/useContentT"
import { useT } from "@/lib/i18n/useT"
import { EffectsBlock } from "@/components/entities/effects-block"
import { useEntityPreview } from "@/components/entities/use-entity-preview"

// абзацы результата не слипаются: границы блоков -> перенос строки до снятия тегов
const bodyToText = (html: string) =>
  stripHtml((html || "").replace(/<\/?(?:p|div|li|h[1-6]|blockquote)\b[^>]*>|<br\s*\/?>/gi, "\n")).replace(/\n{3,}/g, "\n\n").trim().slice(0, 280)

/** openRecord: показать кнопку «Открыть запись» (личный, лабораторный и локальный графы; в глобальном её нет). */
export function EntityPreviewModal({ type, id, onClose, openRecord = false }: { type: string; id: number; onClose: () => void; openRecord?: boolean }) {
  const t = useT()
  const typeRu = useTypeRu()
  const user = useStore(s => s.user)
  const isResult = type === "result"
  const preview = useEntityPreview(type, id, !isResult)
  const resultQ = useQuery({ queryKey: ["result-preview", id], queryFn: () => resultApi.get(id), enabled: isResult })
  const isLoading = isResult ? resultQ.isLoading : preview.isLoading
  const p = preview.data
  const r = resultQ.data
  const data = isResult
    ? (r ? { title: r.title, preview: bodyToText(r.body), status: null, author_username: r.owner_username, author_display: r.owner_display_name, effect: null, effects: [] } : undefined)
    : (p ? { title: p.title, preview: p.excerpt, status: p.status, author_username: p.author.username, author_display: p.author.display_name, effect: p.effect, effects: p.effects } : undefined)
  const isOwn = !!user && !!data && user.username === data.author_username
  const translatedTitle = useTranslatedField(type, id, "title", data?.title ?? "", isOwn)
  const translatedPreview = useTranslatedField(type, id, "preview", data?.preview ?? "", isOwn)
  const color = typeColor[type] ?? "#4A90D9"
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
      <div onClick={e => e.stopPropagation()} style={{ width: 400, maxWidth: "calc(100vw - 32px)", maxHeight: "calc(100vh - 32px)", overflowY: "auto", background: theme.bg1, border: `1px solid ${theme.ln2}`, borderLeft: `3px solid ${color}`, borderRadius: 12, padding: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
          <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color }}>{typeRu[type] ?? type}</span>
          <button onClick={onClose} style={{ background: "transparent", border: "none", color: theme.tx4, cursor: "pointer" }}><X size={16} /></button>
        </div>
        {isLoading ? (
          <div style={{ fontSize: 12, color: theme.tx4 }}>{t("preview.loading")}</div>
        ) : data ? (
          <>
            {data.title && <div style={{ fontSize: 15, fontWeight: 700, color: theme.tx1, marginBottom: 6 }}>{translatedTitle}</div>}
            {data.preview && <div style={{ fontSize: 13, color: theme.tx2, lineHeight: 1.5, marginBottom: 12, whiteSpace: "pre-line", overflowWrap: "anywhere" }}>{translatedPreview}</div>}
            {data.status && <span style={{ ...statusBadge(data.status), marginBottom: 12, display: "inline-block" }}>{data.status}</span>}
            <EffectsBlock type={type} effect={data.effect} effects={data.effects} />
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: 12, borderTop: `1px solid ${theme.ln1}`, marginBottom: 10 }}>
              <span style={{ fontSize: 12, color: theme.tx3 }}>{t("graphPreview.author", { name: data.author_display || data.author_username })}</span>
              <Link href={`/profile/${data.author_username}`} style={{ fontSize: 12, color, fontWeight: 600 }}>{t("graphPreview.openProfile")}</Link>
            </div>
            {openRecord && !isResult && (
              <Link href={safeEntityHref(type, id)} onClick={onClose} style={{
                display: "flex", alignItems: "center", justifyContent: "center", gap: 6, marginBottom: 8,
                fontSize: 12.5, fontWeight: 600, color, background: `${color}12`, border: `1px solid ${color}40`,
                borderRadius: 8, padding: "9px 0", textDecoration: "none",
              }}>
                {t("nodePreviewModal.openRecord")}
              </Link>
            )}
            {!isResult && (
              <Link href={`/feed/discussion/${type}/${id}`} style={{
                display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                fontSize: 12.5, fontWeight: 600, color: "#fff", background: color,
                borderRadius: 8, padding: "9px 0", textDecoration: "none",
              }}>
                {t("graphPreview.openDiscussion")}
              </Link>
            )}
          </>
        ) : (
          <div style={{ fontSize: 12, color: theme.tx4 }}>{t("preview.unavailable")}</div>
        )}
      </div>
    </div>
  )
}
