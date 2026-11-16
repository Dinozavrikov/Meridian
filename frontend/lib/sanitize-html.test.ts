import { describe, it, expect, vi } from "vitest"
import { sanitizeHtml, filterStyle } from "@/lib/sanitize-html"
import { renderableHtml } from "@/lib/render-safe-html"

/** Всё, что в разобранном HTML может выполнить код или подменить интерфейс. */
function findDanger(html: string): string[] {
  const doc = new DOMParser().parseFromString(html, "text/html")
  const found: string[] = []
  doc.querySelectorAll("script,style,iframe,object,embed,form,input,button,textarea,select,link,meta,base")
    .forEach(el => found.push(`<${el.tagName.toLowerCase()}>`))
  doc.querySelectorAll("*").forEach(el => {
    for (const a of Array.from(el.attributes)) {
      const tag = el.tagName.toLowerCase()
      if (/^on/i.test(a.name)) found.push(`${tag}@${a.name}`)
      if (/^(javascript|vbscript|data:text\/html)/i.test(a.value.replace(/[\u0000-\u0020]/g, ""))) found.push(`${tag}@${a.name}=${a.value.slice(0, 30)}`)
    }
  })
  return found
}

const PAYLOADS: [string, string][] = [
  ["img onerror", '<p>ok</p><img src="x" onerror="window.__pwn=1">'],
  ["script", "<script>window.__pwn=1</script><p>t</p>"],
  ["javascript: в href", '<a href="javascript:window.__pwn=1">x</a>'],
  ["javascript: с обфускацией", '<a href="jav&#x09;ascript:window.__pwn=1">x</a>'],
  ["data:text/html в href", '<a href="data:text/html,<script>window.__pwn=1</script>">x</a>'],
  ["svg onload", '<svg onload="window.__pwn=1"><circle r="5"/></svg>'],
  ["iframe", '<iframe src="https://evil.test"></iframe>'],
  ["форма-фишинг", '<form action="https://evil.test"><input name="p"><button>go</button></form>'],
  ["style-тег", "<style>p{display:none}</style><p>t</p>"],
  ["details ontoggle", '<details open ontoggle="window.__pwn=1">x</details>'],
  ["mXSS (math/table/style)", '<math><mtext><table><mglyph><style><!--</style><img title="--&gt;&lt;img src=1 onerror=window.__pwn=1&gt;">'],
  ["body onload", '<body onload="window.__pwn=1"><p>t</p>'],
  ["meta refresh", '<meta http-equiv="refresh" content="0;url=https://evil.test"><p>t</p>'],
]

describe("sanitizeHtml: вырезает опасное", () => {
  it.each(PAYLOADS)("%s", (_name, html) => {
    expect(findDanger(sanitizeHtml(html))).toEqual([])
  })
})

describe("sanitizeHtml: сохраняет нужное", () => {
  it.each([
    "<h2>Заголовок</h2>",
    "<p><strong>b</strong> <em>i</em> <s>s</s> <code>c</code></p>",
    "<ul><li>раз</li><li>два</li></ul>",
    "<ol><li>раз</li></ol>",
    "<blockquote>q</blockquote>",
    "<pre><code>x = 1</code></pre>",
    '<a href="meridian://hypothesis/3">гипотеза</a>',
    '<a href="https://example.com/a?b=1">ссылка</a>',
    '<a href="mailto:a@b.test">почта</a>',
    '<img src="/api/uploads/a.png" alt="a">',
  ])("%s", frag => {
    expect(sanitizeHtml(frag)).toContain(frag)
  })

  it("target=_blank получает rel=noopener noreferrer, другие target убираются", () => {
    const blank = sanitizeHtml('<a href="https://example.com" target="_blank">x</a>')
    expect(blank).toContain('target="_blank"')
    expect(blank).toContain('rel="noopener noreferrer"')
    expect(sanitizeHtml('<a href="https://example.com" target="_top">x</a>')).not.toContain("target")
  })
})

describe("style-атрибут", () => {
  it("оформление текста остаётся", () => {
    const out = sanitizeHtml('<p style="text-align:center"><span style="color: red; background-color: #ff0">x</span></p>')
    expect(out).toContain('style="text-align:center"')
    expect(out).toContain("color: red; background-color: #ff0")
  })

  it("опасные свойства убираются, безопасные в том же атрибуте остаются", () => {
    const out = sanitizeHtml('<span style="color:red;position:fixed;top:0">x</span>')
    expect(out).toContain('style="color:red"')
    expect(out).not.toContain("position")
  })

  it("атрибут исчезает целиком, если безопасного в нём ничего нет", () => {
    expect(sanitizeHtml('<span style="position:fixed;inset:0">x</span>')).toBe("<span>x</span>")
  })

  it("url() и javascript: в значении отбрасываются", () => {
    const out = sanitizeHtml('<span style="background-color:url(javascript:1)">x</span>')
    expect(out).not.toContain("javascript")
    expect(out).not.toContain("style")
  })

  it("filterStyle: пустое, без двоеточия и чужие свойства", () => {
    expect(filterStyle("")).toBe("")
    expect(filterStyle("color")).toBe("")
    expect(filterStyle("color: red; position: fixed")).toBe("color: red")
  })
})

describe("серверный рендер", () => {
  it("без DOM отдаёт только экранированный текст, не HTML", () => {
    vi.stubGlobal("window", undefined)
    try {
      expect(sanitizeHtml('<p>a</p><img src=x onerror="window.__pwn=1">')).toBe("a")
      expect(sanitizeHtml("<b>x")).not.toContain("<")
    } finally {
      vi.unstubAllGlobals()
    }
  })
})

describe("renderableHtml", () => {
  it("HTML проходит санитайзер", () => {
    expect(findDanger(renderableHtml('<p>ok</p><img src="x" onerror="window.__pwn=1">'))).toEqual([])
    expect(renderableHtml("<p>ok</p>")).toContain("<p>ok</p>")
  })

  it("относительные картинки сохраняются и получают адрес API", () => {
    expect(renderableHtml('<img src="/api/uploads/a.png">')).toMatch(/src="[^"]*\/api\/uploads\/a\.png"/)
  })

  it("легаси-текст без тегов по-прежнему экранируется", () => {
    expect(renderableHtml("A < B & C\nстрока")).toBe("A &lt; B &amp; C<br />строка")
  })

  it("пусто и null → пустая строка", () => {
    expect(renderableHtml("")).toBe("")
    expect(renderableHtml(null)).toBe("")
    expect(renderableHtml(undefined)).toBe("")
  })
})
