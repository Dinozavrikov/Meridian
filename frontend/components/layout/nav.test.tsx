import React from "react"
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest"
import { render, screen, fireEvent, cleanup } from "@testing-library/react"
import { STRINGS } from "@/lib/i18n/strings"
import { NAV_GROUPS, HEADER_GROUPS, DASHBOARD_ITEM, TRASH_ITEM, restColor, RAIL_WIDTH, SIDEBAR_TILE, SIDEBAR_ICON, MENU_TILE, MENU_ICON } from "@/lib/nav"
import { typeColor, v2 } from "@/lib/theme"
import { MobileNav } from "@/components/layout/nav-menu"
import { Header } from "@/components/layout/header"
import { Sidebar } from "@/components/layout/sidebar"

const state = vi.hoisted(() => ({ mobile: false, user: { username: "nik", display_name: "Nik" } as any }))

vi.mock("next/link", async () => {
  const React = await import("react")
  return { default: ({ href, children, ...rest }: any) => React.createElement("a", { href, ...rest }, children) }
})
vi.mock("next/navigation", () => ({ usePathname: () => "/hypotheses" }))
vi.mock("@/lib/i18n/useT", async () => {
  const { STRINGS } = await vi.importActual<typeof import("@/lib/i18n/strings")>("@/lib/i18n/strings")
  return { useT: () => (key: string) => (STRINGS as Record<string, string>)[key] ?? key }
})
vi.mock("@/lib/store", () => ({
  useStore: () => ({ user: state.user, setUser: vi.fn(), setSearchOpen: vi.fn() }),
}))
vi.mock("@/lib/api", () => ({ authApi: { logout: vi.fn() } }))
vi.mock("@/lib/use-unread", () => ({
  useUnread: () => ({ items: [] }),
  useUnreadMessages: () => ({ count: 0 }),
}))
vi.mock("@/lib/use-question-answers", () => ({ useQuestionAnswerPending: () => ({ total: 0 }) }))
vi.mock("@/components/layout/contradictions-bell", () => ({ ContradictionsBell: () => null }))
vi.mock("@/components/layout/locale-switcher", () => ({ LocaleSwitcher: () => null }))
vi.mock("@/components/layout/resizable-layout", () => ({ useIsMobile: () => state.mobile }))

beforeEach(() => { state.mobile = false; state.user = { username: "nik", display_name: "Nik" } })
afterEach(() => { cleanup(); vi.restoreAllMocks() })

const S = STRINGS as Record<string, string>
const t = (key: string) => S[key] ?? key

const ALL_ITEMS = [DASHBOARD_ITEM, ...NAV_GROUPS.flatMap(g => g.items), TRASH_ITEM]
const hrefsIn = (root: ParentNode) =>
  Array.from(root.querySelectorAll("a")).map(a => a.getAttribute("href") as string)
const rgb = (hex: string) => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255] }
const dist = (a: string, b: string) => Math.hypot(...rgb(a).map((v, i) => v - rgb(b)[i]))
// jsdom приводит цвет к своему виду (rgb(...)) — сравниваем через такую же нормализацию
const norm = (c: string) => { const d = document.createElement("div"); d.style.color = c; return d.style.color }

