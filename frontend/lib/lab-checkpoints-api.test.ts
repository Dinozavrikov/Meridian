import { afterEach, describe, it, expect, vi } from "vitest"
import { readFileSync } from "node:fs"
import path from "node:path"
import { api, API_BASE_URL } from "@/lib/api"
import { STRINGS } from "@/lib/i18n/strings"
import {
  CHECKPOINT_ERROR_KEYS, VERIFY_PROBLEM_KEYS, formatBytes, labCheckpointsApi, parseCheckpointError, shortHash, verifyProblemKey,
} from "@/lib/lab-checkpoints-api"

const S = STRINGS as Record<string, string>

function httpError(status: number, detail: unknown) {
  return Object.assign(new Error(`Request failed with status code ${status}`), {
    isAxiosError: true, response: { status, data: { detail } },
  })
}
const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort()

afterEach(() => vi.restoreAllMocks())

describe("labCheckpointsApi", () => {
  it("list / storage бьют в эндпоинты лаборатории", async () => {
    const get = vi.spyOn(api, "get").mockResolvedValue({ data: [{ id: 1 }] })
    expect(await labCheckpointsApi.list(3)).toEqual([{ id: 1 }])
    await labCheckpointsApi.storage(3)
    expect(get).toHaveBeenNthCalledWith(1, "/api/v1/labs/3/checkpoints")
    expect(get).toHaveBeenNthCalledWith(2, "/api/v1/labs/3/checkpoints/storage")
  })

  it("create шлёт подпись как есть (null — без подписи)", async () => {
    const post = vi.spyOn(api, "post").mockResolvedValue({ data: { id: 9 } })
    await labCheckpointsApi.create(3, "перед опытом")
    await labCheckpointsApi.create(3, null)
    expect(post).toHaveBeenNthCalledWith(1, "/api/v1/labs/3/checkpoints", { title: "перед опытом" })
    expect(post).toHaveBeenNthCalledWith(2, "/api/v1/labs/3/checkpoints", { title: null })
  })

  it("verify просит проверить и файлы, publish шлёт is_published", async () => {
    const get = vi.spyOn(api, "get").mockResolvedValue({ data: { ok: true, problems: [], commit_hash: "x" } })
    const patch = vi.spyOn(api, "patch").mockResolvedValue({ data: { id: 5 } })
    await labCheckpointsApi.verify(3, 5)
    await labCheckpointsApi.publish(3, 5, true)
    await labCheckpointsApi.publish(3, 5, false)
    expect(get).toHaveBeenCalledWith("/api/v1/labs/3/checkpoints/5/verify", { params: { files: true } })
    expect(patch).toHaveBeenNthCalledWith(1, "/api/v1/labs/3/checkpoints/5/publish", { is_published: true })
    expect(patch).toHaveBeenNthCalledWith(2, "/api/v1/labs/3/checkpoints/5/publish", { is_published: false })
  })

  it("fileUrl — прямой адрес скачивания файла снимка", () => {
    expect(labCheckpointsApi.fileUrl(3, 5, 9)).toBe(`${API_BASE_URL}/api/v1/labs/3/checkpoints/5/files/9`)
  })
})

describe("formatBytes", () => {
  it.each([
    [0, "0 B"], [900, "900 B"], [1024, "1 KB"], [1536, "1.5 KB"], [1024 ** 2, "1 MB"],
    [500 * 1024 ** 2, "500 MB"], [2 * 1024 ** 3, "2 GB"], [1000 * 1024, "1000 KB"],
  ])("%s -> %s", (n, text) => expect(formatBytes(n)).toBe(text))
  it.each([-1, NaN, Infinity])("%s -> прочерк", n => expect(formatBytes(n)).toBe("—"))
})

