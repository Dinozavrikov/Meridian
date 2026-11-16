import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { AttachmentsSection } from "@/components/entities/attachments-section"
import { attachmentApi } from "@/lib/api"
import { STRINGS } from "@/lib/i18n/strings"
import type { EntityAttachment } from "@/lib/attachments"

vi.mock("@/lib/api", () => ({
  attachmentApi: {
    list: vi.fn(), get: vi.fn(), upload: vi.fn(), delete: vi.fn(),
    replaceFile: vi.fn(), replaceText: vi.fn(), listVersions: vi.fn(), restoreVersion: vi.fn(),
  },
  resolveMediaUrl: (p?: string | null) => (p ? `http://api.test${p}` : null),
}))
vi.mock("@/lib/i18n/useT", async () => {
  const { STRINGS } = await vi.importActual<typeof import("@/lib/i18n/strings")>("@/lib/i18n/strings")
  return {
    useT: () => (key: string, vars?: Record<string, string | number>) =>
      Object.entries(vars ?? {}).reduce((acc, [k, v]) => acc.replaceAll(`{${k}}`, String(v)), STRINGS[key] ?? key),
  }
})

const A = (over: Partial<EntityAttachment> = {}): EntityAttachment => ({
  id: 1, user_id: 1, entity_type: "observation", entity_id: 7, kind: "code",
  filename: "main.py", mime_type: "text/plain", size_bytes: 2048, language: "python",
  has_text_content: true, download_url: "/api/v1/attachments/1/download",
  created_at: "2026-09-20T12:00:00", ...over,
})

function renderSection(props: { isOwner?: boolean } = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <AttachmentsSection entityType="observation" entityId={7} {...props} />
    </QueryClientProvider>,
  )
}

beforeEach(() => { vi.resetAllMocks() })

