"use client"
import { useMemo, useState, type CSSProperties } from "react"
import Link from "next/link"
import { useQuery } from "@tanstack/react-query"
import { Download, ExternalLink, File as FileIcon, FileArchive, FileCode, FileText } from "lucide-react"
import { useT } from "@/lib/i18n/useT"
import { useStore } from "@/lib/store"
import { theme, v2, typeColor, formatEntityStamp } from "@/lib/theme"
import { formatFileSize } from "@/lib/attachments"
import { LC_CSS, card, chip, muted } from "@/components/labs/lab-checkpoints-style"
import { labFilesApi, labFilesKey, type LabFile } from "@/lib/lab-files-api"
import { entityFilesHref, fileHref, filterLabFiles, groupByEntity, thumbSrc, typeCounts } from "@/lib/lab-files-view"
import { TYPE_PLURAL_KEYS, typeLabel } from "@/lib/lab-checkpoints-view"

type Mode = "recent" | "entity"

const ellipsis: CSSProperties = { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }

/** Вкладка «Файлы» лаборатории — только участникам. Обзор файлов и картинок всех живых записей лаборатории
 *  с привязкой к записи. Загрузка, замена и версии — на странице самой записи (вкладка «Файлы»). */
export function LabFilesTab({ labId }: { labId: number }) {
  const t = useT()
  const locale = useStore(s => s.locale)
  const [type, setType] = useState("all")
  const [query, setQuery] = useState("")
  const [mode, setMode] = useState<Mode>("recent")

  const q = useQuery({
    queryKey: labFilesKey(labId),
    queryFn: () => labFilesApi.list(labId),
    staleTime: 0,
    refetchOnMount: "always",
  })
  const all = useMemo(() => q.data?.items ?? [], [q.data])
  const counts = useMemo(() => typeCounts(all), [all])
  const shown = useMemo(() => filterLabFiles(all, { type, query }), [all, type, query])
  const groups = useMemo(() => (mode === "entity" ? groupByEntity(shown) : []), [shown, mode])

  const stampOf = (raw: string) => formatEntityStamp(raw, locale)?.day ?? ""

  const entityChip = (f: { entity_type: string; entity_id: number; entity_title: string }) => {
    const href = entityFilesHref(f)
    const color = (typeColor as unknown as Record<string, string>)[f.entity_type] ?? v2.t2
    const label = `${typeLabel(t, f.entity_type)} · ${f.entity_title || `#${f.entity_id}`}`
    const style: CSSProperties = { ...chip, color, maxWidth: "100%", minWidth: 0, textDecoration: "none" }
    const text = <span style={ellipsis}>{label}</span>
    return href
      ? <Link href={href} title={t("labFiles.row.toEntity")} style={style}>{text}</Link>
      : <span style={style}>{text}</span>
  }

  const renderFile = (f: LabFile, withEntity: boolean) => {
    const href = fileHref(f)
    const thumb = thumbSrc(f)
    const Icon = f.file_kind === "code" ? FileCode : f.file_kind === "document" ? FileText
      : f.mime_type === "application/zip" ? FileArchive : FileIcon
    return (
      <div key={`${f.kind}:${f.id}`} data-testid="lab-file-row"
        style={{ ...card, flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <div style={{
          width: 44, height: 44, flexShrink: 0, borderRadius: 8, overflow: "hidden", background: v2.bg,
          border: `1px solid ${v2.bd}`, display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          {f.kind === "image" && thumb
            ? <img src={thumb} alt={f.name} style={{ width: 44, height: 44, objectFit: "cover", display: "block" }} />
            : <Icon size={18} color={theme.tx3} />}
        </div>
        <div style={{ flex: "1 1 220px", minWidth: 0 }}>
          <div style={{ ...ellipsis, fontSize: 13, fontWeight: 600, color: v2.t1 }} title={f.name}>{f.name}</div>
          <div style={muted}>
            {formatFileSize(f.size_bytes ?? 0, t)}
            {" · "}
            {t("labFiles.row.uploadedBy", { name: f.uploader_username ?? t("labFiles.row.uploaderUnknown") })}
            {" · "}{stampOf(f.created_at)}
          </div>
        </div>
        {withEntity && <div style={{ maxWidth: "100%", minWidth: 0, display: "flex" }}>{entityChip(f)}</div>}
        {href && (f.kind === "image"
          ? <a className="lc-link" href={href} target="_blank" rel="noopener noreferrer"><ExternalLink size={12} />{t("labFiles.row.open")}</a>
          : <a className="lc-link" href={href} download><Download size={12} />{t("labFiles.row.download")}</a>)}
      </div>
    )
  }

  const noFiles = !q.isLoading && !q.isError && all.length === 0

  return (
    <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 20 }}>
      <style>{LC_CSS}</style>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, color: v2.t1 }}>{t("labFiles.title")}</h2>
        <p style={{ ...muted, fontSize: 13, color: v2.t2, maxWidth: 760 }}>{t("labFiles.intro")}</p>
        {q.data && all.length > 0 && (
          <div style={muted}>{t("labFiles.summary", { n: q.data.count, size: formatFileSize(q.data.total_bytes, t) })}</div>
        )}
      </div>

      {q.isLoading && <div style={muted}>{t("labFiles.loading")}</div>}
      {q.isError && (
        <div style={muted}>
          {t("labFiles.loadError")}{" "}
          <button type="button" className="lc-link" onClick={() => q.refetch()}>{t("labFiles.retry")}</button>
        </div>
      )}
      {noFiles && <div style={{ ...muted, maxWidth: 560 }}>{t("labFiles.empty")}</div>}

      {all.length > 0 && (
        <>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <input value={query} onChange={e => setQuery(e.target.value)} placeholder={t("labFiles.search.placeholder")}
              style={{ flex: "1 1 240px", minWidth: 0 }} />
            <button type="button" className={`lc-btn${mode === "recent" ? " lc-on" : ""}`} aria-pressed={mode === "recent"}
              onClick={() => setMode("recent")}>{t("labFiles.view.recent")}</button>
            <button type="button" className={`lc-btn${mode === "entity" ? " lc-on" : ""}`} aria-pressed={mode === "entity"}
              onClick={() => setMode("entity")}>{t("labFiles.view.byEntity")}</button>
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" className={`lc-btn${type === "all" ? " lc-on" : ""}`} aria-pressed={type === "all"}
              onClick={() => setType("all")}>{t("labFiles.filter.all")} · {all.length}</button>
            {counts.map(([tp, n]) => (
              <button key={tp} type="button" className={`lc-btn${type === tp ? " lc-on" : ""}`} aria-pressed={type === tp}
                onClick={() => setType(tp)}>
                {TYPE_PLURAL_KEYS[tp] ? t(TYPE_PLURAL_KEYS[tp]) : tp} · {n}
              </button>
            ))}
          </div>

          {shown.length === 0 && <div style={muted}>{t("labFiles.noMatch")}</div>}

          {mode === "recent" && shown.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>{shown.map(f => renderFile(f, true))}</div>
          )}

          {mode === "entity" && groups.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {groups.map(g => (
                <section key={g.key} data-testid="lab-file-group" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <div style={{ minWidth: 0, maxWidth: "100%", display: "flex" }}>{entityChip(g)}</div>
                    <span style={muted}>{t("labFiles.group.count", { n: g.files.length })}</span>
                  </div>
                  {g.files.map(f => renderFile(f, false))}
                </section>
              ))}
            </div>
          )}

          {q.data?.truncated && <div style={muted}>{t("labFiles.truncated", { n: all.length, total: q.data.count })}</div>}
        </>
      )}
    </div>
  )
}
