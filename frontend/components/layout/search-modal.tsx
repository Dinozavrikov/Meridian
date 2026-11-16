"use client"
import { OBSERVATION_STATUSES } from "@/lib/observation-constants"
import { useState, useEffect, useRef, useMemo } from "react"
import { useStore } from "@/lib/store"
import { searchApi } from "@/lib/api"
import { TYPE_COLORS, TYPE_RU } from "@/lib/utils"
import { X, Eye, Lightbulb, TrendingUp, Globe, HelpCircle, CheckSquare, FlaskConical } from "lucide-react"
import { useRouter } from "next/navigation"
import { useT } from "@/lib/i18n/useT"
import { entityHref } from "@/lib/entity-routes"
import { MaturationStepper } from "@/components/feed/maturation-stepper"
import { PercentBar } from "@/components/ui/percent-bar"
import { useContentT, type ContentTranslateItem } from "@/lib/i18n/useContentT"

// entity-типы (все, кроме lab) роутятся через общий entityHref() из lib/entity-routes —
// единственное реальное исключение здесь: lab, у которого свой [id]-сегмент,
// а не ?id=&tab=detail, поэтому entity-routes.ts его сознательно не описывает.

const TYPE_ICON: Record<string, any> = {
  observation: Eye,
  hypothesis:  Lightbulb,
  prediction:  TrendingUp,
  worldview:   Globe,
  question:    HelpCircle,
  task:        CheckSquare,
  lab:         FlaskConical,
}

const TYPE_ORDER = ["observation", "hypothesis", "prediction", "worldview", "question", "task", "lab"]

function highlightMatch(text: string, query: string, color: string) {
  if (!query.trim()) return text
  const idx = text.toLowerCase().indexOf(query.trim().toLowerCase())
  if (idx === -1) return text
  return (
    <>
      {text.slice(0, idx)}
      <span style={{ color, fontWeight: 700 }}>{text.slice(idx, idx + query.trim().length)}</span>
      {text.slice(idx + query.trim().length)}
    </>
  )
}

function MeridianSearchGlyph({ active }: { active: boolean }) {
  return (
    <svg width="30" height="16" viewBox="0 0 30 16" style={{ flexShrink: 0, overflow: "visible" }}>
      <path d="M2,8 C 9,-2 21,18 28,8" fill="none" stroke="#23263a" strokeWidth={1} />
      {active && (
        <circle r={2.4} fill="#4dcfa6" style={{
          offsetPath: "path('M2,8 C 9,-2 21,18 28,8')",
          filter: "drop-shadow(0 0 4px #4dcfa6)",
          animation: "meridian-search-travel 1.3s linear infinite",
        }} />
      )}
      {!active && <circle cx={15} cy={8} r={1.6} fill="#3a3d52" />}
    </svg>
  )
}

