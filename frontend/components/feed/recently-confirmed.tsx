"use client"
import { useQuery } from "@tanstack/react-query"
import Link from "next/link"
import type { CSSProperties } from "react"
import { feedApi } from "@/lib/api"
import { useT } from "@/lib/i18n/useT"
import { useStore } from "@/lib/store"
import { useListContentTranslation } from "@/lib/i18n/useContentT"

const STATUS_COLOR: Record<string, string> = {
  "подтвердился": "#27AE60",
  "частично подтвердился": "#F5A623",
  "не подтвердился": "#E74C3C",
}
// Значения status — данные, см. те же ключи confirmPrediction.outcome.* что
// используются в PredictionLedger.tsx/confirm-prediction-modal.tsx.
const STATUS_LABEL_KEY: Record<string, string> = {
  "подтвердился": "confirmPrediction.outcome.confirmed",
  "частично подтвердился": "confirmPrediction.outcome.partial",
  "не подтвердился": "confirmPrediction.outcome.refuted",
}

export function RecentlyConfirmed() {
  const t = useT()
  const user = useStore(s => s.user)
  const { data, isLoading } = useQuery({ queryKey: ["feed", "recently-confirmed"], queryFn: feedApi.recentlyConfirmed })

  const tPred = useListContentTranslation(
    "prediction", data ?? [], ["title", "preview"],
    (item: any) => !!user && user.username === item.author_username,
  )

  if (isLoading || !data || data.length === 0) return null

  return (
    <section className="mf-box" data-testid="recently-confirmed">
      <h4 className="mf-h">{t("recentlyConfirmed.title")}</h4>
      {data.map((p: any) => {
        const color = STATUS_COLOR[p.status ?? ""]
        return (
          <Link key={p.id} href={`/feed/discussion/prediction/${p.id}`} className="mf-line" data-testid="recently-confirmed-row">
            <span className="mf-line-t">{tPred(p, "title", p.title) || tPred(p, "preview", p.preview)}</span>
            <b style={color ? ({ ["--c" as string]: color } as CSSProperties) : undefined}>
              {STATUS_LABEL_KEY[p.status] ? t(STATUS_LABEL_KEY[p.status]) : p.status}
            </b>
          </Link>
        )
      })}
    </section>
  )
}
