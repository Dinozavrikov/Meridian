import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"

vi.mock("@/lib/i18n/useT", () => ({ useT: () => (key: string) => key }))

import { SentimentMeter } from "./sentiment-meter"

describe("SentimentMeter", () => {
  it("подпись идёт через ключ перевода, а не литералом", () => {
    const comments = [{ id: 1, stance: "confirm", replies: [{ id: 2, stance: "refute", replies: [] }] }]
    render(<SentimentMeter comments={comments} />)
    expect(screen.getByText("discussion.sentiment")).toBeTruthy()
    expect(screen.queryByText("Настроение обсуждения")).toBeNull()
    expect(screen.getAllByText("50%").length).toBe(2)   // доли считаются по ответам тоже
  })

  it("без позиций в комментариях счётчика нет", () => {
    const { container } = render(<SentimentMeter comments={[{ id: 1, stance: null, replies: [] }]} />)
    expect(container.innerHTML).toBe("")
  })
})
