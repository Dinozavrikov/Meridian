import { describe, it, expect, vi, beforeEach } from "vitest"
import { hypApi, imageApi } from "@/lib/api"
import { createLinksFor } from "@/components/entities/entity-link-picker"
import { uploadImagesFor } from "@/components/entities/images-tab"
import { createHypothesisFull } from "@/lib/create-hypothesis"

vi.mock("@/components/entities/images-tab", () => ({ uploadImagesFor: vi.fn() }))
vi.mock("@/components/entities/entity-link-picker", () => ({ createLinksFor: vi.fn() }))

const BASE = {
  id: 8, name: "Гипотеза", falsification_criteria: "если X", date_created: "2026-10-10", status: "идея", maturity: 2,
  tags: ["a"], visibility: "lab", lab_id: 5, stability: 6, research_load: 4, risk: 7,
}
const LINK = { type: "observation", id: 3, title: "", link_type: "связано" } as any
const IMG = new File(["x"], "b.png")
const submit = (over: any = {}) => ({ data: {}, links: [], images: [], pendingFiles: new Map(), ...over })

describe("createHypothesisFull", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.mocked(createLinksFor).mockReset(); vi.mocked(uploadImagesFor).mockReset()
    ;(URL as any).revokeObjectURL = vi.fn()
  })

  it("подменяет blob-url в описании и шлёт ПОЛНОЕ тело: шкалы, зрелость и критерий опровержения не сбрасываются", async () => {
    vi.spyOn(hypApi, "create").mockResolvedValue({ ...BASE, description: '<img src="blob:x">' } as never)
    vi.spyOn(imageApi, "upload").mockResolvedValue([{ url: "/uploads/a.png" }] as never)
    const update = vi.spyOn(hypApi, "update").mockResolvedValue({} as never)

    const res = await createHypothesisFull(submit({ pendingFiles: new Map([["blob:x", new File(["x"], "a.png")]]) }))

    expect(imageApi.upload).toHaveBeenCalledWith("hypothesis", 8, expect.any(Array))
    const [id, body] = update.mock.calls[0] as [number, any]
    expect(id).toBe(8)
    expect(body).toEqual(expect.objectContaining({
      name: "Гипотеза", falsification_criteria: "если X", status: "идея", maturity: 2, tags: ["a"],
      visibility: "lab", lab_id: 5, stability: 6, research_load: 4, risk: 7,
    }))
    expect(body.description).not.toContain("blob:x")
    expect(body.description).toContain("a.png")
    expect(res.description).toBe(body.description)
  })

  it("связи и галерея создаются под типом hypothesis с id новой гипотезы", async () => {
    vi.spyOn(hypApi, "create").mockResolvedValue({ ...BASE, description: "d" } as never)
    const update = vi.spyOn(hypApi, "update").mockResolvedValue({} as never)
    const res = await createHypothesisFull(submit({ links: [LINK], images: [IMG] }))
    expect(createLinksFor).toHaveBeenCalledWith("hypothesis", 8, [LINK])
    expect(uploadImagesFor).toHaveBeenCalledWith("hypothesis", 8, [IMG])
    expect(update).not.toHaveBeenCalled()
    expect("_failedSteps" in res).toBe(false)
  })

  it("падение связей не роняет создание: гипотеза возвращается, провал помечен, картинки загружены", async () => {
    vi.spyOn(hypApi, "create").mockResolvedValue({ ...BASE, description: "d" } as never)
    vi.mocked(createLinksFor).mockRejectedValueOnce(new Error("boom"))
    const res = await createHypothesisFull(submit({ links: [LINK], images: [IMG] }))
    expect(res.id).toBe(8)
    expect(res._failedSteps).toEqual(["links"])
    expect(uploadImagesFor).toHaveBeenCalledTimes(1)
  })

  it("падение самого создания пробрасывается", async () => {
    vi.spyOn(hypApi, "create").mockRejectedValue(new Error("boom"))
    await expect(createHypothesisFull(submit({ links: [LINK] }))).rejects.toThrow("boom")
    expect(createLinksFor).not.toHaveBeenCalled()
  })
})
