export interface LinkProvenanceItem {
  source?: string
  linked_by?: { username: string; display_name?: string } | null
  linked_at?: string | null
}

/** Строка «Связал: …» для карточки связи и предпросмотра; null, если автор неизвестен. */
export function linkProvenance(t: (key: string, p?: Record<string, string>) => string, item: LinkProvenanceItem): string | null {
  if (!item.linked_by) return null
  const name = item.linked_by.display_name || item.linked_by.username
  if (item.linked_at) return t("relations.linkedByAt", { name, date: new Date(item.linked_at).toLocaleDateString() })
  if (item.source === "link") return t("relations.linkedByOld", { name })
  return t("relations.linkedBy", { name })
}
