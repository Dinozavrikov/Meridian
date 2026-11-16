import { describe, expect, it } from "vitest"
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { STRINGS } from "@/lib/i18n/strings"
import { askConsent, type ConsentImpact } from "@/lib/consent"
import { ConsentDialog } from "@/components/entities/consent-dialog"

const base: ConsentImpact = { entity_type: "observation", entity_id: 1, title: "Секретная", owner_id: 1, lab_id: 1, lab_name: "Лаба", lab_is_public: false,
  open_join: false, members: 3, via_type: "observation", via_id: 2, via_title: "Соседняя", options: ["me", "lab"] }
const pub: ConsentImpact = { ...base, lab_is_public: true, options: ["me", "public"] }
const S = (k: string) => STRINGS[k]

function ask(list: ConsentImpact[]) {
  let p!: Promise<string | null>
  act(() => { p = askConsent(list) })
  return p
}

describe("ConsentDialog", () => {
  it("закрытая лаборатория: «Только мне» и «Участникам», без «Всем»; сводка с записью и числом участников", async () => {
    render(<ConsentDialog />)
    ask([base])
    expect(await screen.findByText("Секретная")).toBeTruthy()
    expect(screen.getByText(/участников: 3/)).toBeTruthy()
    expect(screen.getByText(S("consent.option.me"))).toBeTruthy()
    expect(screen.getByText(S("consent.option.lab"))).toBeTruthy()
    expect(screen.queryByText(S("consent.option.public"))).toBeNull()
  })
  it("публичная лаборатория: «Только мне» и «Всем», без «Участникам», бейдж «публичная»", async () => {
    render(<ConsentDialog />)
    ask([pub])
    expect(await screen.findByText(S("consent.option.public"))).toBeTruthy()
    expect(screen.queryByText(S("consent.option.lab"))).toBeNull()
    expect(screen.getByText(S("consent.badge.public"))).toBeTruthy()
  })
  it("выбор возвращает me / lab / public", async () => {
    for (const [list, label, want] of [[base, "consent.option.me", "me"], [base, "consent.option.lab", "lab"], [pub, "consent.option.public", "public"]] as const) {
      const { unmount } = render(<ConsentDialog />)
      const p = ask([list])
      fireEvent.click(await screen.findByText(S(label)))
      expect(await p).toBe(want)
      unmount()
    }
  })
  it("цифра 2 выбирает второй вариант", async () => {
    render(<ConsentDialog />)
    const p = ask([base])
    await screen.findByText(S("consent.option.lab"))
    let got: string | null | undefined
    void p.then(v => { got = v })
    // слушатель цифр вешается в useEffect: под нагрузкой первое нажатие может опередить его, поэтому повторяем до ответа
    await waitFor(() => { fireEvent.keyDown(document, { key: "2" }); expect(got).toBe("lab") })
  })
  it("«Отмена» и Escape отвечают null", async () => {
    const { unmount } = render(<ConsentDialog />)
    const p1 = ask([base])
    fireEvent.click(await screen.findByText(S("actions.cancel")))
    expect(await p1).toBeNull()
    unmount()
    render(<ConsentDialog />)
    const p2 = ask([base])
    await screen.findByText(S("consent.option.me"))
    fireEvent.keyDown(document, { key: "Escape" })
    expect(await p2).toBeNull()
  })
  it("открытая лаборатория (open_join): предупреждение у «Участникам»", async () => {
    render(<ConsentDialog />)
    ask([{ ...base, open_join: true }])
    expect(await screen.findByText(S("consent.openJoin"))).toBeTruthy()
    expect(screen.getByText(S("consent.badge.openJoin"))).toBeTruthy()
  })
  it("записи с разными options: остаётся пересечение, то есть только «Только мне»", async () => {
    render(<ConsentDialog />)
    ask([base, pub])
    expect(await screen.findByText(S("consent.option.me"))).toBeTruthy()
    expect(screen.queryByText(S("consent.option.lab"))).toBeNull()
    expect(screen.queryByText(S("consent.option.public"))).toBeNull()
  })
  it("два запроса подряд показываются по очереди", async () => {
    render(<ConsentDialog />)
    const p1 = ask([{ ...base, title: "Первая" }]), p2 = ask([{ ...base, title: "Вторая" }])
    expect(await screen.findByText("Первая")).toBeTruthy()
    expect(screen.queryByText("Вторая")).toBeNull()
    fireEvent.click(screen.getByText(S("consent.option.me")))
    expect(await p1).toBe("me")
    expect(await screen.findByText("Вторая")).toBeTruthy()
    fireEvent.click(screen.getByText(S("consent.option.lab")))
    expect(await p2).toBe("lab")
  })
})
