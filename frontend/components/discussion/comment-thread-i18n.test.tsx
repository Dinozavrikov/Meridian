import React from "react"
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest"
import { render, screen, cleanup } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { CommentThread } from "@/components/discussion/comment-thread"

// useT возвращает ключ (с переменными): любой оставшийся в разметке литерал сразу виден.
vi.mock("next/link", async () => {
  const React = await import("react")
  return { default: ({ href, children, ...rest }: any) => React.createElement("a", { href, ...rest }, children) }
})
vi.mock("@/lib/i18n/useT", () => ({
  useT: () => (key: string, vars?: Record<string, string | number>) => key + (vars ? `:${Object.values(vars).join(",")}` : ""),
}))
vi.mock("@/lib/api", () => ({ api: { delete: vi.fn() } }))
vi.mock("@/lib/confirm", () => ({ askConfirm: vi.fn() }))
vi.mock("@/lib/i18n/useContentT", () => ({ useTranslatedField: (_a: string, _b: number, _c: string, content: string) => content }))
vi.mock("@/components/ui/avatar", () => ({ Avatar: () => null, avatarHue: () => 200 }))
vi.mock("@/components/discussion/rich-content", async () => {
  const React = await import("react")
  return { RichContent: (p: any) => React.createElement("span", null, p.text) }
})
vi.mock("@/components/discussion/comment-repost-modal", () => ({ CommentRepostModal: () => null }))

const NOW = new Date("2026-11-06T10:00:00Z")
beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(NOW) })
afterEach(() => { cleanup(); vi.useRealTimers() })

const at = (secondsAgo: number) => new Date(NOW.getTime() - secondsAgo * 1000).toISOString()
const comment = (secondsAgo: number) => ({
  id: 1, entity_type: "hypothesis", entity_id: 7, author_id: 2, author_username: "u2", author_display: "U2",
  author_avatar_url: null, content: "text", stance: "confirm", created_at: at(secondsAgo), replies: [],
})
const show = (secondsAgo: number) => render(
  <QueryClientProvider client={new QueryClient()}>
    <CommentThread comment={comment(secondsAgo)} onReply={() => {}} currentUserId={1} />
  </QueryClientProvider>,
)

describe("комментарий обсуждения: ни одной литеральной строки интерфейса", () => {
  it("кнопки идут через ключи", () => {
    show(10)
    expect(screen.getByText(/discussion\.reply/)).toBeTruthy()
    expect(screen.getByText(/discussion\.repost/)).toBeTruthy()
  })

  it.each([
    [10, "discussion.timeNow"],
    [30 * 60, "discussion.timeMin:30"],
    [3 * 3600, "discussion.timeHour:3"],
    [2 * 86400, "discussion.timeDay:2"],
  ])("время %i с назад -> %s", (ago, expected) => {
    show(ago)
    expect(screen.getByText(expected)).toBeTruthy()
  })
})