describe("AttachmentsSection", () => {
  it("пустой список: подсказка + зона загрузки для владельца", async () => {
    vi.mocked(attachmentApi.list).mockResolvedValue([])
    const { container } = renderSection()
    expect(await screen.findByText(STRINGS["attachmentsTab.empty"])).not.toBeNull()
    expect(container.querySelector('input[type="file"]')).not.toBeNull()
  })

  it("не владелец: нет загрузки и удаления, скачивание и просмотр есть", async () => {
    vi.mocked(attachmentApi.list).mockResolvedValue([A()])
    const { container } = renderSection({ isOwner: false })
    await screen.findByText("main.py")
    expect(container.querySelector('input[type="file"]')).toBeNull()
    expect(screen.queryByLabelText(STRINGS["attachmentsTab.delete"])).toBeNull()
    expect(screen.queryByLabelText(STRINGS["attachmentsTab.download"])).not.toBeNull()
    expect(screen.queryByLabelText(STRINGS["attachmentsTab.view"])).not.toBeNull()
  })

  it("строка: имя, язык, размер, ссылка на скачивание", async () => {
    vi.mocked(attachmentApi.list).mockResolvedValue([A()])
    renderSection()
    await screen.findByText("main.py")
    expect(screen.getByText("python")).not.toBeNull()
    expect(screen.getByText("2 КБ")).not.toBeNull()
    const link = screen.getByLabelText(STRINGS["attachmentsTab.download"])
    expect(link.getAttribute("href")).toBe("http://api.test/api/v1/attachments/1/download")
    expect(link.getAttribute("download")).toBe("main.py")
  })

  it("большой файл без текста: только скачивание", async () => {
    vi.mocked(attachmentApi.list).mockResolvedValue([A({ has_text_content: false })])
    renderSection()
    await screen.findByText("main.py")
    expect(screen.queryByLabelText(STRINGS["attachmentsTab.view"])).toBeNull()
    expect(screen.getByText(STRINGS["attachmentsTab.downloadOnly"])).not.toBeNull()
  })

  it("просмотр: текст, нумерация строк, копирование", async () => {
    vi.mocked(attachmentApi.list).mockResolvedValue([A()])
    vi.mocked(attachmentApi.get).mockResolvedValue({ ...A(), text_content: "print(1)\nprint(2)\n" })
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true })
    renderSection()
    fireEvent.click(await screen.findByLabelText(STRINGS["attachmentsTab.view"]))

    const code = await screen.findByTestId("att-code")
    expect(code.textContent).toBe("print(1)\nprint(2)\n")
    expect(screen.getByTestId("att-gutter").textContent).toBe("1\n2")
    expect(attachmentApi.get).toHaveBeenCalledWith(1)

    fireEvent.click(screen.getByText(STRINGS["attachmentsTab.copy"]))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("print(1)\nprint(2)\n"))
    expect(await screen.findByText(STRINGS["attachmentsTab.copied"])).not.toBeNull()
  })

  it("загрузка: по одному файлу на запрос, строго последовательно", async () => {
    vi.mocked(attachmentApi.list).mockResolvedValue([])
    let active = 0
    let maxActive = 0
    vi.mocked(attachmentApi.upload).mockImplementation(async () => {
      active++
      maxActive = Math.max(maxActive, active)
      await new Promise(r => setTimeout(r, 5))
      active--
      return {}
    })
    const { container } = renderSection()
    await screen.findByText(STRINGS["attachmentsTab.empty"])
    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    const files = ["a.py", "b.py", "c.py"].map(n => new File(["x = 1"], n))
    fireEvent.change(input, { target: { files } })

    await waitFor(() => expect(attachmentApi.upload).toHaveBeenCalledTimes(3))
    expect(maxActive).toBe(1)
    for (const call of vi.mocked(attachmentApi.upload).mock.calls) {
      expect(call[0]).toBe("observation")
      expect(call[1]).toBe(7)
      expect(call[2]).toHaveLength(1)
    }
  })

  it("ошибка одного файла показана с причиной, остальные загружены", async () => {
    vi.mocked(attachmentApi.list).mockResolvedValue([])
    vi.mocked(attachmentApi.upload)
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce({ response: { data: { detail: "Тип файла не поддерживается: .exe" } } })
    const { container } = renderSection()
    await screen.findByText(STRINGS["attachmentsTab.empty"])
    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(input, { target: { files: [new File(["x"], "a.py"), new File(["x"], "b.exe")] } })

    expect(await screen.findByText("b.exe: Тип файла не поддерживается: .exe")).not.toBeNull()
    expect(attachmentApi.upload).toHaveBeenCalledTimes(2)
  })

  it("удаление: с подтверждением вызывает API, без — нет", async () => {
    vi.mocked(attachmentApi.list).mockResolvedValue([A()])
    vi.mocked(attachmentApi.delete).mockResolvedValue({ data: null } as never)
    const confirmSpy = vi.spyOn(window, "confirm")
    renderSection()
    const del = await screen.findByLabelText(STRINGS["attachmentsTab.delete"])

    confirmSpy.mockReturnValue(false)
    fireEvent.click(del)
    expect(attachmentApi.delete).not.toHaveBeenCalled()

    confirmSpy.mockReturnValue(true)
    fireEvent.click(del)
    await waitFor(() => expect(attachmentApi.delete).toHaveBeenCalledWith("observation", 7, 1))
  })

  it("после замены файла показывается новое содержимое, а не закэшированное старое (регресс: вложения больше не неизменяемы — id переживает смену контента)", async () => {
    vi.mocked(attachmentApi.list)
      .mockResolvedValueOnce([A({ size_bytes: 10 })])
      .mockResolvedValueOnce([A({ size_bytes: 20 })])
    vi.mocked(attachmentApi.get)
      .mockResolvedValueOnce({ ...A({ size_bytes: 10 }), text_content: "old content\n" })
      .mockResolvedValueOnce({ ...A({ size_bytes: 20 }), text_content: "NEW CONTENT\n" })
    vi.mocked(attachmentApi.replaceFile).mockResolvedValue(A({ size_bytes: 20 }) as never)

    const { container } = renderSection()
    fireEvent.click(await screen.findByLabelText(STRINGS["attachmentsTab.view"]))
    expect((await screen.findByTestId("att-code")).textContent).toBe("old content\n")

    fireEvent.click(screen.getByLabelText(STRINGS["attachmentsTab.replace"]))
    const inputs = container.querySelectorAll('input[type="file"]')
    fireEvent.change(inputs[1], { target: { files: [new File(["NEW CONTENT\n"], "main.py")] } })

    await waitFor(() => expect(attachmentApi.replaceFile).toHaveBeenCalledWith("observation", 7, 1, expect.any(File)))
    await waitFor(async () => {
      expect((await screen.findByTestId("att-code")).textContent).toBe("NEW CONTENT\n")
    })
  })

  it("история версий: список, скачивание, восстановление владельцем", async () => {
    vi.mocked(attachmentApi.list).mockResolvedValue([A()])
    vi.mocked(attachmentApi.listVersions).mockResolvedValue([{
      id: 9, attachment_id: 1, filename: "old.py", mime_type: "text/plain", size_bytes: 5,
      language: "python", has_text_content: true, superseded_at: "2026-09-20T10:00:00+00:00",
      download_url: "/api/v1/attachments/1/versions/9/download",
    }] as never)
    vi.mocked(attachmentApi.restoreVersion).mockResolvedValue({} as never)
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true)

    renderSection()
    fireEvent.click(await screen.findByLabelText(STRINGS["attachmentsTab.showVersions"]))

    expect(await screen.findByText("old.py")).not.toBeNull()
    fireEvent.click(screen.getByLabelText(STRINGS["attachmentsTab.restore"]))
    await waitFor(() => expect(attachmentApi.restoreVersion).toHaveBeenCalledWith("observation", 7, 1, 9))
    expect(confirmSpy).toHaveBeenCalled()
  })

  it("история версий недоступна для восстановления не-владельцу, но видна", async () => {
    vi.mocked(attachmentApi.list).mockResolvedValue([A()])
    vi.mocked(attachmentApi.listVersions).mockResolvedValue([{
      id: 9, attachment_id: 1, filename: "old.py", mime_type: "text/plain", size_bytes: 5,
      language: "python", has_text_content: true, superseded_at: "2026-09-20T10:00:00+00:00",
      download_url: "/api/v1/attachments/1/versions/9/download",
    }] as never)

    renderSection({ isOwner: false })
    fireEvent.click(await screen.findByLabelText(STRINGS["attachmentsTab.showVersions"]))
    expect(await screen.findByText("old.py")).not.toBeNull()
    expect(screen.queryByLabelText(STRINGS["attachmentsTab.restore"])).toBeNull()
  })

  it("редактирование текста: сохранение вызывает replaceText с новым содержимым и языком", async () => {
    vi.mocked(attachmentApi.list).mockResolvedValue([A()])
    vi.mocked(attachmentApi.get).mockResolvedValue({ ...A(), text_content: "print(1)\n" } as never)
    vi.mocked(attachmentApi.replaceText).mockResolvedValue({ ...A(), text_content: "print(2)\n" } as never)

    renderSection()
    fireEvent.click(await screen.findByLabelText(STRINGS["attachmentsTab.view"]))
    await screen.findByTestId("att-code")

    fireEvent.click(screen.getByText(STRINGS["attachmentsTab.edit"]))
    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement
    fireEvent.change(textarea, { target: { value: "print(2)\n" } })
    fireEvent.click(screen.getByText(STRINGS["attachmentsTab.save"]))

    await waitFor(() => expect(attachmentApi.replaceText).toHaveBeenCalledWith("observation", 7, 1, "print(2)\n", "python"))
  })
})

describe("AttachmentsSection: недоверенный код", () => {
  const PAYLOAD = 'x = "<img src=x onerror=window.__pwn=1><script>window.__pwn=2</script>"\n'

  it.each(["python", "html"])("код с HTML-разметкой (%s) показывается текстом, а не выполняется", async language => {
    const lang = language as EntityAttachment["language"]
    vi.mocked(attachmentApi.list).mockResolvedValue([A({ language: lang })])
    vi.mocked(attachmentApi.get).mockResolvedValue({ ...A({ language: lang }), text_content: PAYLOAD })
    renderSection()
    fireEvent.click(await screen.findByLabelText(STRINGS["attachmentsTab.view"]))
    const code = await screen.findByTestId("att-code")
    expect(code.textContent).toBe(PAYLOAD)
    expect(code.querySelector("img, script, iframe")).toBeNull()
  })
})
