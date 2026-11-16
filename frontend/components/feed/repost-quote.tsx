"use client"
import { Repeat } from "lucide-react"
import { theme } from "@/lib/theme"
import { useTypeRu } from "@/lib/i18n/useTypeRu"
import { useT } from "@/lib/i18n/useT"
import type { FeedRepostOf } from "@/lib/feed-groups"

export function RepostQuote({ repostOf }: {
  repostOf: FeedRepostOf
}) {
  const t = useT()
  const typeRu = useTypeRu()
  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 9, fontSize: 11, color: theme.tx3 }}>
        <Repeat size={12} style={{ color: theme.tx4 }} />
        {t("repostQuote.repostFrom")} <b style={{ color: theme.tx2, fontWeight: 600 }}>{repostOf.source_author}</b>
      </div>
      {(repostOf.source_title || repostOf.source_preview) && (
        <div style={{ margin: "0 0 11px", padding: "8px 12px", borderLeft: `2px solid ${theme.ln2}`, background: theme.bg2, borderRadius: "0 8px 8px 0" }}>
          <div style={{ fontSize: 10, color: theme.tx4, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 3 }}>
            {t("repostModal.sourceRecord")} · {typeRu[repostOf.source_type] ?? repostOf.source_type}
          </div>
          {repostOf.source_title && <div style={{ fontSize: 12.5, fontWeight: 600, color: theme.tx2, marginBottom: 2 }}>{repostOf.source_title}</div>}
          {repostOf.source_preview && <div style={{ fontSize: 12, color: theme.tx3, lineHeight: 1.5 }}>{repostOf.source_preview}</div>}
        </div>
      )}
    </>
  )
}
