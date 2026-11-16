import { describe, it, expect } from "vitest"
import { parseEntityDate, formatEntityStampFull } from "@/lib/theme"

const iso = (raw?: string) => parseEntityDate(raw)?.toISOString() ?? null

describe("parseEntityDate", () => {
  it("наивная дата-время (без Z и смещения) — это UTC", () => {
    expect(iso("2026-09-20T12:00:00")).toBe("2026-09-20T12:00:00.000Z")
  })

  it("Z остаётся Z", () => {
    expect(iso("2026-09-20T12:00:00Z")).toBe("2026-09-20T12:00:00.000Z")
  })

  it("смещение +00:00 разбирается (раньше получало лишнее Z и давало null)", () => {
    expect(iso("2026-09-20T12:00:00+00:00")).toBe("2026-09-20T12:00:00.000Z")
  })

  it("ненулевое смещение переводится в UTC", () => {
    expect(iso("2026-12-01T12:00:00+03:00")).toBe("2026-12-01T09:00:00.000Z")
    expect(iso("2026-12-01T12:00:00-05:00")).toBe("2026-12-01T17:00:00.000Z")
  })

  it("микросекунды Postgres (isoformat) не мешают", () => {
    expect(iso("2026-09-20T12:00:00.123456+00:00")).toBe("2026-09-20T12:00:00.123Z")
    expect(iso("2026-09-20T12:00:00.123456")).toBe("2026-09-20T12:00:00.123Z")
  })

  it("только дата — полночь UTC", () => {
    expect(iso("2026-09-20")).toBe("2026-09-20T00:00:00.000Z")
  })

  it("пусто и мусор → null", () => {
    expect(iso(undefined)).toBeNull()
    expect(iso("")).toBeNull()
    expect(iso("не дата")).toBeNull()
    expect(iso("2026-13-45T00:00:00Z")).toBeNull()
  })
})

describe("formatEntityStampFull", () => {
  it("строка со смещением даёт штамп, а не undefined", () => {
    expect(formatEntityStampFull("2026-12-01T12:00:00+03:00", "ru")).toMatch(/2026/)
  })
})