describe("lib/nav — общий список пунктов", () => {
  it("корзина есть в верхнем меню: последней строкой группы «Данные», под разделителем", () => {
    const data = HEADER_GROUPS.find(g => g.id === "data")!
    const last = data.items[data.items.length - 1]
    expect(last.href).toBe("/trash")
    expect(last.dividerBefore).toBe(true)
    // в остальных группах корзины нет
    expect(HEADER_GROUPS.filter(g => g.id !== "data").flatMap(g => g.items).map(i => i.href)).not.toContain("/trash")
  })

  it("у каждого пункта свой адрес (двух одинаковых ссылок в меню нет)", () => {
    const hrefs = ALL_ITEMS.map(i => i.href)
    expect(new Set(hrefs).size).toBe(hrefs.length)
  })

  it("цвет в меню несут только типы записей (тот же, что на карточках); остальные разделы — бирюзовый акцент, выдуманных цветов нет", () => {
    const entity: Record<string, string> = {
      "/observations": typeColor.observation, "/hypotheses": typeColor.hypothesis,
      "/predictions": typeColor.prediction, "/worldview": typeColor.worldview,
      "/questions": typeColor.question, "/tasks": typeColor.task, "/labs": typeColor.lab,
    }
    for (const i of ALL_ITEMS) {
      if (i.href === "/trash") continue // корзина красная: деструктивная зона
      expect(i.color.toLowerCase()).toBe((entity[i.href] ?? v2.teal).toLowerCase())
    }
  })

  it("флаг «запись» стоит ровно у семи типов записей; инструменты, дашборд и корзина нейтральны", () => {
    const flagged = ALL_ITEMS.filter(i => i.entity).map(i => i.href).sort()
    expect(flagged).toEqual(["/hypotheses", "/labs", "/observations", "/predictions", "/questions", "/tasks", "/worldview"])
    for (const i of ALL_ITEMS.filter(i => !i.entity)) expect(restColor(i).toLowerCase(), i.href).toBe(v2.t3.toLowerCase())
  })

  it("цвет записи в покое — между серым и цветом типа (приглушённый, не серый и не полный)", () => {
    for (const i of ALL_ITEMS.filter(i => i.entity)) {
      const rest = restColor(i)
      expect(rest.toLowerCase(), i.href).not.toBe(v2.t3.toLowerCase())
      expect(rest.toLowerCase(), i.href).not.toBe(i.color.toLowerCase())
      expect(dist(rest, v2.t3), i.href).toBeLessThan(dist(i.color, v2.t3)) // ближе к серому, чем полный цвет
    }
  })

  it("задача и прогноз различимы глазом (раньше #E8A020 и #F5A623 сливались)", () => {
    expect(dist(typeColor.task, typeColor.prediction)).toBeGreaterThan(100)
  })
})

describe("Sidebar", () => {
  it("рисует те же пункты в том же порядке, что и lib/nav (с корзиной)", () => {
    const { container } = render(<Sidebar />)
    const expected = ALL_ITEMS.map(i => i.href)
    expect(hrefsIn(container).filter(h => expected.includes(h))).toEqual(expected)
  })

  it("активный пункт горит цветом своего типа, неактивный приглушён", () => {
    const { container } = render(<Sidebar />) // pathname замокан как /hypotheses
    const icon = (href: string) => container.querySelector(`a[href="${href}"] svg`) as SVGElement
    expect(icon("/hypotheses").style.color).toBe(norm(typeColor.hypothesis))
    const obs = ALL_ITEMS.find(i => i.href === "/observations")!
    expect(icon("/observations").style.color).toBe(norm(restColor(obs)))        // запись в покое — приглушённый цвет типа
    expect(icon("/observations").style.color).not.toBe(norm(typeColor.observation)) // но не на полную яркость
    expect(icon("/graph").style.color).toBe(norm(v2.t3))                         // инструмент — нейтральный
  })
})

describe("Размеры значков", () => {
  it("рейка: иконка нужного размера, плитка влезает в рейку с зазором, а ширина рейки — из общей константы", () => {
    expect(SIDEBAR_TILE).toBeLessThan(RAIL_WIDTH)
    const { container } = render(<Sidebar />)
    expect((container.querySelector("aside") as HTMLElement).style.width).toBe(`${RAIL_WIDTH}px`)
    const svg = container.querySelector('a[href="/hypotheses"] svg') as SVGElement
    expect(svg.getAttribute("width")).toBe(String(SIDEBAR_ICON))
    const tile = svg.parentElement as HTMLElement
    expect(tile.style.width).toBe(`${SIDEBAR_TILE}px`)
  })

  it("полоска активного пункта прижата к краю экрана при любых размерах плитки и рейки", () => {
    const { container } = render(<Sidebar />) // активен /hypotheses
    const bar = container.querySelector('a[href="/hypotheses"] [style*="box-shadow"]') as HTMLElement
    expect(bar.style.left).toBe(`${-(RAIL_WIDTH - SIDEBAR_TILE) / 2}px`)
  })

  it("выпадающее меню: иконка и плитка нужного размера", () => {
    const { container } = render(<MobileNav pathname="/x" t={t} />)
    fireEvent.click(screen.getByRole("button"))
    const svg = container.querySelector('a[href="/observations"] svg') as SVGElement
    expect(svg.getAttribute("width")).toBe(String(MENU_ICON))
    expect((svg.parentElement as HTMLElement).style.width).toBe(`${MENU_TILE}px`)
  })
})

