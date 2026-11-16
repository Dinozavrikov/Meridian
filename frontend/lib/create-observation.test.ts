import { describe, it, expect, vi, beforeEach } from "vitest"
import { obsApi, imageApi } from "@/lib/api"
import { createLinksFor } from "@/components/entities/entity-link-picker"
import { uploadImagesFor } from "@/components/entities/images-tab"
import { createObservationFull } from "@/lib/create-observation"

vi.mock("@/components/entities/images-tab", () => ({ uploadImagesFor: vi.fn() }))
vi.mock("@/components/entities/entity-link-picker", () => ({ createLinksFor: vi.fn() }))

const BASE = { id: 7, date: "2026-10-10", author: "", title: "", tags: [], status: "осмысленное", visibility: "lab", lab_id: 5 }
const LINK = { type: "hypothesis", id: 3, title: "", link_type: "связано" } as any
const IMG = new File(["x"], "b.png")
const submit = (over: any = {}) => ({ data: {}, links: [], images: [], pendingFiles: new Map(), ...over })

describe("createObservationFull", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.mocked(createLinksFor).mockReset(); vi.mocked(uploadImagesFor).mockReset()
    ;(URL as any).revokeObjectURL = vi.fn()
  })

  it("подменяет blob-url inline-картинки на реальный URL и сохраняет обновлённый текст", async () => {
    vi.spyOn(obsApi, "create").mockResolvedValue({ ...BASE, text: '<img src="blob:x">' } as never)
    vi.spyOn(imageApi, "upload").mockResolvedValue([{ url: "/uploads/a.png" }] as never)
    const update = vi.spyOn(obsApi, "update").mockResolvedValue({} as never)

    const res = await createObservationFull(submit({ pendingFiles: new Map([["blob:x", new File(["x"], "a.png")]]) }))

    expect(imageApi.upload).toHaveBeenCalledWith("observation", 7, expect.any(Array))
    const sentText = (update.mock.calls[0][1] as any).text as string
    expect(sentText).not.toContain("blob:x")
    expect(sentText).toContain("a.png")
    expect(res.text).toBe(sentText)
    expect("_failedSteps" in res).toBe(false)
  })

  it("без inline-картинок не делает лишний update; связи и галерея создаются с id новой записи", async () => {
    vi.spyOn(obsApi, "create").mockResolvedValue({ ...BASE, text: "t" } as never)
    const update = vi.spyOn(obsApi, "update").mockResolvedValue({} as never)
    const res = await createObservationFull(submit({ links: [LINK], images: [IMG] }))
    expect(update).not.toHaveBeenCalled()
    expect(createLinksFor).toHaveBeenCalledWith("observation", 7, [LINK])
    expect(uploadImagesFor).toHaveBeenCalledWith("observation", 7, [IMG])
    expect("_failedSteps" in res).toBe(false)
  })

  it("падение галереи не роняет создание: запись возвращается, провал помечен, связи созданы", async () => {
    vi.spyOn(obsApi, "create").mockResolvedValue({ ...BASE, text: "t" } as never)
    vi.mocked(uploadImagesFor).mockRejectedValueOnce(new Error("boom"))
    const res = await createObservationFull(submit({ links: [LINK], images: [IMG] }))
    expect(res.id).toBe(7)
    expect(res._failedSteps).toEqual(["images"])
    expect(createLinksFor).toHaveBeenCalledTimes(1)
  })

  it("падение связей не мешает загрузке картинок", async () => {
    vi.spyOn(obsApi, "create").mockResolvedValue({ ...BASE, text: "t" } as never)
    vi.mocked(createLinksFor).mockRejectedValueOnce(new Error("boom"))
    const res = await createObservationFull(submit({ links: [LINK], images: [IMG] }))
    expect(res._failedSteps).toEqual(["links"])
    expect(uploadImagesFor).toHaveBeenCalledTimes(1)
  })

  it("падение загрузки inline-картинки: запись возвращается, провал помечен, текст не перезаписывается", async () => {
    vi.spyOn(obsApi, "create").mockResolvedValue({ ...BASE, text: '<img src="blob:x">' } as never)
    vi.spyOn(imageApi, "upload").mockRejectedValue(new Error("boom"))
    const update = vi.spyOn(obsApi, "update").mockResolvedValue({} as never)
    const res = await createObservationFull(submit({ pendingFiles: new Map([["blob:x", new File(["x"], "a.png")]]) }))
    expect(res.id).toBe(7)
    expect(res._failedSteps).toEqual(["inline"])
    expect(update).not.toHaveBeenCalled()
  })

  it("падение самого создания пробрасывается, и ничего дальше не создаётся", async () => {
    vi.spyOn(obsApi, "create").mockRejectedValue(new Error("boom"))
    await expect(createObservationFull(submit({ links: [LINK], images: [IMG] }))).rejects.toThrow("boom")
    expect(createLinksFor).not.toHaveBeenCalled()
    expect(uploadImagesFor).not.toHaveBeenCalled()
  })
})

describe("createObservationFull: PUT после подмены inline-картинок", () => {
  beforeEach(() => { vi.restoreAllMocks(); (URL as any).revokeObjectURL = vi.fn() })

  it("сохраняет значимость: иначе PUT мог бы сбросить выбранную в форме значимость", async () => {
    vi.spyOn(obsApi, "create").mockResolvedValue({ ...BASE, importance: 4, text: '<img src="blob:x">' } as never)
    vi.spyOn(imageApi, "upload").mockResolvedValue([{ url: "/uploads/a.png" }] as never)
    const update = vi.spyOn(obsApi, "update").mockResolvedValue({} as never)
    await createObservationFull(submit({ pendingFiles: new Map([["blob:x", new File(["x"], "a.png")]]) }))
    expect((update.mock.calls[0][1] as any).importance).toBe(4)
  })
})
