import { describe, it, expect, vi, afterEach } from "vitest"
import { api, obsApi, hypApi, predApi } from "@/lib/api"
import { entityDeleteUrl } from "@/lib/entity-delete-path"

afterEach(() => vi.restoreAllMocks())

describe("entityDeleteUrl", () => {
  it("совпадает с адресами, по которым удаляют настоящие api-клиенты", async () => {
    const del = vi.spyOn(api, "delete").mockResolvedValue({} as never)
    await obsApi.delete(1)
    await hypApi.delete(2)
    await predApi.delete(3)
    expect(del.mock.calls.map(c => c[0])).toEqual([
      entityDeleteUrl("observation", 1), entityDeleteUrl("hypothesis", 2), entityDeleteUrl("prediction", 3),
    ])
  })
  it("остальные типы: адреса бэкенда (api.ts строки 239, 262, 271)", () => {
    expect(entityDeleteUrl("worldview", 4)).toBe("/api/v1/worldview/4")
    expect(entityDeleteUrl("question", 5)).toBe("/api/v1/questions/5")
    expect(entityDeleteUrl("task", 6)).toBe("/api/v1/tasks/6")
  })
  it("неизвестный тип: ошибка, а не удаление по случайному адресу", () => {
    expect(() => entityDeleteUrl("result", 1)).toThrow()
  })
})