describe("Header (десктоп) — верхнее меню", () => {
  it("корзины нет, пока группа закрыта; после наведения на «Данные» она появляется", () => {
    const { container } = render(<Header titleKey="page.feed.title" />)
    expect(hrefsIn(container)).not.toContain("/trash")
    fireEvent.mouseEnter(screen.getByText(S["nav.data.group"]))
    expect(hrefsIn(container)).toContain("/trash")
    expect(screen.getByText(S["nav.trash"])).toBeTruthy()
  })

  it("в выпадашке «Анализ» корзины нет, а её пункты на месте", () => {
    const { container } = render(<Header titleKey="page.feed.title" />)
    fireEvent.mouseEnter(screen.getByText(S["nav.analysis.group"]))
    const hrefs = hrefsIn(container)
    expect(hrefs).not.toContain("/trash")
    for (const i of NAV_GROUPS.find(g => g.id === "analysis")!.items) expect(hrefs).toContain(i.href)
  })

  it("логотип ведёт залогиненного на дашборд", () => {
    const { container } = render(<Header titleKey="page.feed.title" />)
    const logo = container.querySelector('a[href="/dashboard"]') as HTMLElement
    expect(logo).toBeTruthy()
    expect(logo.textContent).toContain("MER")
  })
})

describe("Header — без украшений", () => {
  it("у заголовков групп нет цветных точек (шум без информации)", () => {
    const { container } = render(<Header titleKey="page.feed.title" />)
    expect(container.querySelectorAll('span[style*="border-radius: 50%"]').length).toBe(0)
  })

  it("в выпадашке цвет только у активного пункта, остальные нейтральны", () => {
    const { container } = render(<Header titleKey="page.feed.title" />)
    fireEvent.mouseEnter(screen.getByText(S["nav.data.group"]))
    const icon = (href: string) => container.querySelector(`a[href="${href}"] svg`) as SVGElement
    expect(icon("/hypotheses").style.color).toBe(norm(typeColor.hypothesis))
    const obs = ALL_ITEMS.find(i => i.href === "/observations")!
    expect(icon("/observations").style.color).toBe(norm(restColor(obs)))
    expect(icon("/observations").style.color).not.toBe(norm(typeColor.observation))
  })
})

describe("Header — гость", () => {
  it("логотип ведет гостя на главную: дашборда у гостя нет, ссылка на него была бы мертвой", () => {
    state.user = null
    const { container } = render(<Header titleKey="page.feed.title" />)
    const hrefs = hrefsIn(container)
    expect(hrefs).toContain("/")
    expect(hrefs).not.toContain("/dashboard")
    expect((container.querySelector('a[href="/"]') as HTMLElement).textContent).toContain("MER")
  })
})

describe("MobileNav", () => {
  it("гамбургер раскрывает ВСЕ пункты: дашборд, группы и корзину", () => {
    const { container } = render(<MobileNav pathname="/x" t={t} />)
    expect(hrefsIn(container)).toEqual([])
    fireEvent.click(screen.getByRole("button"))
    const hrefs = hrefsIn(container)
    for (const i of ALL_ITEMS) expect(hrefs).toContain(i.href)
  })

  it("клик по пункту закрывает меню", () => {
    const { container } = render(<MobileNav pathname="/x" t={t} />)
    fireEvent.click(screen.getByRole("button"))
    const link = container.querySelector('a[href="/trash"]') as HTMLElement
    link.addEventListener("click", e => e.preventDefault()) // jsdom не умеет навигацию
    fireEvent.click(link)
    expect(hrefsIn(container)).toEqual([])
  })
})

describe("пункт «О Meridian»", () => {
  it("боковая панель: иконка ведет на главную и подписана", () => {
    const { container } = render(<Sidebar />)
    const about = container.querySelector('a[href="/"]') as HTMLElement | null
    expect(about, "иконка О Meridian").not.toBeNull()
    expect(about!.getAttribute("aria-label")).toBe(S["sidebar.about"])
  })

  it("мобильное меню: строка есть, ведет на главную, клик закрывает меню", () => {
    const { container } = render(<MobileNav pathname="/x" t={t} />)
    fireEvent.click(screen.getByRole("button"))
    expect(hrefsIn(container)).toContain("/")
    fireEvent.click(screen.getByText(S["sidebar.about"]))
    expect(hrefsIn(container)).toEqual([])
  })
})
