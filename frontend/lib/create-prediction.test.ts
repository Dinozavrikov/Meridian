import { describe, it, expect, vi, beforeEach } from "vitest"
import { predApi, imageApi } from "@/lib/api"
import { createLinksFor } from "@/components/entities/entity-link-picker"
import { uploadImagesFor } from "@/components/entities/images-tab"
import { createPredictionFull } from "@/lib/create-prediction"

vi.mock("@/components/entities/images-tab", () => ({ uploadImagesFor: vi.fn() }))
vi.mock("@/components/entities/entity-link-picker", () => ({ createLinksFor: vi.fn() }))

const BASE = { id: 7, title: "", date_created: "2026-10-10", expected_check_date: "2027-01-01T00:00:00Z", hypothesis_id: null, status: "не проверен", result_notes: "", confidence: 70, visibility: "lab", lab_id: 5 }
const LINK = { type: "hypothesis", id: 3, title: "", link_type: "связано" } as any
const IMG = new File(["x"], "b.png")
const submit = (over: any = {}) => ({ data: {}, links: [], images: [], pendingFiles: new Map(), ...over })

describe("createPredictionFull", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.mocked(createLinksFor).mockReset(); vi.mocked(uploadImagesFor).mockReset()
    ;(URL as any).revokeObjectURL = vi.fn()
  })

  it("подменяет blob-url inline-картинки на реальный и сохраняет текст вместе с уверенностью", async () => {
    vi.spyOn(predApi, "create").mockResolvedValue({ ...BASE, text: '<img src="blob:x">' } as never)
    vi.spyOn(imageApi, "upload").mockResolvedValue([{ url: "/uploads/a.png" }] as never)
    const update = vi.spyOn(predApi, "update").mockResolvedValue({} as never)

    const res = await createPredictionFull(submit({ pendingFiles: new Map([["blob:x", new File(["x"], "a.png")]]) }))

    expect(imageApi.upload).toHaveBeenCalledWith("prediction", 7, expect.any(Array))
    const sent = update.mock.calls[0][1] as any
    expect(sent.text).not.toContain("blob:x")
    expect(sent.text).toContain("a.png")
    expect(sent.confidence).toBe(70)
    expect(res.text).toBe(sent.text)
    expect("_failedSteps" in res).toBe(false)
  })

  it("без inline-картинок не делает лишний update; связи и галерея создаются с id нового прогноза", async () => {
    vi.spyOn(predApi, "create").mockResolvedValue({ ...BASE, text: "t" } as never)
    const update = vi.spyOn(predApi, "update").mockResolvedValue({} as never)
    await createPredictionFull(submit({ links: [LINK], images: [IMG] }))
    expect(update).not.toHaveBeenCalled()
    expect(createLinksFor).toHaveBeenCalledWith("prediction", 7, [LINK])
    expect(uploadImagesFor).toHaveBeenCalledWith("prediction", 7, [IMG])
  })

  it("падение галереи не роняет создание: прогноз возвращается, провал помечен", async () => {
    vi.spyOn(predApi, "create").mockResolvedValue({ ...BASE, text: "t" } as never)
    vi.mocked(uploadImagesFor).mockRejectedValueOnce(new Error("boom"))
    const res = await createPredictionFull(submit({ links: [LINK], images: [IMG] }))
    expect(res.id).toBe(7)
    expect(res._failedSteps).toEqual(["images"])
  })

  it("падение самого создания пробрасывается, и ничего дальше не создаётся", async () => {
    vi.spyOn(predApi, "create").mockRejectedValue(new Error("boom"))
    await expect(createPredictionFull(submit({ links: [LINK], images: [IMG] }))).rejects.toThrow("boom")
    expect(createLinksFor).not.toHaveBeenCalled()
    expect(uploadImagesFor).not.toHaveBeenCalled()
  })
})
