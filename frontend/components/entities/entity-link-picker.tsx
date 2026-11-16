"use client"
import { useState, useEffect } from "react"
import { useQuery } from "@tanstack/react-query"
import { api } from "@/lib/api"
import { ink, typeColor } from "@/lib/theme"
import { linkTypesFor, sameTypeBlocked } from "@/lib/link-vocab"
import { influenceOptions } from "@/lib/worldview-influence"
import { useTypeRu } from "@/lib/i18n/useTypeRu"
import { useT } from "@/lib/i18n/useT"
import { getLinkTypes } from "@/components/entities/link-types"
import { useContentT } from "@/lib/i18n/useContentT"
import { X, Search, Link2 } from "lucide-react"


export type PendingLink = { type: string; id: number; title: string; link_type: string; is_own?: boolean }

/**
 * Выбор произвольного числа связей с любыми сущностями любого типа —
 * для использования внутри форм СОЗДАНИЯ (когда у самой записи ещё нет id).
 * Не вызывает API немедленно: копит список в состоянии родительской формы
 * через value/onChange, как обычный контролируемый инпут. Опционально —
 * можно не добавить ни одной связи.
 *
 * После успешного создания сущности родительская форма должна сама
 * пройтись по value и вызвать POST /api/v1/graph/links для каждой записи
 * (см. createLinksFor helper ниже).
 */
