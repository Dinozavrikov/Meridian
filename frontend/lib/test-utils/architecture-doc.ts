// Проверка ARCHITECTURE.md: идентификаторы и файлы, на которые документ ссылается, должны существовать в репозитории.
import { readdirSync, readFileSync } from "node:fs"
import { join, resolve } from "node:path"

export const REPO = resolve(process.cwd(), "..")
const SKIP = new Set(["node_modules", ".next", ".git", "__pycache__", ".venv", "uploads", "attachments", "geoip"])
const TEXT = /\.(py|ts|tsx|js|mjs|sh|yml|yaml|md|json|toml|ini|txt)$|(^|\/)(Caddyfile|Dockerfile)$/

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(e.name)) continue
    const p = join(dir, e.name)
    if (e.isDirectory()) walk(p, out)
    else if (TEXT.test(p)) out.push(p)
  }
  return out
}

const DOC = "ARCHITECTURE.md"
let cache: { paths: string[]; corpusPaths: string[]; corpus: string } | null = null
function index() {
  if (!cache) {
    const files = walk(REPO)
    const rel = (f: string) => f.slice(REPO.length + 1)
    // Сам документ не источник своих ссылок: иначе любое слово в нем нашло бы себя, и проверка ничего бы не ловила.
    const sources = files.filter(f => rel(f) !== DOC)
    cache = { paths: files.map(rel), corpusPaths: sources.map(rel), corpus: sources.map(f => readFileSync(f, "utf-8")).join("\n").toLowerCase() }
  }
  return cache
}

export const corpusPaths = () => index().corpusPaths

const isCodeName = (t: string) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(t) && (/_/.test(t) || /[a-z][A-Z]/.test(t) || /^[A-Z]{3,}$/.test(t))
const isFilePath = (t: string) => /^[\w./-]+\.(py|ts|tsx|sh|yml|md|json)$/.test(t) || t === "Caddyfile"

/** Ссылки из текста документа (в обратных кавычках), которых нет в репозитории. */
export function missingReferences(doc: string): string[] {
  const { paths, corpus } = index()
  const out: string[] = []
  for (const m of doc.matchAll(/`([^`\n]+)`/g)) {
    const t = m[1].trim()
    if (isFilePath(t)) {
      if (!paths.some(p => p === t || p.endsWith("/" + t))) out.push(`файл ${t}`)
    } else if (isCodeName(t)) {
      if (!corpus.includes(t.toLowerCase())) out.push(`идентификатор ${t}`)
    }
  }
  return [...new Set(out)]
}

/** Числа, которые устаревают с первым коммитом: версии продукта и счетчики вида «31 routers». Номера разделов («5.5 Components») не в счет. */
export function volatileNumbers(doc: string): string[] {
  const versions = (doc.match(/\b\d+\.\d+\.\d+\b/g) ?? []).filter(v => v !== "1.0.0")
  const counters = doc.match(/(?<![\d.])\b\d+\s+(routers?|versions|lines|components|migrations|tables)\b/gi) ?? []
  return [...versions, ...counters]
}
