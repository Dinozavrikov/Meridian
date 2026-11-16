import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent, renderHook, act } from "@testing-library/react"
import { STRINGS } from "@/lib/i18n/strings"
import { FormError, FormFooter, LabLockedNote, RichTextField, StatusPills, useRequiredRichText, useSubmitExtras } from "@/components/entities/forms/form-parts"

const { labsState } = vi.hoisted(() => ({ labsState: { data: [] as any[] } }))
vi.mock("@/lib/use-my-labs", () => ({ useMyLabs: () => ({ data: labsState.data }) }))
vi.mock("@/lib/i18n/useT", async () => {
  const { STRINGS } = await vi.importActual<typeof import("@/lib/i18n/strings")>("@/lib/i18n/strings")
  return { useT: () => (key: string) => STRINGS[key] ?? key }
})
vi.mock("@/components/entities/rich-text-editor", async () => {
  const React = await vi.importActual<typeof import("react")>("react")
  return {
    RichTextEditor: ({ onPendingFileAdded }: any) =>
      React.createElement("button", { type: "button", onClick: () => onPendingFileAdded("blob:1", new File(["x"], "a.png")) }, "paste-image"),
  }
})

const S = STRINGS as Record<string, string>
beforeEach(() => { labsState.data = [] })

describe("form-parts", () => {
  it("FormError: без ошибки ничего, с ошибкой — role=alert", () => {
    const { rerender } = render(<FormError error={null} />)
    expect(screen.queryByRole("alert")).toBeNull()
    rerender(<FormError error="Не вышло" />)
    expect(screen.getByRole("alert").textContent).toBe("Не вышло")
  })

  it("FormFooter: отмена зовёт onCancel, сохранение блокируется на время отправки", () => {
    const onCancel = vi.fn()
    const { rerender } = render(<FormFooter onCancel={onCancel} />)
    fireEvent.click(screen.getByText(S["actions.cancel"]))
    expect(onCancel).toHaveBeenCalledTimes(1)
    expect((screen.getByText(S["actions.save"]).closest("button") as HTMLButtonElement).disabled).toBe(false)
    rerender(<FormFooter onCancel={onCancel} submitting />)
    expect((screen.getByText(S["actions.save"]).closest("button") as HTMLButtonElement).disabled).toBe(true)
  })

  it("LabLockedNote: публичная лаборатория — честно говорит, что запись будет видна всем", () => {
    labsState.data = [{ id: 5, is_public: true }]
    render(<LabLockedNote labId={5} />)
    expect(screen.getByTestId("lab-locked-note").textContent).toBe(S["forms.lockedToLab.public"])
  })
  it("LabLockedNote: закрытая лаборатория — только участникам", () => {
    labsState.data = [{ id: 5, is_public: false }]
    render(<LabLockedNote labId={5} />)
    expect(screen.getByTestId("lab-locked-note").textContent).toBe(S["forms.lockedToLab.lab"])
  })
  it.each([[[]], [[{ id: 5, name: "без is_public" }]], [[{ id: 6, is_public: true }]]])(
    "LabLockedNote: если публичность неизвестна — нейтральный текст, а не догадка (%j)", (data) => {
      labsState.data = data as any[]
      render(<LabLockedNote labId={5} />)
      expect(screen.getByTestId("lab-locked-note").textContent).toBe(S["forms.lockedToLab"])
    })

  it("RichTextField: картинка, вставленная в текст до сохранения, попадает в pendingFilesRef; ошибка «обязателен» по флагу", () => {
    const ref = { current: new Map<string, File>() }
    const { rerender } = render(<RichTextField label="L" value="" onChange={vi.fn()} entityType="x" pendingFilesRef={ref} />)
    fireEvent.click(screen.getByText("paste-image"))
    expect(ref.current.get("blob:1")?.name).toBe("a.png")
    expect(screen.queryByText(S["field.textRequired"])).toBeNull()
    rerender(<RichTextField label="L" value="" onChange={vi.fn()} entityType="x" pendingFilesRef={ref} showRequiredError />)
    expect(screen.getByText(S["field.textRequired"])).toBeTruthy()
  })

  it("StatusPills: показывает все статусы, клик отдаёт выбранный, перевод применяется", () => {
    const onChange = vi.fn()
    render(<StatusPills statuses={["a", "b"]} value="a" onChange={onChange} translate={s => s.toUpperCase()} />)
    fireEvent.click(screen.getByText("B"))
    expect(onChange).toHaveBeenCalledWith("b")
    expect(screen.getByText("A")).toBeTruthy()
  })

  it("useRequiredRichText: пустой html (в т.ч. пустой абзац) — ошибка только после попытки; с текстом ошибки нет", () => {
    const { result, rerender } = renderHook(({ html }) => useRequiredRichText(html), { initialProps: { html: "<p></p>" } })
    expect(result.current.isEmpty).toBe(true)
    expect(result.current.showError).toBe(false)
    act(() => result.current.markAttempted())
    expect(result.current.showError).toBe(true)
    rerender({ html: "<p>текст</p>" })
    expect(result.current.isEmpty).toBe(false)
    expect(result.current.showError).toBe(false)
  })

  it("useSubmitExtras: начальное состояние пустое", () => {
    const { result } = renderHook(() => useSubmitExtras())
    expect(result.current.links).toEqual([])
    expect(result.current.images).toEqual([])
    expect(result.current.pendingFilesRef.current).toBeInstanceOf(Map)
  })
})
