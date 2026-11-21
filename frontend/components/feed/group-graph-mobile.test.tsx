import React from "react"
import { describe, it, expect, vi, afterEach } from "vitest"
import { render, screen, cleanup } from "@testing-library/react"
import { STRINGS } from "@/lib/i18n/strings"
import { GroupGraph } from "@/components/feed/group-graph"
import type { FeedGroup } from "@/lib/feed-groups"

vi.mock("@/lib/i18n/useT", () => ({
  useT: () => (key: string, vars?: Record<string, string | number>) =>
    Object.entries(vars ?? {}).reduce((a, [k, v]) => a.replaceAll(`{${k}}`, String(v)), (STRINGS as Record<string, string>)[key] ?? key),
}))
afterEach(cleanup)

const g = {
  key: "hypothesis:1", activity: new Date().toISOString(), size: 3, topics: [], internal: [], outside: [],
  core: { id: 1, entity_id: 1, type: "hypothesis", title: "Т", preview: "", author_username: "a", author_display: "A", created_at: new Date().toISOString(), comment_count: 0, status: null },
  members: [],
} as unknown as FeedGroup

describe("GroupGraph: кнопка на телефоне", () => {
  it("внутри кнопки есть видимая подпись и счетчик для мобильной верстки", () => {
    render(<GroupGraph group={g} />)
    const cta = screen.getByTestId("group-graph-cta")
    expect(cta.textContent).toContain(STRINGS["feedGroups.graphOpenCta" as keyof typeof STRINGS])
    expect(cta.textContent).toContain("3")
    expect(screen.getByTestId("group-graph-open").contains(cta)).toBe(true)
  })

  it("раскладку кнопки задает CSS, а не инлайн-стиль, который перебил бы мобильные правила", () => {
    render(<GroupGraph group={g} />)
    const btn = screen.getByTestId("group-graph-open") as HTMLElement
    expect(btn.style.display).toBe("")
    expect(btn.style.padding).toBe("")
  })

  it("кнопка называется одним именем: подпись скрыта от скринридера", () => {
    render(<GroupGraph group={g} />)
    expect(screen.getByRole("button", { name: STRINGS["feedGroups.graphOpen" as keyof typeof STRINGS] })).toBeTruthy()
    expect(screen.getByTestId("group-graph-cta").getAttribute("aria-hidden")).toBe("true")
  })
})
