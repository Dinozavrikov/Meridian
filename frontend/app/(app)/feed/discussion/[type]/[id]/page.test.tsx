import { describe, it, expect, vi } from "vitest"

vi.mock("@/lib/feed-server", () => ({ fetchEntityGroup: vi.fn(), fetchEntityCore: vi.fn() }))
vi.mock("./discussion-client", () => ({ DiscussionClient: () => null }))

import { fetchEntityGroup } from "@/lib/feed-server"
import DiscussionPage from "./page"

const props = async (group: unknown) => {
  vi.mocked(fetchEntityGroup).mockResolvedValue(group as never)
  const el = (await DiscussionPage({ params: Promise.resolve({ type: "question", id: "9" }) })) as { props: Record<string, unknown> }
  return el.props
}

describe("страница обсуждения (сервер)", () => {
  it("передает клиенту группу, полученную на сервере, и адрес записи", async () => {
    const group = { core: { visibility: "public", title: "Вопрос" }, members: [] }
    expect(await props(group)).toMatchObject({ type: "question", id: "9", initialGroup: group })
  })

  it("для записи, недоступной гостю, передает null: клиент загрузит ее сам", async () => {
    expect((await props(null)).initialGroup).toBeNull()
  })
})
