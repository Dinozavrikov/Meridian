import { describe, it, expect, vi } from "vitest"

const h = vi.hoisted(() => ({ permanent: vi.fn(), temporary: vi.fn() }))
vi.mock("next/navigation", () => ({ permanentRedirect: h.permanent, redirect: h.temporary }))

import RootPage from "@/app/page"

describe("корень сайта", () => {
  it("ведет на /feed постоянным редиректом, а не временным", () => {
    RootPage()
    expect(h.permanent).toHaveBeenCalledWith("/feed")
    expect(h.temporary).not.toHaveBeenCalled()
  })
})
