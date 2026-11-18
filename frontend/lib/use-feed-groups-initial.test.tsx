// Первая страница с сервера видна уже на первом рендере (его и получает краулер); с фильтром она не применяется.
import { describe, expect, it, vi } from "vitest"
import { renderHook } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import type { ReactNode } from "react"

vi.mock("@/lib/api", () => ({ feedApi: { groupsPublic: vi.fn(() => new Promise(() => {})), groupsLab: vi.fn(() => new Promise(() => {})) } }))
import { useFeedGroups } from "@/lib/use-feed-groups"
import { PUBLIC_SCOPE } from "@/lib/feed-scope"
import type { FeedGroupsPage } from "@/lib/feed-groups"

const page = { groups: [{ key: "hypothesis:1", core: { type: "hypothesis", entity_id: 1 }, members: [], outside: [] }], page: 1, page_size: 20, total: 1, total_pages: 1, type_counts: {}, topics: [] } as unknown as FeedGroupsPage
const wrap = ({ children }: { children: ReactNode }) => <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
const none = { type: null, topic: null }

describe("useFeedGroups: первая страница с сервера", () => {
  it("карточки есть на первом рендере, без ожидания сети", () => {
    const { result } = renderHook(() => useFeedGroups(PUBLIC_SCOPE, none, page), { wrapper: wrap })
    expect(result.current.groups).toHaveLength(1)
    expect(result.current.isLoading).toBe(false)
  })
  it("без первой страницы лента пуста и грузится", () => {
    const { result } = renderHook(() => useFeedGroups(PUBLIC_SCOPE, none), { wrapper: wrap })
    expect(result.current.groups).toHaveLength(0)
    expect(result.current.isLoading).toBe(true)
  })
  it("с фильтром серверная страница не подставляется", () => {
    const { result } = renderHook(() => useFeedGroups(PUBLIC_SCOPE, { type: "hypothesis", topic: null }, page), { wrapper: wrap })
    expect(result.current.groups).toHaveLength(0)
  })
})
