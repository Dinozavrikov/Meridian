import { beforeEach, describe, expect, it } from "vitest"
import { useStore } from "./store"

describe("режим перевода переживает перезагрузку", () => {
  beforeEach(() => {
    localStorage.clear()
    useStore.setState({ translationScope: "ui" })
  })

  it("выбранный режим записывается и восстанавливается после сброса стора", () => {
    useStore.getState().setTranslationScope("ui_and_content")
    useStore.setState({ translationScope: "ui" })        // имитация перезагрузки
    useStore.getState().restoreTranslationScope()
    expect(useStore.getState().translationScope).toBe("ui_and_content")
  })

  it("мусор в хранилище игнорируется", () => {
    localStorage.setItem("translation-scope:v1", "everything")
    useStore.getState().restoreTranslationScope()
    expect(useStore.getState().translationScope).toBe("ui")
  })

  it("сломанное хранилище не роняет выбор режима", () => {
    const orig = Storage.prototype.setItem
    Storage.prototype.setItem = () => { throw new Error("quota") }
    try {
      useStore.getState().setTranslationScope("content")
      expect(useStore.getState().translationScope).toBe("content")
    } finally { Storage.prototype.setItem = orig }
  })
})
