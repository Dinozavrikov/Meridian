import { describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider, useMutation, useQuery } from "@tanstack/react-query"
import { historyQueryKey } from "@/lib/entity-history-cache"
import { UNDO_MUTATION_KEY, useHistoryLiveRefresh } from "@/lib/use-history-live-refresh"

function Observer({ id, fetchHistory }: { id: number; fetchHistory: () => Promise<number> }) {
  // staleTime: Infinity — перезагрузить запрос может только инвалидация
  useQuery({ queryKey: historyQueryKey("observation", id), queryFn: fetchHistory, staleTime: Infinity })
  return null
}

function Refresher() {
  useHistoryLiveRefresh("observation", 7)
  return null
}

function Mutators({ onBad, onUndo }: { onBad: () => void; onUndo: () => void }) {
  const ok = useMutation({ mutationFn: async () => "ok" })
  const bad = useMutation({ mutationFn: async () => { throw new Error("boom") }, onError: onBad })
  const undo = useMutation({ mutationKey: UNDO_MUTATION_KEY, mutationFn: async () => "ok", onSuccess: onUndo })
  return (
    <>
      <button onClick={() => ok.mutate()}>ok</button>
      <button onClick={() => bad.mutate()}>bad</button>
      <button onClick={() => undo.mutate()}>undo</button>
    </>
  )
}

function setup() {
  const fetch7 = vi.fn(async () => 1)
  const fetch8 = vi.fn(async () => 1)
  const onBad = vi.fn()
  const onUndo = vi.fn()
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const ui = (withRefresher = true) => (
    <QueryClientProvider client={qc}>
      <Observer id={7} fetchHistory={fetch7} />
      <Observer id={8} fetchHistory={fetch8} />
      {withRefresher && <Refresher />}
      <Mutators onBad={onBad} onUndo={onUndo} />
    </QueryClientProvider>
  )
  return { fetch7, fetch8, onBad, onUndo, ui }
}

const tick = () => new Promise(r => setTimeout(r, 30))

describe("useHistoryLiveRefresh", () => {
  it("успешная мутация перечитывает историю этой записи и только её", async () => {
    const s = setup()
    render(s.ui())
    await waitFor(() => expect(s.fetch7).toHaveBeenCalledTimes(1))
    fireEvent.click(screen.getByText("ok"))
    await waitFor(() => expect(s.fetch7).toHaveBeenCalledTimes(2))
    await tick()
    expect(s.fetch8).toHaveBeenCalledTimes(1)
  })

  it("неуспешная мутация историю не трогает", async () => {
    const s = setup()
    render(s.ui())
    await waitFor(() => expect(s.fetch7).toHaveBeenCalledTimes(1))
    fireEvent.click(screen.getByText("bad"))
    await waitFor(() => expect(s.onBad).toHaveBeenCalled())
    await tick()
    expect(s.fetch7).toHaveBeenCalledTimes(1)
  })

  it("собственный откат пропускается: он сам перечитывает историю", async () => {
    const s = setup()
    render(s.ui())
    await waitFor(() => expect(s.fetch7).toHaveBeenCalledTimes(1))
    fireEvent.click(screen.getByText("undo"))
    await waitFor(() => expect(s.onUndo).toHaveBeenCalled())
    await tick()
    expect(s.fetch7).toHaveBeenCalledTimes(1)
  })

  it("после размонтирования подписка снимается", async () => {
    const s = setup()
    const view = render(s.ui())
    await waitFor(() => expect(s.fetch7).toHaveBeenCalledTimes(1))
    view.rerender(s.ui(false))
    fireEvent.click(screen.getByText("ok"))
    await tick()
    expect(s.fetch7).toHaveBeenCalledTimes(1)
  })
})
