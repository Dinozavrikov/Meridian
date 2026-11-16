import { describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"

vi.mock("@/lib/i18n/useT", () => ({
  useT: () => (key: string, vars?: Record<string, string | number>) => (vars ? `${key}:${Object.values(vars).join(",")}` : key),
}))
vi.mock("@/lib/api", () => ({ resolveMediaUrl: (u: string) => u }))

import { RichContent } from "./rich-content"

describe("RichContent", () => {
  it("подпись под видео идёт через ключ перевода, название сервиса подставляется", () => {
    const { container } = render(<RichContent text="https://www.youtube.com/watch?v=dQw4w9WgXcQ" />)
    expect(screen.getByText("discussion.videoOpen:YouTube"), "предусловие: видео распознано").toBeTruthy()
    expect(container.querySelector("img")).toBeNull()
    expect(screen.queryByText(/нажмите для просмотра/)).toBeNull()
  })

  it("подпись лайтбокса картинки идёт через ключ перевода", () => {
    const { container } = render(<RichContent text="https://example.com/proof.png" />)
    fireEvent.click(container.querySelector("img")!)
    expect(screen.getByRole("button"), "предусловие: лайтбокс открылся").toBeTruthy()
    expect(screen.getByText("discussion.attachedAsArgument")).toBeTruthy()
    expect(screen.queryByText("Приложено как аргумент")).toBeNull()
  })
})

describe("видео подключается только по нажатию", () => {
  it.each([
    ["YouTube", "https://www.youtube.com/watch?v=dQw4w9WgXcQ", "youtube.com/embed/dQw4w9WgXcQ"],
    ["Vimeo", "https://vimeo.com/76979871", "player.vimeo.com/video/76979871"],
  ])("%s: до нажатия нет ни одного внешнего адреса, после нажатия появляется плеер", (service, url, embed) => {
    const { container } = render(<RichContent text={url} />)
    const caption = screen.getByText(`discussion.videoOpen:${service}`)
    expect(container.querySelectorAll("[src]").length).toBe(0)
    fireEvent.click(caption)
    expect(container.querySelector("iframe")!.getAttribute("src")).toContain(embed)
  })
})
