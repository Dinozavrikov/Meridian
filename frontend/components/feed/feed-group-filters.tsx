"use client"
import type { CSSProperties } from "react"
import { typeColor } from "@/lib/theme"
import { useT } from "@/lib/i18n/useT"
import { useTypeRu } from "@/lib/i18n/useTypeRu"
import type { TopicCount } from "@/lib/feed-groups"

const TYPES = ["hypothesis", "observation", "prediction", "worldview", "question", "task"] as const
const cvar = (c: string): CSSProperties => ({ ["--c" as string]: c })

/** Типы и темы. Число у типа — карточки, где есть запись этого типа (одна карточка может содержать записи нескольких типов),
 *  поэтому под списком стоит подпись: иначе «Наблюдение 5» при 21 записи читается как ошибка. */
export function FeedGroupFilters({ typeCounts, allTotal, activeType, onType, topics, activeTopic, onTopic }: {
  typeCounts: Record<string, number>
  allTotal: number | null
  activeType: string | null
  onType: (type: string | null) => void
  topics: TopicCount[]
  activeTopic: string | null
  onTopic: (topic: string | null) => void
}) {
  const t = useT()
  const typeRu = useTypeRu() as Record<string, string>
  // Выбранная тема могла выпасть из топ-30: показываем её, чтобы фильтр можно было снять.
  const topicList: { name: string; count: number | null }[] =
    activeTopic && !topics.some(x => x.name === activeTopic) ? [{ name: activeTopic, count: null }, ...topics] : topics
  const types = TYPES.filter(ty => (typeCounts[ty] ?? 0) > 0 || activeType === ty)

  return (
    <>
      <div className="mf-box">
        <h4 className="mf-h">{t("feedGroups.railTypes")}</h4>
        <div className="mf-facets" role="group" aria-label={t("feedGroups.railTypes")}>
          <button type="button" className="mf-facet" data-testid="filter-all" aria-pressed={activeType === null} onClick={() => onType(null)}>
            <i className="mf-dot" aria-hidden="true" />{t("feedFilters.all")}
            {allTotal != null && <span className="n">{allTotal}</span>}
          </button>
          {types.map(ty => (
            <button key={ty} type="button" className="mf-facet" data-testid={`filter-${ty}`} aria-pressed={activeType === ty}
              style={cvar(typeColor[ty])} onClick={() => onType(ty)}>
              <i className="mf-dot" aria-hidden="true" />{typeRu[ty] ?? ty}<span className="n">{typeCounts[ty] ?? 0}</span>
            </button>
          ))}
        </div>
        <p className="mf-hint" data-testid="filter-hint">{t("feedGroups.countHint")}</p>
      </div>
      {topicList.length > 0 && (
        <div className="mf-box">
          <h4 className="mf-h">{t("feedGroups.topicsLabel")}</h4>
          <div className="mf-topics" role="group" aria-label={t("feedGroups.topicsLabel")}>
            {topicList.map(tp => (
              <button key={tp.name} type="button" className="mf-tag" data-testid={`topic-${tp.name}`} aria-pressed={activeTopic === tp.name}
                onClick={() => onTopic(activeTopic === tp.name ? null : tp.name)}>
                #{tp.name}{tp.count ? <span className="n">{tp.count}</span> : null}
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  )
}
