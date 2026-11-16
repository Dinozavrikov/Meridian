import { describe, it, expect } from "vitest"
import { API_BASE_URL } from "@/lib/api"
import type { LabFile } from "@/lib/lab-files-api"
import { entityFilesHref, fileHref, filterLabFiles, groupByEntity, thumbSrc, typeCounts } from "@/lib/lab-files-view"

const F = (over: Partial<LabFile> = {}): LabFile => ({
  kind: "attachment", id: 1, name: "a.txt", file_kind: "code", mime_type: "text/plain", size_bytes: 10,
  created_at: "2026-10-06T10:00:00Z", entity_type: "observation", entity_id: 5, entity_title: "Моё наблюдение",
  uploader_id: 1, uploader_username: "alexey", download_url: "/api/v1/attachments/1/download", url: null, thumb_url: null, ...over,
})

describe("ссылки", () => {
  it("на вкладку «Файлы» записи (id вкладки на страницах — images)", () => {
    expect(entityFilesHref({ entity_type: "observation", entity_id: 5 })).toBe("/observations?id=5&tab=images")
    expect(entityFilesHref({ entity_type: "hypothesis", entity_id: 9 })).toBe("/hypotheses?id=9&tab=images")
    expect(entityFilesHref({ entity_type: "worldview", entity_id: 2 })).toBe("/worldview?id=2&tab=images")
  })
  it("неизвестный тип записи — без ссылки, а не битая", () => {
    expect(entityFilesHref({ entity_type: "lab", entity_id: 1 })).toBeNull()
  })
  it("вложение качается через эндпоинт, картинка открывается из статики, миниатюра — отдельно", () => {
    expect(fileHref(F())).toBe(`${API_BASE_URL}/api/v1/attachments/1/download`)
    const img = F({ kind: "image", download_url: null, url: "/api/uploads/entity_images/x.jpg", thumb_url: "/api/uploads/entity_images/x_t.jpg" })
    expect(fileHref(img)).toBe(`${API_BASE_URL}/api/uploads/entity_images/x.jpg`)
    expect(thumbSrc(img)).toBe(`${API_BASE_URL}/api/uploads/entity_images/x_t.jpg`)
    expect(thumbSrc(F())).toBeNull()
  })
})

const ITEMS = [
  F({ id: 3, name: "newest.csv", entity_type: "hypothesis", entity_id: 7, entity_title: "Гипотеза А" }),
  F({ id: 2, name: "mid.txt", entity_type: "observation", entity_id: 5, entity_title: "Моё наблюдение" }),
  F({ id: 1, name: "old.txt", entity_type: "hypothesis", entity_id: 7, entity_title: "Гипотеза А" }),
  F({ id: 4, name: "x.bin", entity_type: "weird", entity_id: 1, entity_title: "" }),
]

describe("filterLabFiles", () => {
  it("по типу записи", () => {
    expect(filterLabFiles(ITEMS, { type: "hypothesis", query: "" }).map(f => f.id)).toEqual([3, 1])
    expect(filterLabFiles(ITEMS, { type: "all", query: "" })).toHaveLength(4)
  })
  it("по имени файла и по названию записи без учёта регистра и пробелов по краям", () => {
    expect(filterLabFiles(ITEMS, { type: "all", query: "  NEWEST " }).map(f => f.id)).toEqual([3])
    expect(filterLabFiles(ITEMS, { type: "all", query: "моё" }).map(f => f.id)).toEqual([2])
  })
  it("тип и поиск работают вместе; ничего не нашлось — пусто", () => {
    expect(filterLabFiles(ITEMS, { type: "hypothesis", query: "old" }).map(f => f.id)).toEqual([1])
    expect(filterLabFiles(ITEMS, { type: "observation", query: "old" })).toEqual([])
  })
})

describe("typeCounts / groupByEntity", () => {
  it("числа по типам: известные в привычном порядке, неизвестные в конце", () => {
    expect(typeCounts(ITEMS)).toEqual([["observation", 1], ["hypothesis", 2], ["weird", 1]])
  })
  it("группы по записям: порядок по самому свежему файлу, файлы внутри сохраняют порядок", () => {
    const groups = groupByEntity(ITEMS)
    expect(groups.map(g => g.key)).toEqual(["hypothesis:7", "observation:5", "weird:1"])
    expect(groups[0].files.map(f => f.id)).toEqual([3, 1])
    expect(groups[0].entity_title).toBe("Гипотеза А")
  })
  it("пустой вход — пустой результат", () => {
    expect(typeCounts([])).toEqual([])
    expect(groupByEntity([])).toEqual([])
  })
})
