import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

const SAVED = process.env.NEXT_PUBLIC_API_URL
beforeEach(() => { vi.resetModules() })
afterEach(() => {
  vi.restoreAllMocks()
  if (SAVED === undefined) delete process.env.NEXT_PUBLIC_API_URL
  else process.env.NEXT_PUBLIC_API_URL = SAVED
})

async function runWith401() {
  const axios = (await import("axios")).default
  const post = vi.spyOn(axios, "post").mockResolvedValue({ data: {} } as never)
  const { api } = await import("@/lib/api")
  let calls = 0
  api.defaults.adapter = async (config: any) => {
    calls++
    if (calls === 1) throw { config, response: { status: 401, data: {} } }
    return { data: "ok", status: 200, statusText: "OK", headers: {}, config } as any
  }
  const res = await api.get("/api/v1/x")
  return { post, calls, data: res.data }
}

describe("обновление сессии по 401", () => {
  it("охранный (зелёный и до патча): адрес из NEXT_PUBLIC_API_URL, запрос повторён", async () => {
    process.env.NEXT_PUBLIC_API_URL = "https://api.example.test"
    const { post, calls, data } = await runWith401()
    expect(post.mock.calls[0][0]).toBe("https://api.example.test/api/v1/auth/refresh")
    expect(calls).toBe(2)
    expect(data).toBe("ok")
  })
  it("переменная не задана: refresh идёт на тот же базовый адрес, что и остальные запросы, а не на «undefined/…»", async () => {
    delete process.env.NEXT_PUBLIC_API_URL
    const { post } = await runWith401()
    expect(post.mock.calls[0][0]).toBe("http://localhost:8000/api/v1/auth/refresh")
  })
})
