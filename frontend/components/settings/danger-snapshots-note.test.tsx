import { describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { STRINGS } from "@/lib/i18n/strings"
import DangerZonePage from "@/app/(app)/settings/danger/page"

vi.mock("@/lib/i18n/useT", async () => {
  const { STRINGS } = await vi.importActual<typeof import("@/lib/i18n/strings")>("@/lib/i18n/strings")
  return {
    useT: () => (key: string, vars?: Record<string, string | number>) =>
      Object.entries(vars ?? {}).reduce((acc, [k, v]) => acc.replaceAll(`{${k}}`, String(v)), STRINGS[key] ?? key),
  }
})
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock("@/lib/store", () => ({ useStore: () => ({ setUser: vi.fn() }) }))
vi.mock("@/components/settings/settings-section", async () => {
  const React = await vi.importActual<typeof import("react")>("react")
  return { SettingsSection: ({ children }: { children: unknown }) => React.createElement("div", null, children as never) }
})

const S = STRINGS as Record<string, string>

describe("удаление аккаунта", () => {
  it("в окне подтверждения сказано, что копии в снимках лабораторий останутся", () => {
    render(<DangerZonePage />)
    expect(screen.queryByText(S["settings.danger.snapshotsNote"])).toBeNull()      // до открытия окна его нет
    fireEvent.click(screen.getByRole("button", { name: S["settings.danger.deleteForever"] }))
    expect(screen.getByText(S["settings.danger.snapshotsNote"])).toBeTruthy()
    expect(S["settings.danger.snapshotsNote"]).toContain("снимк")
  })
})
