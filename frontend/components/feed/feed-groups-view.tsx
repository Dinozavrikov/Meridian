"use client"
import { useEffect, useRef, useState, type ReactNode } from "react"
import { ArrowUp, Globe, Loader2 } from "lucide-react"
import { useStore } from "@/lib/store"
import { useT } from "@/lib/i18n/useT"
import { scopeKey, type FeedScope } from "@/lib/feed-scope"
import { groupIsOnlyMine, isNewSince, readSeen, writeSeen, type FeedGroup, type FeedGroupsPage } from "@/lib/feed-groups"
import { useFeedGroups, type FeedFilter } from "@/lib/use-feed-groups"
import { useInfiniteScrollSentinel } from "@/lib/use-infinite-scroll-sentinel"
import { FeedGroupCard } from "@/components/feed/feed-group-card"
import { FeedGroupFilters } from "@/components/feed/feed-group-filters"
import { FeedStyles } from "@/components/feed/feed-styles"
import { FeedListStyles } from "@/components/feed/feed-list-styles"
import { FeedList } from "@/components/feed/feed-list"
import { FeedViewToggle } from "@/components/feed/feed-view-toggle"
import { useFeedViewMode } from "@/lib/feed-view-mode"

/** Лента карточками-досье: заголовок страницы, фильтры, список, плашка «Есть новое». split — страница ленты (колонка и
 *  правая панель), single — вкладка лаборатории (фильтры строкой над колонкой, без заголовка: он есть у страницы
 *  лаборатории). Вызывающий ставит key={scopeKey(scope)}: метка «прошлого захода» читается один раз при монтировании. */
export function FeedGroupsView({ scope, layout = "single", extras, showHeading = false, initialPage = null }: {
  scope: FeedScope; layout?: "split" | "single"; extras?: ReactNode; showHeading?: boolean; initialPage?: FeedGroupsPage | null
}) {
  const t = useT()
  const user = useStore(s => s.user)
  const sKey = scopeKey(scope)
  const [filter, setFilter] = useState<FeedFilter>({ type: null, topic: null })
  // Метка «прошлого захода» читается после монтирования: карточки приходят уже с сервера, а он localStorage не видит,
  // иначе бейджи «Новое» разошлись бы при гидратации. Читаем один раз, до записи новой метки (эффект ниже по порядку).
  const [lastSeen, setLastSeen] = useState<string | null>(null)
  const seenRead = useRef(false)
  useEffect(() => {
    if (seenRead.current) return
    seenRead.current = true
    setLastSeen(readSeen(sKey))
  }, [sKey])
  const [viewMode, setViewMode] = useFeedViewMode()
  const q = useFeedGroups(scope, filter, initialPage)
  const sentinelRef = useInfiniteScrollSentinel(
    () => q.fetchNextPage(),
    !q.isLoading && !q.isFetchingNextPage && !!q.hasNextPage,
  )

  // Время захода запоминается после загрузки и при уходе: «Новое» — то, что случилось после прошлого визита.
  useEffect(() => {
    if (!q.isSuccess) return
    const mark = () => writeSeen(sKey, new Date().toISOString())
    mark()
    return mark
  }, [q.isSuccess, sKey])

  const showNew = () => {
    q.refresh()
    try { window.scrollTo({ top: 0, behavior: "smooth" }) } catch { /* окружение без прокрутки */ }
  }

  const failed = q.isError && q.groups.length === 0
  // Метка «Новое» одинакова в обоих видах ленты.
  const isNewGroup = (g: FeedGroup) => isNewSince(g.activity, lastSeen) && !groupIsOnlyMine(g, user?.username)

  return (
    <div className="mf" data-testid="feed-view" data-layout={layout}>
      <FeedStyles />
      <FeedListStyles />
      {showHeading && (
        <header className="mf-pagehead" data-testid="feed-heading">
          <h1>{t("feedGroups.headTitle")}</h1>
          <p>{t("feedGroups.headSub")}</p>
          {q.allTotal != null && <div className="mf-stat" data-testid="feed-stat">{t("feedGroups.headStats", { n: q.allTotal })}</div>}
        </header>
      )}
      <div className={`mf-layout${layout === "single" ? " mf-single" : ""}`}>
        <aside className="mf-rail" aria-label={t("feedGroups.filtersLabel")}>
          <FeedGroupFilters
            typeCounts={q.typeCounts} allTotal={q.allTotal} activeType={filter.type}
            onType={type => setFilter(f => ({ ...f, type }))}
            topics={q.topics} activeTopic={filter.topic} onTopic={topic => setFilter(f => ({ ...f, topic }))}
          />
          {layout === "split" && extras ? <div className="mf-extras" data-testid="feed-extras">{extras}</div> : null}
        </aside>

        <section className="mf-main" aria-busy={q.isLoading}>
          <div className="mfl-toolbar"><FeedViewToggle mode={viewMode} onChange={setViewMode} /></div>
          {q.hasNew && (
            <div className="mf-banner">
              <button type="button" data-testid="feed-new-banner" onClick={showNew}>
                <ArrowUp size={13} aria-hidden="true" />{t("feedGroups.newBanner")}
              </button>
            </div>
          )}

          {q.isLoading ? (
            <div data-testid="feed-skeleton" aria-hidden="true">
              {[0, 1, 2].map(i => <div key={i} className="mf-skel" style={{ opacity: 1 - i * 0.25 }} />)}
            </div>
          ) : failed ? (
            <div className="mf-state" role="alert" data-testid="feed-error">
              <p>{t("feedGroups.error")}</p>
              <button type="button" className="mf-btn" style={{ border: "1px solid var(--mf-ln2)" }} onClick={() => q.refetch()}>
                {t("feedGroups.retry")}
              </button>
            </div>
          ) : q.groups.length === 0 ? (
            <div className="mf-state">
              <Globe size={32} aria-hidden="true" style={{ margin: "0 auto 12px", display: "block", opacity: 0.6 }} />
              <p>{filter.type || filter.topic ? t("feedPage.emptyTitleFiltered") : t("feedPage.emptyTitleAll")}</p>
              {scope.type === "public" && (
                <p className="sub">{user ? t("feedPage.emptySubtitleUser") : t("feedPage.emptySubtitleGuest")}</p>
              )}
            </div>
          ) : (
            viewMode === "list" ? (
              <FeedList groups={q.groups} isNew={isNewGroup} />
            ) : (
              <div>
                {q.groups.map(g => (
                  <FeedGroupCard
                    key={g.key} group={g}
                    isNew={isNewGroup(g)}
                    onTopic={topic => setFilter(f => ({ ...f, topic }))}
                  />
                ))}
              </div>
            )
          )}

          {!q.isLoading && q.groups.length > 0 && (
            <>
              <div ref={sentinelRef} style={{ height: 1 }} />
              {q.isFetchingNextPage && (
                <div style={{ display: "flex", justifyContent: "center", padding: "20px 0" }}>
                  <Loader2 size={18} className="animate-spin" aria-hidden="true" />
                </div>
              )}
              {!q.hasNextPage && (
                <div className="mf-end">
                  {viewMode === "list" ? t("feedList.shownAll", { n: q.total }) : t("feedGroups.shownAll", { n: q.total })}
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  )
}
