import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { api } from "@/lib/api"
import { setConsentHandler } from "@/lib/consent"

const impacts = [{ entity_type: "observation", entity_id: 1, title: "N", owner_id: 1, lab_id: 1, lab_name: "L", lab_is_public: false,
                   open_join: false, members: 3, via_type: "observation", via_id: 2, via_title: "R" }]
type Call = { url?: string; params?: any; data?: any }
let calls: Call[] = []
const originalAdapter = api.defaults.adapter

function install(code = "needs_consent") {
  api.defaults.adapter = (async (config: any) => {
    calls.push({ url: config.url, params: config.params, data: config.data })
    if (config.params?.share) return { data: { ok: true }, status: 200, statusText: "OK", headers: {}, config }
    const err: any = new Error("409")
    err.isAxiosError = true; err.config = config
    err.response = { status: 409, data: { detail: { code, impacts } }, headers: {}, config }
    throw err
  }) as any
}

beforeEach(() => { calls = [] })
afterEach(() => { setConsentHandler(null); api.defaults.adapter = originalAdapter })

describe("перехватчик согласия (409 needs_consent)", () => {
  it("после согласия повторяет тот же запрос с share=lab и тем же телом", async () => {
    install(); setConsentHandler(async () => "lab")
    const r = await api.put("/x", { a: 1 })
    expect(r.data).toEqual({ ok: true })
    expect(calls).toHaveLength(2)
    expect(calls[0].params?.share).toBeUndefined()
    expect(calls[1].params.share).toBe("lab")
    expect(calls[1].data).toBe(calls[0].data)
  })
  it("адрес с готовой строкой запроса сохраняется при повторе", async () => {
    install(); setConsentHandler(async () => "lab")
    await api.post("/y?from_type=a&to_id=5")
    expect(calls[1].url).toContain("from_type=a&to_id=5")
    expect(calls[1].params.share).toBe("lab")
  })
  it("отказ: запрос не повторяется, ошибка помечена consentDeclined", async () => {
    install(); setConsentHandler(async () => null)
    const err: any = await api.post("/z").catch(e => e)
    expect(err.consentDeclined).toBe(true)
    expect(calls).toHaveLength(1)
  })
  it("без диалога молча не открываем: ответ «нет»", async () => {
    install()
    await expect(api.post("/z")).rejects.toBeTruthy()
    expect(calls).toHaveLength(1)
  })
  it("чужой 409 (другой code) не вызывает диалог", async () => {
    install("endpoint_gone"); let asked = false
    setConsentHandler(async () => { asked = true; return "lab" })
    await expect(api.post("/z")).rejects.toBeTruthy()
    expect(asked).toBe(false)
    expect(calls).toHaveLength(1)
  })
})