const CASES: [string, unknown, string, Record<string, string | number>][] = [
  ["409 бюджет", httpError(409, { code: "checkpoint_budget_exceeded", used_bytes: 900, needed_bytes: 300, budget_bytes: 1024 ** 3 }),
    "labCheckpoints.err.budget", { used: "900 B", needed: "300 B", budget: "1 GB" }],
  ["409 частота", httpError(409, { code: "checkpoint_rate_limit", per_hour: 30 }), "labCheckpoints.err.rateLimit", { n: 30 }],
  ["409 слишком большой", httpError(409, { code: "checkpoint_too_large", bytes: 2 * 1024 ** 3, limit: 500 * 1024 ** 2 }),
    "labCheckpoints.err.tooLarge", { size: "2 GB", limit: "500 MB" }],
  ["409 конфликт", httpError(409, { code: "checkpoint_conflict" }), "labCheckpoints.err.conflict", {}],
  ["409 лаба не публична", httpError(409, { code: "lab_not_public" }), "labCheckpoints.err.labNotPublic", {}],
  ["403", httpError(403, "Нет прав"), "labCheckpoints.err.forbidden", {}],
  ["404", httpError(404, "Не найдено"), "labCheckpoints.err.notFound", {}],
  ["нет связи", Object.assign(new Error("Network Error"), { isAxiosError: true, request: {} }), "labCheckpoints.err.network", {}],
  ["чужое исключение", new TypeError("boom"), "labCheckpoints.err.generic", {}],
  ["500", httpError(500, "x"), "labCheckpoints.err.generic", {}],
  ["409 неизвестный код", httpError(409, { code: "новый_код" }), "labCheckpoints.err.generic", {}],
  ["409 detail-строка", httpError(409, "строка"), "labCheckpoints.err.generic", {}],
  ["409 без detail", { response: { status: 409, data: {} } }, "labCheckpoints.err.generic", {}],
  ["422 массив", httpError(422, [{ msg: "x" }]), "labCheckpoints.err.generic", {}],
  ["rate_limit без числа", httpError(409, { code: "checkpoint_rate_limit" }), "labCheckpoints.err.rateLimit", { n: "?" }],
]

describe("parseCheckpointError", () => {
  it.each(CASES)("%s", (_name, err, key, params) => {
    expect(parseCheckpointError(err)).toEqual({ key, params })
  })
  it.each([null, undefined, "x", 5, {}])("%s не роняет парсер", err => {
    expect(parseCheckpointError(err).key).toBe("labCheckpoints.err.generic")
  })
})

describe("verifyProblemKey", () => {
  it.each([
    ["item_count", "labCheckpoints.verify.problem.itemCount", {}],
    ["tree", "labCheckpoints.verify.problem.tree", {}],
    ["commit", "labCheckpoints.verify.problem.commit", {}],
    ["parent", "labCheckpoints.verify.problem.parent", {}],
    ["item:entity:observation:5", "labCheckpoints.verify.problem.item", { what: "entity:observation:5" }],
    ["blob:" + "ab12cd34ef56" + "7890", "labCheckpoints.verify.problem.blob", { what: "ab12cd34ef56" }],
    ["что-то новое", "labCheckpoints.verify.problem.unknown", { what: "что-то новое" }],
  ])("%s", (problem, key, params) => expect(verifyProblemKey(problem)).toEqual({ key, params }))
  it("shortHash — первые 12 знаков", () => expect(shortHash("0123456789abcdef")).toBe("0123456789ab"))
})

describe("словарь", () => {
  it("все ключи ошибок и проблем проверки есть в словаре", () => {
    for (const k of [...CHECKPOINT_ERROR_KEYS, ...VERIFY_PROBLEM_KEYS, "labTabs.checkpoints"]) expect(S[k], k).toBeTruthy()
  })
  it("подстановки в строках совпадают с тем, что подставляет код", () => {
    for (const [name, err, key, params] of CASES) {
      expect(placeholders(S[key]), name).toEqual(Object.keys(params).sort())
      expect(parseCheckpointError(err).key).toBe(key)
    }
    for (const p of ["item_count", "tree", "commit", "parent", "item:a", "blob:abc", "иное"]) {
      const v = verifyProblemKey(p)
      expect(placeholders(S[v.key]), p).toEqual(Object.keys(v.params).sort())
    }
  })
  it("каждый ключ t(\"...\") во вкладке снимков есть в словаре", () => {
    const parts = ["lab-checkpoints-tab", "lab-checkpoint-view", "lab-checkpoint-diff"]
    const keys = parts.flatMap(p => {
      const src = readFileSync(path.resolve(process.cwd(), `components/labs/${p}.tsx`), "utf8")
      return [...src.matchAll(/\bt\(\s*"([A-Za-z0-9_.]+)"/g)].map(m => m[1])
    })
    expect(keys.length).toBeGreaterThan(50)               // регулярка действительно нашла вызовы во всех трёх файлах
    for (const k of keys) expect(S[k], k).toBeTruthy()
  })
})

describe("просмотр и дифф", () => {
  it("view и diff бьют в эндпоинты снимка", async () => {
    const get = vi.spyOn(api, "get").mockResolvedValue({ data: { ok: 1 } })
    await labCheckpointsApi.view(3, 5)
    await labCheckpointsApi.diff(3, 4, 5)
    expect(get).toHaveBeenNthCalledWith(1, "/api/v1/labs/3/checkpoints/5")
    expect(get).toHaveBeenNthCalledWith(2, "/api/v1/labs/3/checkpoints/diff", { params: { from: 4, to: 5 } })
  })
})
