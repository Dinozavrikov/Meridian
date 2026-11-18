"use client"
import { useRef } from "react"
import { useInfiniteQuery, useQuery, useQueryClient, type InfiniteData } from "@tanstack/react-query"
import { feedApi } from "@/lib/api"
import { scopeKey, type FeedScope } from "@/lib/feed-scope"
import { FEED_PAGE_SIZE, hasNewerActivity, mergeGroups, type FeedGroupsPage, type TopicCount } from "@/lib/feed-groups"

const PAGE_SIZE = FEED_PAGE_SIZE
export const PEEK_INTERVAL_MS = 30_000

export interface FeedFilter { type: string | null; topic: string | null }

function fetchGroups(scope: FeedScope, filter: FeedFilter, page: number, pageSize: number): Promise<FeedGroupsPage> {
  const params = { page, pageSize, types: filter.type ? [filter.type] : undefined, topic: filter.topic ?? undefined }
  return scope.type === "public" ? feedApi.groupsPublic(params) : feedApi.groupsLab(scope.labId, params)
}

/** Ключи начинаются с "feed": существующие invalidateQueries(["feed"]) (комментарий, удаление записи) обновляют и эту ленту. */
/** initialPage: первая страница, отрисованная на сервере. Годится только для ленты без фильтров. */
export function useFeedGroups(scope: FeedScope, filter: FeedFilter, initialPage?: FeedGroupsPage | null) {
  const qc = useQueryClient()
  const sk = scopeKey(scope)
  const key = ["feed", "groups", sk, filter.type, filter.topic] as const

  const query = useInfiniteQuery({
    queryKey: key,
    initialPageParam: 1,
    initialData: (initialPage && !filter.type && !filter.topic ? { pages: [initialPage], pageParams: [1] } : undefined) as InfiniteData<FeedGroupsPage, number> | undefined,
    queryFn: ({ pageParam }) => fetchGroups(scope, filter, pageParam, PAGE_SIZE),
    getNextPageParam: (last: FeedGroupsPage) => (last.page < last.total_pages ? last.page + 1 : undefined),
  })

  // Тихая проверка новизны: раз в полминуты запрашивается ТОЛЬКО верхняя карточка (карточки идут по активности).
  // Вставлять новое в уже показанный список нельзя — запись может принадлежать карточке из середины.
  const peek = useQuery({
    queryKey: ["feed", "groups-peek", sk, filter.type, filter.topic] as const,
    queryFn: () => fetchGroups(scope, filter, 1, 1),
    enabled: query.isSuccess,
    refetchInterval: PEEK_INTERVAL_MS,
  })

  const pages = query.data?.pages ?? []
  const groups = mergeGroups(pages)
  // Счётчики типов и темы бэкенд считает по ВСЕМ карточкам, а не по выбранному фильтру. Пока грузится новая выборка,
  // data пуста — держим последние известные, иначе чипы пропадают и мигают при каждом клике по фильтру.
  // allTotal — число карточек без фильтров: известно, только если ленту открывали без них.
  const meta = useRef({ typeCounts: {} as Record<string, number>, topics: [] as TopicCount[], allTotal: null as number | null })
  if (pages[0]) {
    meta.current = {
      typeCounts: pages[0].type_counts,
      topics: pages[0].topics,
      allTotal: !filter.type && !filter.topic ? pages[0].total : meta.current.allTotal,
    }
  }
  const hasNew = query.isSuccess && hasNewerActivity(groups[0]?.activity ?? null, peek.data?.groups[0]?.activity ?? null)

  return {
    ...query,
    groups,
    typeCounts: meta.current.typeCounts,
    topics: meta.current.topics,
    allTotal: meta.current.allTotal,
    total: pages[0]?.total ?? 0,
    hasNew,
    /** Сбрасывает ленту к первой странице (прежняя прокрутка и подгруженные страницы не нужны). */
    refresh: () => qc.resetQueries({ queryKey: key }),
  }
}
