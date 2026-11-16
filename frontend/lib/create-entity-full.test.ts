import { describe, it, expect, vi, beforeEach } from "vitest"
import { imageApi } from "@/lib/api"
import { createLinksFor } from "@/components/entities/entity-link-picker"
import { uploadImagesFor } from "@/components/entities/images-tab"
import { makeCreateFull } from "@/lib/create-entity-full"

vi.mock("@/components/entities/images-tab", () => ({ uploadImagesFor: vi.fn() }))
vi.mock("@/components/entities/entity-link-picker", () => ({ createLinksFor: vi.fn() }))

const api = { create: vi.fn(), update: vi.fn() }
const buildUpdate = vi.fn((c: any, text: string) => ({ name: c.name, description: text, tag: "full" }))
const createFull = makeCreateFull({ entityType: "thing", api, textField: "description", buildUpdate })
const LINK = { type: "x", id: 1, title: "", link_type: "связано" } as any
const IMG = new File(["x"], "b.png")
const submit = (over: any = {}) => ({ data: { name: "n" }, links: [], images: [], pendingFiles: new Map(), ...over })

describe("makeCreateFull", () => {
  beforeEach(() => {
    vi.restoreAllMocks(); api.create.mockReset(); api.update.mockReset(); buildUpdate.mockClear()
    vi.mocked(createLinksFor).mockReset(); vi.mocked(uploadImagesFor).mockReset()
    ;(URL as any).revokeObjectURL = vi.fn()
  })

  it("создаёт запись телом формы и возвращает её без _failedSteps", async () => {
    api.create.mockResolvedValue({ id: 4, name: "n", description: "d" })
    const res = await createFull(submit())
    expect(api.create).toHaveBeenCalledWith({ name: "n" })
    expect(res.id).toBe(4)
    expect("_failedSteps" in res).toBe(false)
  })

  it("связи и галерея создаются под типом сущности из конфига и id новой записи", async () => {
    api.create.mockResolvedValue({ id: 4, description: "d" })
    await createFull(submit({ links: [LINK], images: [IMG] }))
    expect(createLinksFor).toHaveBeenCalledWith("thing", 4, [LINK])
    expect(uploadImagesFor).toHaveBeenCalledWith("thing", 4, [IMG])
  })

  it("inline-картинки: берёт текст из textField конфига, подменяет blob-url и шлёт ПОЛНОЕ тело из buildUpdate", async () => {
    api.create.mockResolvedValue({ id: 4, name: "n", description: '<img src="blob:x">' })
    vi.spyOn(imageApi, "upload").mockResolvedValue([{ url: "/uploads/a.png" }] as never)
    const res = await createFull(submit({ pendingFiles: new Map([["blob:x", new File(["x"], "a.png")]]) }))
    expect(imageApi.upload).toHaveBeenCalledWith("thing", 4, expect.any(Array))
    const [id, body] = api.update.mock.calls[0]
    expect(id).toBe(4)
    expect(body).toEqual(expect.objectContaining({ name: "n", tag: "full" }))
    expect(body.description).not.toContain("blob:x")
    expect(body.description).toContain("a.png")
    expect(res.description).toBe(body.description)
  })

  it("падение шага не роняет создание: запись возвращается, провал помечен, остальные шаги выполнены", async () => {
    api.create.mockResolvedValue({ id: 4, description: "d" })
    vi.mocked(uploadImagesFor).mockRejectedValueOnce(new Error("boom"))
    const res = await createFull(submit({ links: [LINK], images: [IMG] }))
    expect(res.id).toBe(4)
    expect(res._failedSteps).toEqual(["images"])
    expect(createLinksFor).toHaveBeenCalledTimes(1)
  })

  it("падение самого создания пробрасывается, дальше ничего не создаётся", async () => {
    api.create.mockRejectedValue(new Error("boom"))
    await expect(createFull(submit({ links: [LINK], images: [IMG] }))).rejects.toThrow("boom")
    expect(createLinksFor).not.toHaveBeenCalled()
    expect(uploadImagesFor).not.toHaveBeenCalled()
  })
})
