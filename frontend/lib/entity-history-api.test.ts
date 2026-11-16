import { describe, it, expect, vi } from "vitest"
import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import { api } from "@/lib/api"
import { STRINGS } from "@/lib/i18n/strings"
import {
  entityHistoryApi, parseUndoError, blockedReasonKey, UNDO_BLOCK_CODES, type UndoBlockCode,
} from "@/lib/entity-history-api"

// Ошибки в форме axios: err.response.status и err.response.data.detail (lib/api.ts пробрасывает их как есть).
function httpError(status: number, detail: unknown) {
  return Object.assign(new Error(`Request failed with status code ${status}`), {
    isAxiosError: true,
    response: { status, data: { detail } },
  })
}
function networkError() {
  return Object.assign(new Error("Network Error"), { isAxiosError: true, request: {} })
}

// Статусы как в backend/app/api/v1/undo.py. Record по UndoBlockCode: новый код без строки тут — ошибка tsc.
const STATUS_BY_CODE: Record<UndoBlockCode, number> = {
  not_updated_event: 400, malformed_event: 400,
  field_not_undoable: 409, prediction_closed: 409, scale_missing: 409, conflict: 409,
  lab_state_changed: 409, not_lab_member: 409,
}

describe("entityHistoryApi", () => {
  it("list бьёт в /history сущности и передаёт limit", async () => {
    const get = vi.spyOn(api, "get").mockResolvedValue({ data: [{ id: 1 }] })
    expect(await entityHistoryApi.list("hypothesis", 3)).toEqual([{ id: 1 }])
    await entityHistoryApi.list("task", 9, 10)
    expect(get).toHaveBeenNthCalledWith(1, "/api/v1/hypothesis/3/history", { params: { limit: 50 } })
    expect(get).toHaveBeenNthCalledWith(2, "/api/v1/task/9/history", { params: { limit: 10 } })
  })

  it("undo шлёт POST на /undo/{event_id} и возвращает ответ сервера", async () => {
    const post = vi.spyOn(api, "post").mockResolvedValue({ data: { reverted_event_id: 5, fields: ["title"] } })
    expect(await entityHistoryApi.undo("observation", 7, 5)).toEqual({ reverted_event_id: 5, fields: ["title"] })
    expect(post).toHaveBeenCalledWith("/api/v1/observation/7/undo/5")
  })

  it("ошибку axios пропускает без обёртки: парсер видит то, что пришло с сервера", async () => {
    vi.spyOn(api, "post").mockRejectedValue(httpError(409, { code: "conflict", fields: ["title"] }))
    const info = await entityHistoryApi.undo("observation", 7, 5).then(() => null, parseUndoError)
    expect(info).toEqual({ key: "history.blocked.conflict", fields: ["title"] })
  })
})

describe("parseUndoError", () => {
  it.each(UNDO_BLOCK_CODES)("%s → свой ключ и поля из ответа", code => {
    const r = parseUndoError(httpError(STATUS_BY_CODE[code], { code, fields: ["title", "text"] }))
    expect(r).toEqual({ key: `history.blocked.${code}`, fields: ["title", "text"] })
  })

  it("404 (detail — строка) → notFound", () => {
    expect(parseUndoError(httpError(404, "Не найдено"))).toEqual({ key: "history.err.notFound", fields: [] })
  })

  it("422 (detail — массив) и 500 → generic", () => {
    expect(parseUndoError(httpError(422, [{ loc: ["path", "event_id"], msg: "x" }])).key).toBe("history.err.generic")
    expect(parseUndoError(httpError(500, null)).key).toBe("history.err.generic")
  })

  it("известный код при чужом статусе не принимается на веру", () => {
    expect(parseUndoError(httpError(500, { code: "conflict", fields: [] })).key).toBe("history.err.generic")
  })

  it("неизвестный код 409 не выдаётся за «конфликт»", () => {
    expect(parseUndoError(httpError(409, { code: "brand_new_rule", fields: ["x"] })).key).toBe("history.blocked.unknown")
  })

  it("409 в чужом формате (строка) → generic; fields не массив → []", () => {
    expect(parseUndoError(httpError(409, "oops")).key).toBe("history.err.generic")
    expect(parseUndoError(httpError(409, { code: "conflict", fields: "title" })).fields).toEqual([])
  })

  it("axios без ответа → network; чужое исключение и мусор → generic, не network", () => {
    expect(parseUndoError(networkError()).key).toBe("history.err.network")
    expect(parseUndoError(new TypeError("баг в нашем коде")).key).toBe("history.err.generic")
    expect(parseUndoError(undefined).key).toBe("history.err.generic")
    expect(parseUndoError("boom").key).toBe("history.err.generic")
  })
})

describe("тексты", () => {
  it("каждый ключ, который отдают blockedReasonKey и parseUndoError, есть в словаре", () => {
    const keys = new Set<string>()
    for (const c of UNDO_BLOCK_CODES) keys.add(blockedReasonKey(c))
    keys.add(blockedReasonKey(null))
    keys.add(blockedReasonKey("zzz"))
    for (const e of [httpError(404, "x"), httpError(500, null), networkError(), new Error("x"), httpError(409, { code: "zzz" })]) {
      keys.add(parseUndoError(e).key)
    }
    for (const k of keys) expect(STRINGS[k], `нет ключа ${k}`).toBeTruthy()
  })
})

// Дрейф кодов: бэкенд добавил отказ — фронт обязан узнать о нём здесь, а не показать «generic» в проде.
const BACKEND = path.resolve(process.cwd(), "../backend/app/services/undo.py")
describe.skipIf(!existsSync(BACKEND))("коды отказов совпадают с backend/app/services/undo.py", () => {
  it("множество UndoVerdict(False, ...) == UNDO_BLOCK_CODES", () => {
    const src = readFileSync(BACKEND, "utf8")
    const codes = [...src.matchAll(/UndoVerdict\(\s*False,\s*"([a-z_]+)"/g)].map(m => m[1])
    expect(codes.length).toBeGreaterThan(0)
    expect([...new Set(codes)].sort()).toEqual([...UNDO_BLOCK_CODES].sort())
  })
})
