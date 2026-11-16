import { describe, it, expect, vi, beforeEach } from "vitest"
import { findUndoEvent, toastLinkUndo, toastUndo, announceLinkChange } from "@/lib/link-undo"

const h = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), toast: vi.fn() }))
vi.mock("@/lib/api", () => ({ api: { get: h.get, post: h.post } }))
vi.mock("@/lib/toast", () => ({ toast: h.toast }))

const ev = (o: Partial<{ id: number; type: string; other_type: string; other_id: number; reverted: boolean; undoable: boolean }>) =>
  ({ id: 1, type: "linked", other_type: "observation", other_id: 7, reverted: false, undoable: true, ...o })
const find = () => findUndoEvent("hypothesis", 1, ["linked"], { type: "observation", id: 7 })

// фигурные скобки обязательны: функция, возвращённая из beforeEach, vitest вызывает как хук очистки
beforeEach(() => { h.get.mockReset(); h.post.mockReset(); h.toast.mockReset() })

describe("findUndoEvent", () => {
  it("находит событие нужного вида по этой паре и просит историю именно этой записи", async () => {
    h.get.mockResolvedValue({ data: [ev({ id: 3, other_id: 8 }), ev({ id: 2, type: "unlinked" }), ev({ id: 5 })] })
    expect(await find()).toBe(5)
    expect(h.get).toHaveBeenCalledWith("/api/v1/hypothesis/1/link-history", { params: { limit: 20, other_type: "observation", other_id: 7 } })
  })
  it("уже откатанное и неоткатываемое события не берёт", async () => {
    h.get.mockResolvedValue({ data: [ev({ id: 4, reverted: true }), ev({ id: 6, undoable: false })] })
    expect(await find()).toBeNull()
  })
  it("история не ответила: null, без исключения", async () => {
    h.get.mockImplementation(async () => { throw new Error("network") })
    expect(await find()).toBeNull()
  })
})

describe("toastLinkUndo", () => {
  const base = { entityType: "hypothesis", entityId: 1, message: "Связь добавлена" }

  it("с событием: «Вернуть» откатывает именно это событие и потом перечитывает данные", async () => {
    h.post.mockResolvedValue({ data: {} })
    const onUndone = vi.fn()
    toastLinkUndo({ ...base, eventId: 5, onUndone })
    const req = h.toast.mock.calls[0][0]
    expect(req).toMatchObject({ message: "Связь добавлена", tone: "success" })
    expect(onUndone).not.toHaveBeenCalled()
    await req.undo.run()
    expect(h.post).toHaveBeenCalledWith("/api/v1/hypothesis/1/undo/5")
    expect(onUndone).toHaveBeenCalledTimes(1)
  })
  it("без события: только сообщение, «Вернуть» нет", () => {
    toastLinkUndo({ ...base, eventId: null, onUndone: () => {} })
    expect(h.toast.mock.calls[0][0].undo).toBeUndefined()
  })
  it("откат не удался: ошибка уходит в хост, данные не перечитываются", async () => {
    h.post.mockImplementation(async () => { throw new Error("409") })
    const onUndone = vi.fn()
    toastLinkUndo({ ...base, eventId: 5, onUndone })
    await expect(h.toast.mock.calls[0][0].undo.run()).rejects.toThrow("409")
    expect(onUndone).not.toHaveBeenCalled()
  })
})

describe("toastUndo", () => {
  it("откат по готовому адресу (пакет): POST именно на него, потом перечитывание данных", async () => {
    h.post.mockResolvedValue({ data: {} })
    const onUndone = vi.fn()
    toastUndo({ message: "Применено: 2", undoUrl: "/api/v1/prediction/1/undo/batch/b1", onUndone })
    const req = h.toast.mock.calls[0][0]
    expect(req).toMatchObject({ message: "Применено: 2", tone: "success" })
    await req.undo.run()
    expect(h.post).toHaveBeenCalledWith("/api/v1/prediction/1/undo/batch/b1")
    expect(onUndone).toHaveBeenCalledTimes(1)
  })
  it("тон можно задать, и toastLinkUndo его передаёт", () => {
    toastUndo({ message: "m", tone: "info", undoUrl: "/x", onUndone: () => {} })
    toastLinkUndo({ entityType: "hypothesis", entityId: 1, eventId: 5, message: "m", tone: "info", onUndone: () => {} })
    expect(h.toast.mock.calls.map(c => c[0].tone)).toEqual(["info", "info"])
  })
  it("адреса нет: только сообщение, «Вернуть» нет", () => {
    toastUndo({ message: "m", undoUrl: null, onUndone: () => {} })
    expect(h.toast.mock.calls[0][0].undo).toBeUndefined()
  })
})

describe("announceLinkChange", () => {
  const base = { entityType: "hypothesis", entityId: 1, other: { type: "observation", id: 7 }, message: "m", onUndone: () => {} }
  const history = (...evs: object[]) => h.get.mockResolvedValue({ data: evs })
  const undoneVia = async () => { h.post.mockResolvedValue({ data: {} }); await h.toast.mock.calls[0][0].undo.run() }

  it("add: история именно этой записи, откатывается событие linked", async () => {
    history(ev({ id: 5 }))
    await announceLinkChange({ ...base, kind: "add" })
    expect(h.get).toHaveBeenCalledWith("/api/v1/hypothesis/1/link-history", { params: { limit: 20, other_type: "observation", other_id: 7 } })
    expect(h.toast).toHaveBeenCalledTimes(1)
    await undoneVia()
    expect(h.post).toHaveBeenCalledWith("/api/v1/hypothesis/1/undo/5")
  })
  it("remove: берёт competing_unlinked, linked пропускает", async () => {
    history(ev({ id: 9 }), ev({ id: 4, type: "competing_unlinked" }))
    await announceLinkChange({ ...base, kind: "remove" })
    expect(h.toast).toHaveBeenCalledTimes(1)
    await undoneVia()
    expect(h.post).toHaveBeenCalledWith("/api/v1/hypothesis/1/undo/4")
  })
  it("change: берёт link_type_changed, linked пропускает", async () => {
    history(ev({ id: 9 }), ev({ id: 6, type: "link_type_changed" }))
    await announceLinkChange({ ...base, kind: "change" })
    expect(h.toast).toHaveBeenCalledTimes(1)
    await undoneVia()
    expect(h.post).toHaveBeenCalledWith("/api/v1/hypothesis/1/undo/6")
  })
  it("события нужного вида нет: только сообщение, «Вернуть» нет", async () => {
    history(ev({ id: 9 }))
    await announceLinkChange({ ...base, kind: "change" })
    expect(h.toast).toHaveBeenCalledTimes(1)
    expect(h.toast.mock.calls[0][0]).toMatchObject({ message: "m" })
    expect(h.toast.mock.calls[0][0].undo).toBeUndefined()
  })
})
