import { describe, it, expect, afterEach } from "vitest"
import { renderHook, act, cleanup } from "@testing-library/react"
import { parseViewMode, readViewMode, writeViewMode, useFeedViewMode } from "@/lib/feed-view-mode"

const fake = (init: Record<string, string> = {}) => {
  const m = new Map(Object.entries(init))
  return { m, getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v) } }
}
const broken = {
  getItem: () => { throw new Error("denied") },
  setItem: () => { throw new Error("quota") },
}

afterEach(() => { cleanup(); localStorage.clear() })

describe("режим ленты: чтение и запись", () => {
  it("по умолчанию карточки; список только при точном значении", () => {
    expect(parseViewMode("list")).toBe("list")
    expect(parseViewMode("cards")).toBe("cards")
    expect(parseViewMode(null)).toBe("cards")
    expect(parseViewMode("LIST")).toBe("cards")
    expect(parseViewMode("мусор")).toBe("cards")
  })

  it("запись кладёт значение под ключом meridian.feed.view и читается обратно", () => {
    const s = fake()
    writeViewMode("list", s)
    expect(s.m.get("meridian.feed.view")).toBe("list")
    expect(readViewMode(s)).toBe("list")
    writeViewMode("cards", s)
    expect(readViewMode(s)).toBe("cards")
  })

  it("недоступное хранилище (приватный режим, квота) не роняет: читается cards, запись молча пропускается", () => {
    expect(readViewMode(broken)).toBe("cards")
    expect(() => writeViewMode("list", broken)).not.toThrow()
    expect(readViewMode(null)).toBe("cards")
    expect(() => writeViewMode("list", null)).not.toThrow()
  })
})

describe("useFeedViewMode", () => {
  it("первый рендер всегда cards (гидратация), сохранённый список подставляется после монтирования", () => {
    localStorage.setItem("meridian.feed.view", "list")
    const seen: string[] = []
    renderHook(() => { const [m] = useFeedViewMode(); seen.push(m); return m })
    expect(seen[0]).toBe("cards")
    expect(seen[seen.length - 1]).toBe("list")
  })

  it("без сохранённого значения остаётся cards", () => {
    const { result } = renderHook(() => useFeedViewMode())
    expect(result.current[0]).toBe("cards")
  })

  it("смена режима меняет состояние и сохраняется в localStorage", () => {
    const { result } = renderHook(() => useFeedViewMode())
    act(() => result.current[1]("list"))
    expect(result.current[0]).toBe("list")
    expect(localStorage.getItem("meridian.feed.view")).toBe("list")
    act(() => result.current[1]("cards"))
    expect(result.current[0]).toBe("cards")
    expect(localStorage.getItem("meridian.feed.view")).toBe("cards")
  })
})
