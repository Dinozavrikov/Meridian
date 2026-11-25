import { describe, expect, it, vi } from "vitest"
import { render } from "@testing-library/react"
import { DriftNetwork } from "@/components/ui/drift-network"

// Канал, которым jsdom сообщает о холсте, заранее не известен: console.error spy его не поймал.
// Поэтому ловятся и потоки процесса, и вся консоль.
function watchOutput(): string[] {
  const lines: string[] = []
  const take = (chunk: unknown) => { lines.push(String(chunk)); return true }
  vi.spyOn(process.stderr, "write").mockImplementation(take as never)
  vi.spyOn(process.stdout, "write").mockImplementation(take as never)
  for (const m of ["error", "warn", "log", "info", "debug"] as const) {
    vi.spyOn(console, m).mockImplementation((...args: unknown[]) => { lines.push(args.map(String).join(" ")) })
  }
  return lines
}

describe("холст в jsdom", () => {
  it("getContext не пишет в консоль и возвращает null", () => {
    const out = watchOutput()
    const ctx = document.createElement("canvas").getContext("2d")
    expect(ctx).toBeNull()
    expect(out).toEqual([])
  })

  it("фоновая сеть в jsdom молча ничего не рисует", () => {
    const out = watchOutput()
    const { container } = render(<DriftNetwork />)
    expect(container.querySelector("canvas")).not.toBeNull()
    expect(out).toEqual([])
  })
})
