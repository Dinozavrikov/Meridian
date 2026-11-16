import { describe, it, expect, vi } from "vitest"
vi.mock("@/lib/api", () => ({ api: { get: vi.fn() } }))
import { isLinkShortcut } from "@/lib/editor-mention"

const ev = (o: Partial<KeyboardEvent>) => ({ key: "", code: "", ctrlKey: false, metaKey: false, ...o })

describe("isLinkShortcut", () => {
  it("английская раскладка: Ctrl+K и Cmd+K, регистр не важен", () => {
    expect(isLinkShortcut(ev({ key: "k", code: "KeyK", ctrlKey: true }))).toBe(true)
    expect(isLinkShortcut(ev({ key: "K", code: "KeyK", metaKey: true }))).toBe(true)
  })
  it("русская раскладка (key «л», code KeyK): срабатывает", () => {
    expect(isLinkShortcut(ev({ key: "л", code: "KeyK", ctrlKey: true }))).toBe(true)
  })
  it("Dvorak: буква K на другой физической клавише срабатывает", () => {
    expect(isLinkShortcut(ev({ key: "k", code: "KeyV", ctrlKey: true }))).toBe(true)
  })
  it("Dvorak: физическое QWERTY-K даёт «t», это Ctrl+T и не наша комбинация", () => {
    expect(isLinkShortcut(ev({ key: "t", code: "KeyK", ctrlKey: true }))).toBe(false)
  })
  it("без Ctrl/Cmd не срабатывает ни на какой раскладке", () => {
    expect(isLinkShortcut(ev({ key: "k", code: "KeyK" }))).toBe(false)
    expect(isLinkShortcut(ev({ key: "л", code: "KeyK" }))).toBe(false)
  })
})
