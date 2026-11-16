import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { api } from "@/lib/api"
import { setConsentHandler, type ConsentImpact } from "@/lib/consent"

const impacts: ConsentImpact[] = [{ entity_type: "observation", entity_id: 1, title: "N", owner_id: 1, lab_id: 1, lab_name: "L", lab_is_public: true,
  open_join: false, members: 3, via_type: "observation", via_id: 2, via_title: "R", options: ["me", "public"] }]
let calls: any[] = []
const originalAdapter = api.defaults.adapter

function install() {
  api.defaults.adapter = (async (config: any) => {
    calls.push({ params: config.params })
    if (config.params?.share) return { data: { ok: true }, status: 200, statusText: "OK", headers: {}, config }
    const err: any = new Error("409")
    err.isAxiosError = true; err.config = config
    err.response = { status: 409, data: { detail: { code: "needs_consent", impacts } }, headers: {}, config }
    throw err
  }) as any
}
beforeEach(() => { calls = [] })
afterEach(() => { setConsentHandler(null); api.defaults.adapter = originalAdapter })

describe("перехватчик: выбор «кому видно»", () => {
  it("диалог получает impacts с options", async () => {
    install(); let got: ConsentImpact[] = []
    setConsentHandler(async l => { got = l; return "me" })
    await api.post("/x")
    expect(got[0].options).toEqual(["me", "public"])
  })
  it("«только мне» повторяет запрос с share=me", async () => {
    install(); setConsentHandler(async () => "me")
    await api.post("/x")
    expect(calls).toHaveLength(2)
    expect(calls[1].params.share).toBe("me")
  })
  it("«всем» повторяет запрос с share=public", async () => {
    install(); setConsentHandler(async () => "public")
    await api.post("/x")
    expect(calls[1].params.share).toBe("public")
  })
  it("отмена: повтора нет, ошибка помечена consentDeclined", async () => {
    install(); setConsentHandler(async () => null)
    const err: any = await api.post("/x").catch(e => e)
    expect(err.consentDeclined).toBe(true)
    expect(calls).toHaveLength(1)
  })
})