export function EntityLinkPicker({ value, onChange, excludeType, excludeId }: {
  value: PendingLink[]
  onChange: (next: PendingLink[]) => void
  excludeType?: string
  excludeId?: number
}) {
  const t = useT()
  const typeRu = useTypeRu()
  const [q, setQ] = useState("")
  const [linkType, setLinkType] = useState("связано")
  const [open, setOpen] = useState(false)
  // страница убеждения: у связи с убеждением свои типы (влияние), а не «подтверждает/опровергает»
  const influence = influenceOptions(t)
  const chipTypes = excludeType === "worldview" ? linkTypesFor(getLinkTypes(t), "worldview", "", influence) : getLinkTypes(t)

  const { data: results = [] } = useQuery({
    queryKey: ["link-search", q],
    queryFn: () => api.get(`/api/v1/graph/search?q=${encodeURIComponent(q)}`).then(r => r.data),
    enabled: q.length >= 1,
  })

  const candidates = results.filter((item: any) => {
    if (excludeType && excludeId && item.type === excludeType && item.id === excludeId) return false
    return !value.some(v => v.type === item.type && v.id === item.id)
  })
  // «Подтверждает/опровергает» между записями одного типа бэкенд не принимает: такие результаты не показываем и говорим почему
  const filtered = candidates.filter((item: any) => !sameTypeBlocked(linkType, excludeType, item.type))
  const hiddenSame = filtered.length !== candidates.length

  // Результаты /graph/search смешаны по типам (hypothesis/observation/...)
  // с независимой нумерацией id внутри каждого типа — нельзя звать
  // useListContentTranslation с одним entityType на весь список, id
  // из разных типов будут коллизировать в кэше. Группируем ensure()
  // по реальному item.type каждого элемента через низкоуровневый useContentT().
  const { ct, ensure } = useContentT()
  const searchIdsKey = filtered.map((i: any) => `${i.type}:${i.id}`).join(",")
  useEffect(() => {
    const items = filtered
      .filter((i: any) => !i.is_own && i.title)
      .map((i: any) => ({ entityType: i.type, entityId: i.id, field: "title", text: i.title }))
    ensure(items)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchIdsKey])
  const tSearchTitle = (item: any) => item.is_own ? item.title : ct(item.type, item.id, "title", item.title)

  const valueIdsKey = value.map(v => `${v.type}:${v.id}`).join(",")
  useEffect(() => {
    const items = value
      .filter(v => !v.is_own && v.title)
      .map(v => ({ entityType: v.type, entityId: v.id, field: "title", text: v.title }))
    ensure(items)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valueIdsKey])
  const tValueTitle = (v: PendingLink) => v.is_own ? v.title : ct(v.type, v.id, "title", v.title)

  const add = (item: any) => {
    onChange([...value, { type: item.type, id: item.id, title: item.title, link_type: linkType, is_own: !!item.is_own }])
    setQ("")
    setOpen(false)
  }
  const remove = (type: string, id: number) => {
    onChange(value.filter(v => !(v.type === type && v.id === id)))
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <label style={{ fontSize: 12, color: "#9393b5", display: "flex", alignItems: "center", gap: 6 }}>
        <Link2 size={12} /> {t("relations.title")}
      </label>

      {value.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {value.map(v => {
            const color = typeColor[v.type] ?? "#555"
            return (
              <div key={`${v.type}-${v.id}`}
                style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", borderRadius: 8, background: "#12121c", border: "1px solid #1e1e2e" }}>
                <div style={{ width: 3, height: 20, borderRadius: 2, background: color, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0, fontSize: 12, color: "#c0c0d8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {tValueTitle(v)}
                </div>
                <span style={{ fontSize: 10, color: "#9696a5" }}>{influence.find(i => i.value === v.link_type)?.label ?? v.link_type}</span>
                <button type="button" onClick={() => remove(v.type, v.id)}
                  style={{ background: "none", border: "none", color: "#888891", cursor: "pointer", display: "flex" }}>
                  <X size={12} />
                </button>
              </div>
            )
          })}
        </div>
      )}

      <div style={{ display: "flex", gap: 6 }}>
        {chipTypes.map(lt => (
          <button key={lt.value} type="button" onClick={() => setLinkType(lt.value)}
            style={{ fontSize: 11, padding: "4px 12px", borderRadius: 20, border: `1px solid ${linkType === lt.value ? lt.color : "#222232"}`, background: linkType === lt.value ? `${lt.color}18` : "transparent", color: linkType === lt.value ? lt.color : "#9696a4", cursor: "pointer", fontWeight: linkType === lt.value ? 600 : 400 }}>
            {lt.label}
          </button>
        ))}
      </div>

      {hiddenSame && <div role="note" style={{ fontSize: 11, color: ink.muted }}>{t("relations.sameTypeHidden")}</div>}

      <div style={{ position: "relative" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderRadius: 8, border: "1px solid #1e1e2e", background: "#0e0e16" }}>
          <Search size={13} style={{ color: "#9696a7", flexShrink: 0 }} />
          <input value={q}
            onChange={e => { setQ(e.target.value); setOpen(true) }}
            onFocus={() => setOpen(true)}
            placeholder={t("relations.searchPlaceholder")}
            style={{ flex: 1, background: "none", border: "none", outline: "none", fontSize: 13, color: "#e0e0f0" }} />
        </div>
        {open && q.length >= 1 && (
          <div style={{ position: "absolute", top: "100%", left: 0, right: 0, marginTop: 4, background: "#0e0e16", border: "1px solid #1e1e2e", borderRadius: 10, maxHeight: 240, overflowY: "auto", zIndex: 50, boxShadow: "0 12px 40px rgba(0,0,0,0.6)" }}>
            {filtered.length === 0 && (
              <div style={{ padding: "12px 14px", fontSize: 12, color: "#9696a2" }}>{t("relations.noResults") ?? "—"}</div>
            )}
            {filtered.map((item: any) => {
              const color = typeColor[item.type] ?? "#555"
              return (
                <div key={`${item.type}-${item.id}`} onClick={() => add(item)}
                  style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 14px", cursor: "pointer", borderBottom: "1px solid #141424" }}
                  onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = "#141424")}
                  onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = "transparent")}>
                  <div style={{ width: 3, height: 24, borderRadius: 2, background: color, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, color: "#c0c0d8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tSearchTitle(item)}</div>
                    <div style={{ fontSize: 10, color: "#9696a2" }}>{typeRu[item.type] ?? item.type}</div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

/** Вызывается после успешного создания сущности — создаёт реальные Link
 * записи на бэкенде для каждой связи, накопленной в EntityLinkPicker. */
export async function createLinksFor(entityType: string, entityId: number, links: PendingLink[]) {
  await Promise.all(links.map(l =>
    api.post(`/api/v1/graph/links?from_type=${entityType}&from_id=${entityId}&to_type=${l.type}&to_id=${l.id}&link_type=${encodeURIComponent(l.link_type)}`)
  ))
}
