import { describe, it, expect } from "vitest"
import { apiErrorMessage, apiFieldErrors } from "@/lib/api-error"

const err = (detail: unknown) => ({ response: { status: 422, data: { detail } } })

describe("apiErrorMessage", () => {
  it("строковый detail отдаётся как есть", () => {
    expect(apiErrorMessage(err("Не найдено"), "fb")).toBe("Не найдено")
  })
  it("массив с нашими сообщениями: префикс убран, дубли схлопнуты", () => {
    const d = [{ msg: "Value error, Недопустимые управляющие символы" }, { msg: "Value error, Недопустимые управляющие символы" }, { msg: "Value error, Дата в формате ГГГГ-ММ-ДД" }]
    expect(apiErrorMessage(err(d), "fb", "inv")).toBe("Недопустимые управляющие символы, Дата в формате ГГГГ-ММ-ДД")
  })
  it("встроенные английские сообщения pydantic не показываются: берём invalid", () => {
    const d = [{ type: "string_too_long", loc: ["body", "title"], msg: "String should have at most 255 characters" }]
    expect(apiErrorMessage(err(d), "fb", "inv")).toBe("inv")
  })
  it("результат всегда строка (его кладут в setError/JSX), даже для мусора в detail", () => {
    for (const d of [[], [{}], [null], [{ msg: 5 }], { a: 1 }, 42, null, undefined, ""]) {
      expect(typeof apiErrorMessage(err(d), "fb", "inv")).toBe("string")
    }
  })
  it("нет ответа (сеть упала) или не ошибка axios: fallback", () => {
    expect(apiErrorMessage(new Error("Network Error"), "fb")).toBe("fb")
    expect(apiErrorMessage(undefined, "fb")).toBe("fb")
  })
})


describe("apiFieldErrors", () => {
  const err = (detail: unknown) => ({ response: { status: 422, data: { detail } } })
  it("наши value_error: {field: msg без префикса}", () => {
    const d = [
      { type: "value_error", loc: ["body", "username"], msg: "Value error, Имя пользователя не может содержать пробелы — используйте _ или -" },
      { type: "value_error", loc: ["body", "password"], msg: "Value error, Минимум 8 символов" },
    ]
    expect(apiFieldErrors(err(d))).toEqual({
      username: "Имя пользователя не может содержать пробелы — используйте _ или -",
      password: "Минимум 8 символов",
    })
  })
  it("встроенные английские pydantic в поля НЕ попадают", () => {
    const d = [{ type: "string_too_long", loc: ["body", "title"], msg: "String should have at most 255 characters" }]
    expect(apiFieldErrors(err(d))).toEqual({})
  })
  it("мусор → пустой объект", () => {
    for (const d of [undefined, null, "x", [], [null], [{ loc: "x" }], [{ msg: "Value error, X", loc: [] }]]) {
      expect(apiFieldErrors(err(d))).toEqual({})
    }
  })
})
