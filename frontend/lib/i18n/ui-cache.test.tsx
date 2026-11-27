// Кэш переводов интерфейса вместе с настоящим загрузчиком: что видит пользователь при изменении оригинала и смене языка.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { renderHook, waitFor } from "@testing-library/react"

vi.mock("@/lib/api", async orig => ({ ...(await orig<object>()), api: { post: vi.fn() } }))
import { api } from "@/lib/api"
import { useStore } from "@/lib/store"
import { STRINGS } from "@/lib/i18n/strings"
import { uiCacheKey } from "@/lib/i18n/cache-keys"
import { packUiCache, readUiCache } from "@/lib/i18n/ui-cache"
import { useTranslationsLoader } from "@/lib/i18n/useT"

const CHANGED = "consent.title"
const SAME = "consent.row"
const post = vi.mocked(api.post)
const answer = (translate: (key: string) => string | undefined) =>
  post.mockImplementation((async (_u: string, body: { strings: Record<string, string> }) => ({
    data: { translations: Object.fromEntries(Object.keys(body.strings).flatMap(k => {
      const t = translate(k)
      return t === undefined ? [] : [[k, t]]
    })) },
  })) as never)
const hang = () => post.mockImplementation((() => new Promise(() => {})) as never)
let unmount: (() => void) | null = null
const load = () => { unmount = renderHook(() => useTranslationsLoader()).unmount }
const shown = () => useStore.getState().translations

beforeEach(() => {
  localStorage.clear()
  post.mockReset()
  useStore.setState({ locale: "en", translations: {} } as never)
})
afterEach(() => { unmount?.(); unmount = null })

describe("кэш переводов интерфейса", () => {
  it("перевод измененной строки не переживает изменения оригинала, даже когда сервер молчит", async () => {
    const initial = JSON.stringify({
      ...packUiCache({ [CHANGED]: "Old promise" }, { [CHANGED]: "прежний оригинал" }),
      ...packUiCache({ [SAME]: "Still valid" }, STRINGS),
    })
    localStorage.setItem(uiCacheKey("en"), initial)
    answer(() => undefined)
    load()
    await waitFor(() => expect(localStorage.getItem(uiCacheKey("en"))).not.toBe(initial), { timeout: 10000 })
    expect(shown()[CHANGED]).toBeUndefined()
    expect(shown()[SAME]).toBe("Still valid")
    expect(localStorage.getItem(uiCacheKey("en"))).not.toContain("Old promise")
  }, 15000)

  it("строки прежнего языка не остаются, пока грузится новый", async () => {
    useStore.setState({ locale: "de", translations: { [CHANGED]: "English title" } } as never)
    hang()
    load()
    await waitFor(() => expect(post).toHaveBeenCalled())
    expect(shown()).toEqual({})
  })

  it("кэш прежней версии не показывается и удаляется", async () => {
    localStorage.setItem("i18n-cache:v2:en", JSON.stringify({ [CHANGED]: "Old v2" }))
    hang()
    load()
    await waitFor(() => expect(post).toHaveBeenCalled())
    expect(shown()[CHANGED]).toBeUndefined()
    expect(localStorage.getItem("i18n-cache:v2:en")).toBeNull()
  })

  it("сохраненный после загрузки перевод читается при следующем запуске", async () => {
    answer(k => (k === SAME ? "Fresh row" : undefined))
    load()
    await waitFor(() => expect(localStorage.getItem(uiCacheKey("en"))).not.toBeNull(), { timeout: 10000 })
    expect(readUiCache(localStorage.getItem(uiCacheKey("en")), STRINGS)).toEqual({ [SAME]: "Fresh row" })
  }, 15000)

  it("битый и чужой формат дает пустой словарь", () => {
    for (const raw of [null, "{oops", "undefined", "42", JSON.stringify({ [SAME]: "plain" }), JSON.stringify({ [SAME]: null })]) {
      expect(readUiCache(raw, STRINGS), String(raw)).toEqual({})
    }
  })
})
