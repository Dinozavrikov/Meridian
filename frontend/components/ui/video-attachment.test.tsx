import { describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"

vi.mock("@/lib/i18n/useT", () => ({ useT: () => (key: string) => key }))

import { VideoAttachment } from "./video-attachment"

describe("VideoAttachment", () => {
  it("YouTube не запрашивается до нажатия, после нажатия подключается плеер", () => {
    const { container } = render(<VideoAttachment ytId="dQw4w9WgXcQ" accent="#ffffff" />)
    expect(container.querySelectorAll("[src]").length).toBe(0)
    fireEvent.click(screen.getByText("notes.clickToWatch"))
    expect(container.querySelector("iframe")!.getAttribute("src")).toContain("youtube.com/embed/dQw4w9WgXcQ")
  })
})
