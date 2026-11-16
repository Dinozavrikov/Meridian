import { describe, it, expect } from "vitest"
import { STRINGS } from "@/lib/i18n/strings"
import { UNDO_BLOCK_CODES, blockedReasonKey } from "@/lib/entity-history-api"

describe("коды блокировки отката", () => {
  it("у каждого кода есть текст в словаре", () => {
    for (const code of UNDO_BLOCK_CODES) {
      expect((STRINGS as Record<string, string>)[`history.blocked.${code}`], code).toBeTruthy()
    }
  })
  it("откат видимости: коды лаборатории известны фронту и ведут на свои тексты", () => {
    expect(UNDO_BLOCK_CODES).toContain("lab_state_changed")
    expect(UNDO_BLOCK_CODES).toContain("not_lab_member")
    expect(blockedReasonKey("not_lab_member")).toBe("history.blocked.not_lab_member")
    expect(blockedReasonKey("lab_state_changed")).toBe("history.blocked.lab_state_changed")
  })
})
