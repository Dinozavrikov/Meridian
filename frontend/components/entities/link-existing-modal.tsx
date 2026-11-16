"use client"
// frontend/components/entities/link-existing-modal.tsx
//
// Generic "Привязать существующее" — параметризованная версия LinkModal
// из relations-panel.tsx. Вынесена отдельно, т.к. набор типов связи
// (linkTypes) не универсален: для большинства пар это confirms/refutes/
// related (getLinkTypes), а для Worldview — своя шкала "влияния"
// (WORLDVIEW_INFLUENCE). Параметризация вместо ветвления внутри одного
// компонента — иначе LinkModal обрастает if/else на каждый новый случай.
import { useState, useEffect } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Search, X, Plus } from "lucide-react"
import { api } from "@/lib/api"
import { typeColor } from "@/lib/theme"
import { useTypeRu } from "@/lib/i18n/useTypeRu"
import { useT } from "@/lib/i18n/useT"
import { useContentT } from "@/lib/i18n/useContentT"
import { announceLinkChange } from "@/lib/link-undo"

export interface LinkTypeOption {
  value: string
  label: string
  color: string
}

interface LinkExistingModalProps {
  entityType: string
  entityId: number
  onlyType: string
  linkTypes: LinkTypeOption[]
  defaultLinkType: string
  onClose: () => void
  invalidateKey?: (string | number)[]
}

export function LinkExistingModal({
  entityType, entityId, onlyType, linkTypes, defaultLinkType, onClose, invalidateKey,
}: LinkExistingModalProps) {
  const t = useT()
  const typeRu = useTypeRu()
  const qc = useQueryClient()
  const [q, setQ] = useState("")
  const [linkType, setLinkType] = useState(defaultLinkType)

  const { data: results = [] } = useQuery({
    queryKey: ["link-search", q, onlyType],
    queryFn: () => api.get(`/api/v1/graph/search?q=${encodeURIComponent(q)}&exclude_type=${entityType}&exclude_id=${entityId}&only_type=${onlyType}`).then(r => r.data),
    enabled: q.length >= 1,
  })

  // Смешанные типы в результатах поиска — группируем ensure() по реальному
  // item.type каждого элемента (см. entity-link-picker.tsx, тот же паттерн).
  const { ct, ensure } = useContentT()
  const resultsIdsKey = results.map((i: any) => `${i.type}:${i.id}`).join(",")
  useEffect(() => {
    const items = results
      .filter((i: any) => !i.is_own && i.title)
      .map((i: any) => ({ entityType: i.type, entityId: i.id, field: "title", text: i.title }))
    ensure(items)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resultsIdsKey])
  const tTitle = (item: any) => item.is_own ? item.title : ct(item.type, item.id, "title", item.title)

  const refresh = () => {
    qc.invalidateQueries({ queryKey: invalidateKey ?? ["related", entityType, entityId] })
    qc.invalidateQueries({ queryKey: ["entity-link-history"] })
  }
  const addLink = useMutation({
    mutationFn: async ({ toType, toId }: { toType: string; toId: number }) => {
      await api.post(`/api/v1/graph/links?from_type=${entityType}&from_id=${entityId}&to_type=${toType}&to_id=${toId}&link_type=${encodeURIComponent(linkType)}`)
      return { toType, toId }
    },
    onSuccess: r => {
      refresh()
      // окно закрывается сразу, откат остаётся в общем хосте уведомлений
      void announceLinkChange({ entityType, entityId, kind: "add", other: { type: r.toType, id: r.toId }, message: t("relations.added"), onUndone: refresh })
      onClose()
    },
  })

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.8)" }}
      onClick={onClose}>
      <div style={{ background: "#0e0e16", border: "1px solid #1e1e2e", borderRadius: 14, width: 500, maxHeight: "75vh", display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 24px 80px rgba(0,0,0,0.7)" }}
        onClick={e => e.stopPropagation()}>
        <div style={{ padding: "14px 18px", borderBottom: "1px solid #181828", display: "flex", alignItems: "center", gap: 10 }}>
          <Search size={13} style={{ color: "#9696a7", flexShrink: 0 }} />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder={t("relations.searchPlaceholder")} autoFocus
            style={{ flex: 1, background: "none", border: "none", outline: "none", fontSize: 13, color: "#e0e0f0" }} />
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#888891", cursor: "pointer", display: "flex" }}><X size={14} /></button>
        </div>
        {linkTypes.length > 1 && (
          <div style={{ display: "flex", gap: 6, padding: "10px 18px", borderBottom: "1px solid #181828", flexWrap: "wrap" }}>
            {linkTypes.map(lt => (
              <button key={lt.value} onClick={() => setLinkType(lt.value)}
                style={{ fontSize: 11, padding: "4px 12px", borderRadius: 20, border: `1px solid ${linkType === lt.value ? lt.color : "#222232"}`, background: linkType === lt.value ? `${lt.color}18` : "transparent", color: linkType === lt.value ? lt.color : "#9696a4", cursor: "pointer", fontWeight: linkType === lt.value ? 600 : 400, transition: "all 0.12s" }}>
                {lt.label}
              </button>
            ))}
          </div>
        )}
        <div style={{ overflowY: "auto", flex: 1 }}>
          {q.length < 1 && (
            <div style={{ textAlign: "center", padding: "32px 0", color: "#9696a2" }}>
              <Search size={24} style={{ margin: "0 auto 8px", display: "block", opacity: 0.3 }} />
              <p style={{ fontSize: 12 }}>{t("relations.startTyping")}</p>
            </div>
          )}
          {results.map((item: any) => {
            const color = typeColor[item.type] ?? "#555"
            const selectedLt = linkTypes.find(l => l.value === linkType)
            return (
              <div key={`${item.type}-${item.id}`}
                onClick={() => addLink.mutate({ toType: item.type, toId: item.id })}
                style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 18px", cursor: "pointer", borderBottom: "1px solid #141424", transition: "background 0.1s" }}
                onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = "#141424")}
                onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = "transparent")}>
                <div style={{ width: 3, height: 32, borderRadius: 2, background: selectedLt?.color ?? color, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: "#c0c0d8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tTitle(item)}</div>
                  <div style={{ fontSize: 10, color: "#9696a2", marginTop: 2 }}>
                    {typeRu[item.type] ?? item.type}{item.status ? <> · <span style={{ color: "#9696a5" }}>{item.status}</span></> : ""}
                  </div>
                </div>
                <Plus size={12} style={{ color: "#9696a2", flexShrink: 0 }} />
              </div>
            )
          })}
          {q.length >= 1 && results.length === 0 && (
            <p style={{ textAlign: "center", color: "#9696a2", fontSize: 12, padding: "24px 0" }}>{t("relations.noneFound")}</p>
          )}
        </div>
      </div>
    </div>
  )
}
