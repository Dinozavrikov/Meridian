import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import { QueryClient, QueryClientProvider, useMutation, useQuery } from "@tanstack/react-query"
import { RecordSharesSync } from "@/components/entities/record-shares-sync"

function Probe({ fetcher, fail }: { fetcher: () => Promise<number>; fail?: boolean }) {
  useQuery({ queryKey: ["record-shares", "observation", 1], queryFn: fetcher, staleTime: Infinity })
  const mut = useMutation({ mutationFn: async () => { if (fail) throw new Error("x"); return 1 } })
  return <button onClick={() => mut.mutate()}>go</button>
}
const mount = (fetcher: () => Promise<number>, fail = false) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(<QueryClientProvider client={qc}><RecordSharesSync /><Probe fetcher={fetcher} fail={fail} /></QueryClientProvider>)
}

describe("RecordSharesSync", () => {
  it("успешная мутация перечитывает «Кому открыто»", async () => {
    const f = vi.fn().mockResolvedValue(1)
    mount(f)
    await vi.waitFor(() => expect(f).toHaveBeenCalledTimes(1))
    fireEvent.click(screen.getByText("go"))
    await vi.waitFor(() => expect(f).toHaveBeenCalledTimes(2))
  })
  it("неудачная мутация ничего не перечитывает", async () => {
    const f = vi.fn().mockResolvedValue(1)
    mount(f, true)
    await vi.waitFor(() => expect(f).toHaveBeenCalledTimes(1))
    fireEvent.click(screen.getByText("go"))
    await new Promise(r => setTimeout(r, 120))
    expect(f).toHaveBeenCalledTimes(1)
  })
})
