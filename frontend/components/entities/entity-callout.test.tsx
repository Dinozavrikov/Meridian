import { describe, it, expect, afterEach } from "vitest"
import { render, screen, cleanup } from "@testing-library/react"
import { EntityCallout } from "@/components/entities/entity-callout"

afterEach(cleanup)

describe("EntityCallout: ссылка в заголовке", () => {
  it("с href заголовок — ссылка на нужный адрес", () => {
    render(<EntityCallout tone="#F5A623" icon={<span />} title="Гипотеза" href="/hypotheses?id=5&tab=detail">Текст</EntityCallout>)
    expect(screen.getByRole("link", { name: /Гипотеза/ }).getAttribute("href")).toBe("/hypotheses?id=5&tab=detail")
  })

  it("без href ссылки нет", () => {
    render(<EntityCallout tone="#F5A623" icon={<span />} title="Гипотеза">Текст</EntityCallout>)
    expect(screen.queryByRole("link")).toBeNull()
  })
})
