import React from "react"
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest"
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { STRINGS } from "@/lib/i18n/strings"
import { CommentThread } from "@/components/discussion/comment-thread"
import { DiscussionContext } from "@/components/discussion/discussion-context"

const h = vi.hoisted(() => ({ del: vi.fn(), confirm: vi.fn() }))
vi.mock("next/link", async () => {
  const React = await import("react")
  return { default: ({ href, children, ...rest }: any) => React.createElement("a", { href, ...rest }, children) }
})
vi.mock("@/lib/i18n/useT", async () => {
  const { STRINGS } = await vi.importActual<typeof import("@/lib/i18n/strings")>("@/lib/i18n/strings")
  return {
    useT: () => (key: string, vars?: Record<string, string | number>) =>
      Object.entries(vars ?? {}).reduce((a, [k, v]) => a.replaceAll(`{${k}}`, String(v)), (STRINGS as Record<string, string>)[key] ?? key),
  }
})
vi.mock("@/lib/api", () => ({ api: { delete: h.del } }))
vi.mock("@/lib/confirm", () => ({ askConfirm: h.confirm }))
vi.mock("@/lib/i18n/useContentT", () => ({ useTranslatedField: (_a: string, _b: number, _c: string, content: string) => content }))
vi.mock("@/components/ui/avatar", () => ({ Avatar: () => null, avatarHue: () => 200 }))
vi.mock("@/components/discussion/rich-content", async () => {
  const React = await import("react")
  return { RichContent: (p: any) => React.createElement("span", null, p.text) }
})
vi.mock("@/components/discussion/comment-repost-modal", () => ({ CommentRepostModal: () => null }))
afterEach(cleanup)

const c = (id: number, author_id: number, replies: any[] = []) => ({
  id, entity_type: "hypothesis", entity_id: 7, author_id, author_username: `u${author_id}`, author_display: `U${author_id}`,
  author_avatar_url: null, content: `text-${id}`, stance: "confirm", created_at: "2026-11-06T10:00:00Z", replies,
})

function renderThread(comment: any, inLab = false) {
  const qc = new QueryClient()
  const spy = vi.spyOn(qc, "invalidateQueries")
  render(
    <QueryClientProvider client={qc}>
      <DiscussionContext.Provider value={{ inLab }}>
        <CommentThread comment={comment} onReply={() => {}} currentUserId={1} />
      </DiscussionContext.Provider>
    </QueryClientProvider>,
  )
  return spy
}
beforeEach(() => {
  h.del.mockReset().mockResolvedValue({ data: {} })
  h.confirm.mockReset().mockResolvedValue(true)
})

describe("комментарий обсуждения: удаление своего", () => {
  it("кнопка только у своих комментариев и ответов; чужие её не имеют", () => {
    renderThread(c(10, 1, [c(11, 2), c(12, 1)]))
    expect(screen.getAllByTestId("comment-delete")).toHaveLength(2)   // корень (автор 1) и ответ 12 (автор 1), но не ответ 11
  })

  it("подтверждено: DELETE именно этого комментария, обновляются комментарии, лента и непрочитанное", async () => {
    const spy = renderThread(c(10, 1))
    fireEvent.click(screen.getByTestId("comment-delete"))
    await waitFor(() => expect(h.del).toHaveBeenCalledWith("/api/v1/comments/10"))
    await waitFor(() => expect(spy).toHaveBeenCalledWith({ queryKey: ["comments", "hypothesis", 7] }))
    expect(spy).toHaveBeenCalledWith({ queryKey: ["feed"] })
    expect(spy).toHaveBeenCalledWith({ queryKey: ["unread"] })
  })

  it("удаление ответа трогает только ответ", async () => {
    renderThread(c(10, 2, [c(12, 1)]))
    fireEvent.click(screen.getByTestId("comment-delete"))
    await waitFor(() => expect(h.del).toHaveBeenCalledWith("/api/v1/comments/12"))
    expect(h.del).toHaveBeenCalledTimes(1)
  })

  it("отказ в подтверждении: ничего не удаляется", async () => {
    h.confirm.mockResolvedValue(false)
    renderThread(c(10, 1))
    fireEvent.click(screen.getByTestId("comment-delete"))
    await waitFor(() => expect(h.confirm).toHaveBeenCalled())
    await new Promise(r => setTimeout(r, 40))
    expect(h.del).not.toHaveBeenCalled()
  })

  it("подтверждение называет ответы, которые уйдут вместе с комментарием; без ответов и вне лаборатории пояснения нет", async () => {
    renderThread(c(10, 1, [c(11, 2), c(12, 3)]))
    fireEvent.click(screen.getAllByTestId("comment-delete")[0])
    await waitFor(() => expect(h.confirm).toHaveBeenCalled())
    const arg = h.confirm.mock.calls[0][0]
    expect(arg.description).toBe(STRINGS["discussion.deleteWithReplies"].replace("{n}", "2"))
    expect(arg.title).toBe(STRINGS["discussion.deleteConfirm"])
    cleanup(); h.confirm.mockClear()
    renderThread(c(20, 1))
    fireEvent.click(screen.getByTestId("comment-delete"))
    await waitFor(() => expect(h.confirm).toHaveBeenCalled())
    expect(h.confirm.mock.calls[0][0].description).toBeUndefined()
  })

  it("запись в лаборатории: предупреждение, что копия останется в снимках", async () => {
    renderThread(c(10, 1), true)
    fireEvent.click(screen.getByTestId("comment-delete"))
    await waitFor(() => expect(h.confirm).toHaveBeenCalled())
    expect(h.confirm.mock.calls[0][0].description).toBe(STRINGS["discussion.deleteSnapshots"])
  })
})
