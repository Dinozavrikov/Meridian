import { describe, it, expect, vi, afterEach } from "vitest"
import { api, feedApi } from "@/lib/api"

afterEach(() => vi.restoreAllMocks())

describe("feedApi: карточки-группы", () => {
  it("публичная лента: адрес и параметры (types — через запятую, pageSize → page_size)", async () => {
    const get = vi.spyOn(api, "get").mockResolvedValue({ data: { groups: [] } })
    expect(await feedApi.groupsPublic({ page: 2, pageSize: 5, types: ["observation", "task"], topic: "alpha" })).toEqual({ groups: [] })
    expect(get).toHaveBeenCalledWith("/api/v1/feed/groups/public",
      { params: { page: 2, page_size: 5, types: "observation,task", topic: "alpha" } })
  })
  it("лента лаборатории: id в адресе, без параметров — пустые значения", async () => {
    const get = vi.spyOn(api, "get").mockResolvedValue({ data: {} })
    await feedApi.groupsLab(7)
    expect(get).toHaveBeenCalledWith("/api/v1/feed/groups/lab/7",
      { params: { page: undefined, page_size: undefined, types: undefined, topic: undefined } })
  })
})
