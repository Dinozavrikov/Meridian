import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import { FilesTab } from "@/components/entities/files-tab"
import { STRINGS } from "@/lib/i18n/strings"

vi.mock("@/lib/i18n/useT", async () => {
  const { STRINGS } = await vi.importActual<typeof import("@/lib/i18n/strings")>("@/lib/i18n/strings")
  return { useT: () => (key: string) => STRINGS[key] ?? key }
})
vi.mock("@/components/entities/images-tab", () => ({
  ImagesTab: (p: { entityType: string; entityId: number; isOwner?: boolean }) =>
    <div data-testid="images">{`${p.entityType}:${p.entityId}:${String(p.isOwner)}`}</div>,
}))
vi.mock("@/components/entities/attachments-section", () => ({
  AttachmentsSection: (p: { entityType: string; entityId: number; isOwner?: boolean }) =>
    <div data-testid="files">{`${p.entityType}:${p.entityId}:${String(p.isOwner)}`}</div>,
}))

describe("FilesTab", () => {
  it("рисует обе секции с заголовками и передаёт им одни и те же props", () => {
    render(<FilesTab entityType="hypothesis" entityId={3} isOwner={false} />)
    expect(screen.getByText(STRINGS["filesTab.imagesHeading"])).not.toBeNull()
    expect(screen.getByText(STRINGS["filesTab.filesHeading"])).not.toBeNull()
    expect(screen.getByTestId("images").textContent).toBe("hypothesis:3:false")
    expect(screen.getByTestId("files").textContent).toBe("hypothesis:3:false")
  })
})
