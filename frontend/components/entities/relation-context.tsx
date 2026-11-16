import { LinkProvenanceRow } from "@/components/entities/link-provenance-row"
import type { PreviewContext } from "@/components/entities/preview-card"
import type { LinkProvenanceItem } from "@/lib/link-provenance"
import type { LinkLock } from "@/components/entities/link-lock-notice"

interface RelationItem {
  link_type?: string | null; source?: string; role?: string | null; stance?: string | null
  direct?: boolean; lock?: LinkLock | null; linked_by?: LinkProvenanceItem["linked_by"]; linked_at?: string | null
}

/**
 * Единый состав блока «Связь с этой записью» в карточке предпросмотра: тип связи, кто и когда связал, замок,
 * для косвенных ещё «Через …». Секции без данных просто не показываются.
 */
export function buildRelationContext(
  item: RelationItem,
  o: { t: (key: string, p?: Record<string, string>) => string; linkTypes: { value: string; label: string; color?: string }[]; parentTitle?: string },
): PreviewContext {
  const key = item.source === "field" ? item.stance : item.link_type
  const lt = o.linkTypes.find(l => l.value === key) ?? o.linkTypes.find(l => l.value === "связано")
  return {
    label: item.source === "competing" ? o.t(`relations.role.${item.role ?? "alternative"}`) : lt?.label,
    color: item.source === "competing" ? undefined : lt?.color,
    via: item.direct === false ? o.t("relations.via", { title: o.parentTitle ?? "…" }) : undefined,
    provenance: item.linked_by ? <LinkProvenanceRow item={item as LinkProvenanceItem} /> : null,
    lock: item.lock ?? null,
  }
}
