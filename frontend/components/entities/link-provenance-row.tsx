"use client"
import { Clock } from "lucide-react"
import { useT } from "@/lib/i18n/useT"
import { useStore } from "@/lib/store"
import { ink, theme } from "@/lib/theme"
import { readableOn } from "@/lib/color"
import type { LinkProvenanceItem } from "@/lib/link-provenance"

const BLUE = "#4A90D9"

/** «3 дня назад», «сегодня», «2 мес. назад»: относительный возраст связи на языке интерфейса. */
export function relativeAge(iso: string, now: Date, locale: string): string {
  const days = Math.floor((now.getTime() - new Date(iso).getTime()) / 86_400_000)
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto", style: "short" })
  if (days < 30) return rtf.format(-Math.max(days, 0), "day")
  if (days < 365) return rtf.format(-Math.floor(days / 30), "month")
  return rtf.format(-Math.floor(days / 365), "year")
}

/** Полоса «кто и когда связал»: аватар, имя, чип с датой. Для старых связей без даты — «давно» с пояснением. */
export function LinkProvenanceRow({ item }: { item: LinkProvenanceItem }) {
  const t = useT()
  const locale = useStore(s => s.locale) || "ru"
  if (!item.linked_by) return null
  const name = item.linked_by.display_name || item.linked_by.username
  const dated = !!item.linked_at
  const old = !dated && item.source === "link"
  const chipText = dated ? relativeAge(item.linked_at!, new Date(), locale) : old ? t("relations.linkedOld") : null
  const chipTitle = dated
    ? new Date(item.linked_at!).toLocaleString(locale)
    : old ? t("relations.linkedOldHint") : t("relations.linkedFieldHint")
  return (
    <div data-testid="link-provenance" style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8, paddingTop: 8, borderTop: `1px dashed ${ink.line}` }}>
      <span aria-hidden style={{ width: 20, height: 20, borderRadius: "50%", flexShrink: 0, display: "inline-flex", alignItems: "center", justifyContent: "center",
        fontSize: 11, fontWeight: 700, background: `${BLUE}26`, color: readableOn(BLUE), border: `1px solid ${BLUE}55` }}>
        {name.trim().charAt(0).toUpperCase()}
      </span>
      <span style={{ fontSize: 12, color: ink.muted }}>{t("relations.linkedByLabel")}</span>
      <span style={{ fontSize: 13, fontWeight: 600, color: theme.tx1, minWidth: 0, overflowWrap: "anywhere" }}>{name}</span>
      {chipText && (
        <span title={chipTitle} style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 5, padding: "2px 9px", borderRadius: 999,
          fontSize: 12, fontFamily: theme.mono, color: dated ? ink.label : ink.muted, fontStyle: dated ? "normal" : "italic",
          background: ink.well, border: `1px solid ${ink.line}` }}>
          <Clock size={12} aria-hidden />{chipText}
        </span>
      )}
    </div>
  )
}
