"use client"
import { useQuery } from "@tanstack/react-query"
import Link from "next/link"
import { feedApi } from "@/lib/api"
import { useT } from "@/lib/i18n/useT"
import { ruPluralForm } from "@/lib/i18n/ru-plural"

export function GraphTeaser() {
  const t = useT()
  const { data, isLoading } = useQuery({ queryKey: ["feed", "graph-teaser"], queryFn: feedApi.graphTeaser })
  if (isLoading || !data) return null

  const nodeForm = ruPluralForm(data.nodes)
  const nodeKey = nodeForm === "one" ? "graphTeaser.nodeOne" : nodeForm === "few" ? "graphTeaser.nodeFew" : "graphTeaser.nodeMany"
  const edgeForm = ruPluralForm(data.edges)
  const edgeKey = edgeForm === "one" ? "relations.pluralOne" : edgeForm === "few" ? "relations.pluralFew" : "relations.pluralMany"

  return (
    <Link href="/graph?scope=global" className="mf-box mf-teaser" data-testid="graph-teaser">
      <svg width="48" height="38" viewBox="0 0 56 44" aria-hidden="true" style={{ flexShrink: 0 }}>
        <circle cx="8" cy="10" r="2.5" fill="#4A90D9" /><circle cx="26" cy="6" r="2" fill="#2ECC71" />
        <circle cx="44" cy="12" r="2.3" fill="#F5A623" /><circle cx="16" cy="24" r="2" fill="#9B59B6" />
        <circle cx="36" cy="26" r="2.5" fill="#4A90D9" /><circle cx="10" cy="37" r="1.8" fill="#1ABC9C" />
        <circle cx="48" cy="34" r="2" fill="#2ECC71" />
        <g stroke="#4A90D9" strokeWidth="1" fill="none" opacity={0.4}>
          <path d="M8 10 26 6" /><path d="M26 6 44 12" /><path d="M8 10 16 24" />
          <path d="M16 24 36 26" /><path d="M36 26 44 12" /><path d="M36 26 48 34" />
        </g>
      </svg>
      <div>
        <div className="mf-teaser-t">{t("graphTeaser.title")}</div>
        <div className="mf-teaser-s">
          {data.nodes.toLocaleString("ru-RU")} {t(nodeKey)} · {data.edges.toLocaleString("ru-RU")} {t(edgeKey)}
        </div>
        <span className="mf-teaser-go">{t("graphTeaser.openGraph")}</span>
      </div>
    </Link>
  )
}
