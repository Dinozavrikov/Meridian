import { afterEach, vi } from "vitest"
import { cleanup } from "@testing-library/react"

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

// jsdom не умеет холст без пакета canvas: каждый getContext печатал "Not implemented" в консоль.
// Тихий null дает то же поведение без шума. Это не spy, поэтому restoreAllMocks его не снимает.
// Тесты, которым нужен холст, подменяют getContext сами.
if (typeof HTMLCanvasElement !== "undefined") {
  HTMLCanvasElement.prototype.getContext = (() => null) as unknown as typeof HTMLCanvasElement.prototype.getContext
}
