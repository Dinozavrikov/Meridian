import { describe, it, expect, vi } from "vitest"
import { api, attachmentApi } from "@/lib/api"

describe("attachmentApi", () => {
  it("list/get/delete бьют в правильные URL", async () => {
    const get = vi.spyOn(api, "get").mockResolvedValue({ data: [] })
    const del = vi.spyOn(api, "delete").mockResolvedValue({ data: null })
    await attachmentApi.list("observation", 7)
    await attachmentApi.get(5)
    await attachmentApi.delete("observation", 7, 5)
    expect(get).toHaveBeenNthCalledWith(1, "/api/v1/observation/7/attachments")
    expect(get).toHaveBeenNthCalledWith(2, "/api/v1/attachments/5")
    expect(del).toHaveBeenCalledWith("/api/v1/observation/7/attachments/5")
  })

  it("upload шлёт FormData с полем files", async () => {
    const post = vi.spyOn(api, "post").mockResolvedValue({ data: { created: [], errors: [] } })
    const f1 = new File(["print(1)"], "a.py")
    const f2 = new File(["x"], "b.txt")
    await attachmentApi.upload("hypothesis", 3, [f1, f2])
    const [url, body] = post.mock.calls[0]
    expect(url).toBe("/api/v1/hypothesis/3/attachments")
    expect((body as FormData).getAll("files")).toHaveLength(2)
  })

  it("replaceFile шлёт multipart PUT на .../file с полем file", async () => {
    const put = vi.spyOn(api, "put").mockResolvedValue({ data: {} })
    const f = new File(["print(2)"], "b.py")
    await attachmentApi.replaceFile("observation", 7, 5, f)
    const [url, body] = put.mock.calls[0]
    expect(url).toBe("/api/v1/observation/7/attachments/5/file")
    expect((body as FormData).get("file")).toBe(f)
  })

  it("replaceText шлёт JSON PUT на .../text", async () => {
    const put = vi.spyOn(api, "put").mockResolvedValue({ data: {} })
    await attachmentApi.replaceText("observation", 7, 5, "x = 1\n", "python")
    expect(put).toHaveBeenCalledWith("/api/v1/observation/7/attachments/5/text", { text_content: "x = 1\n", language: "python" })
  })

  it("listVersions/restoreVersion бьют в правильные URL", async () => {
    const get = vi.spyOn(api, "get").mockResolvedValue({ data: [] })
    const post = vi.spyOn(api, "post").mockResolvedValue({ data: {} })
    await attachmentApi.listVersions("observation", 7, 5)
    await attachmentApi.restoreVersion("observation", 7, 5, 9)
    expect(get).toHaveBeenCalledWith("/api/v1/observation/7/attachments/5/versions")
    expect(post).toHaveBeenCalledWith("/api/v1/observation/7/attachments/5/versions/9/restore")
  })
})
