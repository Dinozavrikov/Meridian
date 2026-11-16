import { describe, it, expect, vi, beforeAll, afterEach } from "vitest"
import { render, screen, fireEvent, waitFor, cleanup, act } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { STRINGS } from "@/lib/i18n/strings"
import { RichTextEditor } from "@/components/entities/rich-text-editor"

const h = vi.hoisted(() => ({ get: vi.fn() }))
vi.mock("@/lib/api", () => ({ api: { get: h.get }, imageApi: { upload: vi.fn() }, resolveMediaUrl: (u: string) => u }))
vi.mock("@/lib/i18n/useT", async () => {
  const { STRINGS } = await vi.importActual<typeof import("@/lib/i18n/strings")>("@/lib/i18n/strings")
  return { useT: () => (key: string) => (STRINGS as Record<string, string>)[key] ?? key }
})
vi.mock("@/lib/i18n/useTypeRu", () => ({ useTypeRu: () => ({ hypothesis: "Гипотеза" }) }))
const S = STRINGS as Record<string, string>

beforeAll(() => {
  // ProseMirror в jsdom: измерения не нужны, но методы должны существовать
  const rect = { x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, toJSON() {} }
  Range.prototype.getClientRects = (() => ({ length: 0, item: () => null, [Symbol.iterator]: function* () {} })) as any
  Range.prototype.getBoundingClientRect = (() => rect) as any
  document.elementFromPoint = (() => null) as any
})
afterEach(cleanup)

/** Вставляет внутреннюю ссылку через настоящий выбор в окне ссылки; возвращает последний HTML, ушедший в onChange. */
async function pick(title: string): Promise<string> {
  h.get.mockReset(); h.get.mockResolvedValue({ data: [{ type: "hypothesis", id: 5, title }] })
  const onChange = vi.fn()
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <RichTextEditor value="" onChange={onChange} entityType="observation" entityId={1} />
  </QueryClientProvider>)
  fireEvent.click(screen.getByRole("button", { name: S["editor.insertLink"] }))
  fireEvent.change(screen.getByPlaceholderText(S["relations.searchPlaceholder"]), { target: { value: "г" } })
  fireEvent.click(await screen.findByText(title))
  await waitFor(() => expect(onChange).toHaveBeenCalled())
  return onChange.mock.calls.at(-1)![0] as string
}

describe("RichTextEditor: вставка внутренней ссылки без выделения", () => {
  it("обычный заголовок: ссылка meridian://тип/id с этим текстом (охранный: зелёный и до правки)", async () => {
    const html = await pick("Гипотеза")
    expect(html).toContain('href="meridian://hypothesis/5"')
    expect(html).toContain(">Гипотеза</a>")
  })
  it.each([
    ["<b>x</b> & y", "&lt;b&gt;x&lt;/b&gt;", "<b>"],
    ['"><img src=x onerror=alert(1)>', "&lt;img", "<img"],
  ])("заголовок %j вставляется как текст, а не как разметка", async (title, escaped, rawTag) => {
    const html = await pick(title)
    expect(html).toContain(escaped)
    expect(html).not.toContain(rawTag)
    expect(html).toContain('href="meridian://hypothesis/5"')
  })
})

describe("RichTextEditor: «@» со списком записей и Ctrl+K", () => {
  async function mountEd(title: string) {
    h.get.mockReset(); h.get.mockResolvedValue({ data: [{ type: "hypothesis", id: 5, title }] })
    const onChange = vi.fn()
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <RichTextEditor value="" onChange={onChange} entityType="observation" entityId={1} />
    </QueryClientProvider>)
    await waitFor(() => expect(document.querySelector(".tiptap")).not.toBeNull())
    return onChange
  }
  const typeText = (text: string) => {
    const ed = (document.querySelector(".tiptap") as any)?.editor
    expect(ed, "tiptap не положил editor в DOM-узел: тест неверен, а не код").toBeTruthy()
    act(() => { ed.chain().focus().insertContent(text).run() })
  }
  const lastHtml = (onChange: ReturnType<typeof vi.fn>) => onChange.mock.calls.at(-1)![0] as string

  it("«@» и запрос: список записей; выбор мышью вставляет ссылку на запись вместо «@запрос»", async () => {
    const onChange = await mountEd("Моя запись")
    typeText("@м")
    fireEvent.mouseDown(await screen.findByText("Моя запись"))
    await waitFor(() => expect(lastHtml(onChange)).toContain('href="meridian://hypothesis/5"'))
    expect(lastHtml(onChange)).toContain(">Моя запись</a>")
    expect(lastHtml(onChange)).not.toContain("@м")
  })
  it("Enter выбирает первую запись списка", async () => {
    const onChange = await mountEd("Моя запись")
    typeText("@м")
    await screen.findByText("Моя запись")
    fireEvent.keyDown(document.querySelector(".tiptap")!, { key: "Enter", code: "Enter" })
    await waitFor(() => expect(lastHtml(onChange)).toContain('href="meridian://hypothesis/5"'))
  })
  it("заголовок с разметкой при выборе через «@» вставляется как текст", async () => {
    const onChange = await mountEd("<img src=x onerror=alert(1)>")
    typeText("@i")
    fireEvent.mouseDown(await screen.findByText("<img src=x onerror=alert(1)>"))
    await waitFor(() => expect(lastHtml(onChange)).toContain('href="meridian://hypothesis/5"'))
    expect(lastHtml(onChange)).toContain("&lt;img")
    expect(lastHtml(onChange)).not.toContain("<img")
  })
  it("Ctrl+K на русской раскладке (key «л», code KeyK) открывает окно ссылки", async () => {
    await mountEd("x")
    fireEvent.keyDown(document.querySelector(".tiptap")!, { key: "л", code: "KeyK", ctrlKey: true })
    expect(await screen.findByPlaceholderText(S["relations.searchPlaceholder"])).toBeTruthy()
  })
  it("охранный (зелёный и до правки): «k» без Ctrl окно ссылки не открывает", async () => {
    await mountEd("x")
    fireEvent.keyDown(document.querySelector(".tiptap")!, { key: "k", code: "KeyK" })
    await new Promise(r => setTimeout(r, 50))
    expect(screen.queryByPlaceholderText(S["relations.searchPlaceholder"])).toBeNull()
  })
})