export function SearchModal() {
  const t = useT()
  const { searchOpen, setSearchOpen } = useStore()
  const [q, setQ] = useState("")
  const [results, setResults] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  useEffect(() => {
    if (searchOpen) {
      setTimeout(() => inputRef.current?.focus(), 50)
      setQ("")
      setResults([])
      setActiveIndex(0)
    }
  }, [searchOpen])

  useEffect(() => {
    if (!q.trim()) { setResults([]); return }
    const tm = setTimeout(async () => {
      setLoading(true)
      try {
        const d = await searchApi.search(q)
        setResults(d.results ?? [])
        setActiveIndex(0)
      } finally {
        setLoading(false)
      }
    }, 250)
    return () => clearTimeout(tm)
  }, [q])

  // Единственный тип результатов, который бывает чужим — lab (публичные
  // чужие лабы или лабы, где я просто участник, см. search.py); остальные
  // 6 типов в этом эндпоинте всегда свои по построению SQL-запроса на
  // бэкенде (user_id == uid). useListContentTranslation тут не подходит —
  // она читает исходный текст из item[field] по тому же имени, что и ключ
  // кэша, а у результата поиска поля называются title/snippet, не name/
  // description — используем useContentT() напрямую, как в TaskGraphTab.
  // r.title = полное l.name — поле кэша "name", как в labs/page.tsx,
  // безопасно делит кэш. r.snippet ОБРЕЗАН (l.description[:120]) — если
  // завести под тем же именем "description", что и полный текст в
  // labs/page.tsx, при уже существующем переводе полного описания сюда
  // прилетит ПОЛНЫЙ перевод вместо обрезанного сниппета (ключ кэша не
  // учитывает сам текст, только имя поля) — поэтому отдельное поле
  // "description_snippet".
  const { ct: ctLab, ensure: ensureLab } = useContentT()
  const labResults = results.filter(r => r.type === "lab")
  const labIdsKey = labResults.map((r: any) => r.id).join(",")
  useEffect(() => {
    const items: ContentTranslateItem[] = []
    for (const r of labResults) {
      if (r.is_own) continue
      if (r.title) items.push({ entityType: "lab", entityId: r.id, field: "name", text: r.title })
      if (r.snippet) items.push({ entityType: "lab", entityId: r.id, field: "description_snippet", text: r.snippet })
    }
    ensureLab(items)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [labIdsKey])
  const tLabTitle = (r: any) => r.is_own ? r.title : ctLab("lab", r.id, "name", r.title)
  const tLabSnippet = (r: any) => r.is_own ? r.snippet : ctLab("lab", r.id, "description_snippet", r.snippet)

  const groups = useMemo(() => {
    const byType: Record<string, any[]> = {}
    for (const r of results) { (byType[r.type] ??= []).push(r) }
    return TYPE_ORDER.filter(tp => byType[tp]?.length).map(tp => ({ type: tp, items: byType[tp] }))
  }, [results])

  const flatResults = useMemo(() => groups.flatMap(g => g.items), [groups])

  const go = (r: any) => {
    if (r.type === "lab") {
      router.push(`/labs/${r.id}`)
    } else {
      router.push(entityHref(r.type, r.id))
    }
    setSearchOpen(false)
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { setSearchOpen(false); return }
    if (!flatResults.length) return
    if (e.key === "ArrowDown") { e.preventDefault(); setActiveIndex(i => Math.min(i + 1, flatResults.length - 1)) }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActiveIndex(i => Math.max(i - 1, 0)) }
    else if (e.key === "Enter") { e.preventDefault(); const r = flatResults[activeIndex]; if (r) go(r) }
  }

  if (!searchOpen) return null

  let runningIndex = -1
  // Значения статуса наблюдения от бэкенда — данные, не UI-текст, не переводим.
  const OBS_STAGES = OBSERVATION_STATUSES

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-24 px-4"
      style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(6px)" }}
      onClick={e => { if (e.target === e.currentTarget) setSearchOpen(false) }}
    >
      <div
        className="w-full max-w-xl rounded-xl shadow-2xl overflow-hidden relative"
        style={{ background: "#13141f", border: "1px solid #23263a" }}
        onKeyDown={onKeyDown}
      >
        <div className="meridian-grid-bg" />

        <div className="relative flex items-center gap-3 px-4 py-3 border-b" style={{ borderColor: "#20202e" }}>
          <MeridianSearchGlyph active={loading} />
          <input
            ref={inputRef}
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder={t("searchModal.placeholder")}
            className="meridian-search-input flex-1 bg-transparent text-sm text-[#e0e0e0] outline-none"
            style={{ letterSpacing: "-0.005em", fontFamily: "var(--font-sans)" }}
          />
          {flatResults.length > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
              <kbd style={{ fontSize: 10, padding: "2px 5px", borderRadius: 4, background: "#0d0e16", border: "1px solid #23263a", color: "#9999a9", fontFamily: "var(--font-mono)" }}>↑↓</kbd>
              <kbd style={{ fontSize: 10, padding: "2px 5px", borderRadius: 4, background: "#0d0e16", border: "1px solid #23263a", color: "#9999a9", fontFamily: "var(--font-mono)" }}>↵</kbd>
            </div>
          )}
          <button onClick={() => setSearchOpen(false)} className="text-[#505050] hover:text-[#e0e0e0]">
            <X size={16} />
          </button>
        </div>

        {groups.length > 0 && (
          <div className="relative max-h-96 overflow-y-auto py-2">
            {groups.map(group => {
              const color = TYPE_COLORS[group.type] ?? "#555"
              const Icon = TYPE_ICON[group.type]
              return (
                <div key={group.type} style={{ borderTop: group !== groups[0] ? "1px solid #1a1b28" : "none" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "10px 14px 7px" }}>
                    {Icon && (
                      <div style={{
                        width: 18, height: 18, borderRadius: 5, flexShrink: 0,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        background: `${color}18`,
                      }}>
                        <Icon size={10} style={{ color }} />
                      </div>
                    )}
                    <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color }}>
                      {TYPE_RU[group.type] ?? group.type}
                    </span>
                    <span style={{
                      fontSize: 9.5, fontWeight: 700, color, background: `${color}14`, borderRadius: 4,
                      padding: "1px 5px", marginLeft: 1, fontFamily: "var(--font-mono)",
                    }}>
                      {group.items.length}
                    </span>
                    <div style={{ flex: 1, height: 1, background: `linear-gradient(to right, ${color}30, transparent)`, marginLeft: 4 }} />
                  </div>

                  {group.items.map((r: any) => {
                    runningIndex++
                    const idx = runningIndex
                    const active = idx === activeIndex
                    const isMaturingObs = group.type === "observation" && OBS_STAGES.includes(r.status)
                    const hasConfidence = group.type === "prediction" && r.confidence != null

                    return (
                      <button
                        key={idx}
                        onClick={() => go(r)}
                        onMouseEnter={() => setActiveIndex(idx)}
                        className="w-full flex flex-col gap-1.5 pr-4 pl-3 py-2.5 transition-colors text-left"
                        style={{
                          borderLeft: `3px solid ${active ? color : `${color}35`}`,
                          background: active ? `${color}0f` : "transparent",
                        }}
                      >
                        <div className="w-full flex items-center gap-3">
                          {Icon && <Icon size={13} style={{ color: `${color}b0`, flexShrink: 0 }} />}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-[#e8e8f0] truncate" style={{ fontWeight: active ? 600 : 400, letterSpacing: "-0.01em", fontFamily: "var(--font-sans)" }}>{highlightMatch(tLabTitle(r), q, color)}</p>
                            {r.snippet && <p className="text-xs text-[#5a5a72] truncate mt-0.5">{tLabSnippet(r)}</p>}
                          </div>
                          {r.status && !isMaturingObs && (
                            <span style={{
                              fontSize: 9.5, fontWeight: 600, color, background: `${color}16`,
                              border: `1px solid ${color}30`, borderRadius: 5, padding: "2px 7px",
                              flexShrink: 0, whiteSpace: "nowrap",
                            }}>
                              {r.status}
                            </span>
                          )}
                        </div>

                        {isMaturingObs && (
                          <div style={{ paddingLeft: 25, transform: "scale(0.86)", transformOrigin: "left center", width: "112%" }}>
                            <MaturationStepper status={r.status} />
                          </div>
                        )}

                        {hasConfidence && (
                          <div style={{ paddingLeft: 25, maxWidth: 220 }}>
                            <PercentBar label={t("searchModal.confidence")} value={r.confidence} color={color} />
                          </div>
                        )}
                      </button>
                    )
                  })}
                </div>
              )
            })}
          </div>
        )}

        {q && !loading && results.length === 0 && (
          <div className="relative px-4 py-8 text-center text-sm text-[#505050]">{t("searchModal.notFound")}</div>
        )}

        {!q && (
          <div className="relative px-4 py-4 text-xs text-[#404040]">
            {t("searchModal.emptyHint")}
          </div>
        )}
      </div>

      <style>{`
        @keyframes meridian-search-travel {
          0%   { offset-distance: 0%;   opacity: 0; }
          10%  { opacity: 1; }
          90%  { opacity: 1; }
          100% { offset-distance: 100%; opacity: 0; }
        }
        .meridian-search-input::placeholder {
          font-family: var(--font-serif);
          font-style: italic;
          font-weight: 400;
          color: #4a4a62;
          letter-spacing: 0;
        }
      `}</style>
    </div>
  )
}
