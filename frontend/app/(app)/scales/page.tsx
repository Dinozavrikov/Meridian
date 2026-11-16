"use client"
import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { scalesApi } from "@/lib/api"
import { Header } from "@/components/layout/header"
import { PageShell, PageContent, SPLIT_BODY_STYLE } from "@/components/layout/page-shell"
import { ResizableLayout } from "@/components/layout/resizable-layout"
import { DetailPanel, DetailPanelEmpty } from "@/components/layout/detail-panel"
import { Plus, Pencil, Trash2, Scale, Check, X, ChevronDown, ChevronRight, Search } from "lucide-react"
import { theme, listItemTitle, listItemDate, sectionSearch, sectionSearchWrap } from "@/lib/theme"
import { DEFAULT_SCALES, translateScale, type Scale as ScaleDef, type ScaleLevel } from "@/lib/scales"
import { Ruler } from "@/components/ui/ruler"
import { RulerLevelsList } from "@/components/ui/ruler-levels-list"
import { useT } from "@/lib/i18n/useT"
import { useDynamicTranslate } from "@/lib/i18n/useDynamicT"
import { collectStrings } from "@/lib/i18n/collect-strings"

const ACCENT = "#A855F7"

// labelKey указывает на уже существующий ключ nav.* — те же слова уже
// переведены для меню навигации, дублировать не нужно.
const ENTITY_TYPES_DEF = [
  { value: "hypothesis",  labelKey: "nav.data.hypotheses",   color: "#4A90D9" },
  { value: "observation", labelKey: "nav.data.observations", color: "#1ABC9C" },
  { value: "prediction",  labelKey: "nav.data.predictions",  color: "#E67E22" },
  { value: "worldview",   labelKey: "nav.data.worldview",    color: "#27AE60" },
  { value: "task",        labelKey: "nav.analysis.tasks",    color: "#E74C3C" },
  { value: "question",    labelKey: "nav.data.questions",    color: "#F39C12" },
]

const GROUP_BY_DEF = [
  { value: "none",       key: "scalesPage.groupNone"       },
  { value: "status",     key: "scalesPage.groupStatus"     },
  { value: "tag",        key: "scalesPage.groupTag"        },
  { value: "author",     key: "scalesPage.groupAuthor"     },
  { value: "date_month", key: "scalesPage.groupDateMonth"  },
]

const COLORS = ["#4A90D9","#2ECC71","#E74C3C","#F39C12","#9B59B6","#1ABC9C","#E67E22","#A855F7"]


// ── LevelEditor ────────────────────────────────────────────────────────────
function LevelEditor({ levels, min, max, step, color, onChange }: {
  levels: any[]; min: number; max: number; step: number; color: string
  onChange: (levels: any[]) => void
}) {
  const t = useT()
  const values = Array.from({ length: Math.floor((max - min) / step) + 1 }, (_, i) => min + i * step)
  const getLvl = (v: number) => levels.find(l => l.value === v) ?? { value: v, label: "", desc: "" }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {values.map(v => {
        const lvl = getLvl(v)
        return (
          <div key={v} style={{ display: "grid", gridTemplateColumns: "28px 1fr 1fr", gap: 6, alignItems: "center" }}>
            <div style={{ width: 24, height: 24, borderRadius: 6, background: color + "20", border: `1px solid ${color}40`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color, flexShrink: 0 }}>{v}</div>
            <input
              value={lvl.label} placeholder={t("scalesPage.name")}
              onChange={e => onChange(values.map(vv => vv === v ? { ...getLvl(vv), label: e.target.value } : getLvl(vv)))}
              style={{ background: "#0a0a14", border: "1px solid #1e1e2c", borderRadius: 6, padding: "5px 8px", color: "#c0c0d8", fontSize: 11, outline: "none" }}
              onFocus={e => (e.target.style.borderColor = color + "60")}
              onBlur={e => (e.target.style.borderColor = "#1e1e2c")}
            />
            <input
              value={lvl.desc} placeholder={t("scalesPage.description")}
              onChange={e => onChange(values.map(vv => vv === v ? { ...getLvl(vv), desc: e.target.value } : getLvl(vv)))}
              style={{ background: "#0a0a14", border: "1px solid #1e1e2c", borderRadius: 6, padding: "5px 8px", color: "#9999a6", fontSize: 11, outline: "none" }}
              onFocus={e => (e.target.style.borderColor = color + "40")}
              onBlur={e => (e.target.style.borderColor = "#1e1e2c")}
            />
          </div>
        )
      })}
    </div>
  )
}

// ── ScaleForm ──────────────────────────────────────────────────────────────
function ScaleForm({ initial, onSave, onCancel }: { initial?: any; onSave: (d: any) => void; onCancel: () => void }) {
  const t = useT()
  const ENTITY_TYPES = ENTITY_TYPES_DEF.map(e => ({ ...e, label: t(e.labelKey) }))
  const GROUP_BY = GROUP_BY_DEF.map(g => ({ ...g, label: t(g.key) }))

  const [form, setForm] = useState({
    name:        initial?.name        ?? "",
    description: initial?.description ?? "",
    entity_type: initial?.entity_type ?? "hypothesis",
    min:         initial?.min         ?? 0,
    max:         initial?.max         ?? 10,
    step:        initial?.step        ?? 1,
    group_by:    initial?.group_by    ?? "none",
    color:       initial?.color       ?? ACCENT,
    levels:      initial?.levels      ?? [],
  })
  const f = (k: string) => (e: any) => setForm(p => ({ ...p, [k]: e.target.value }))
  const et = ENTITY_TYPES.find(e => e.value === form.entity_type)
  const readonly = initial?.builtin

  const inputStyle = () => ({
    width: "100%", background: readonly ? "#080810" : "#0d0d18",
    border: "1px solid #1e1e2c",
    borderRadius: 8, padding: "9px 12px", color: readonly ? "#9696a9" : "#e0e0f0",
    fontSize: 13, outline: "none", boxSizing: "border-box" as const,
    cursor: readonly ? "not-allowed" : "text",
  })

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {readonly && (
        <div style={{ padding: "8px 12px", borderRadius: 8, background: "#4A90D910", border: "1px solid #4A90D930", fontSize: 12, color: "#4A90D9" }}>
          {t("scalesPage.builtinNotice")}
        </div>
      )}

      <div>
        <label style={{ fontSize: 11, color: "#9696aa", marginBottom: 6, display: "block" }}>{t("scalesPage.name")}</label>
        <input value={form.name} onChange={f("name")} disabled={readonly} placeholder={t("scalesPage.namePlaceholder")} style={inputStyle()} />
      </div>

      <div>
        <label style={{ fontSize: 11, color: "#9696aa", marginBottom: 6, display: "block" }}>{t("scalesPage.description")}</label>
        <textarea value={form.description} onChange={f("description")} disabled={readonly} rows={2}
          placeholder={t("scalesPage.descriptionPlaceholder")}
          style={{ ...inputStyle(), resize: "none" }} />
      </div>

      <div>
        <label style={{ fontSize: 11, color: "#9696aa", marginBottom: 8, display: "block" }}>{t("scalesPage.appliesTo")}</label>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {ENTITY_TYPES.map(et2 => (
            <button key={et2.value}
              disabled={readonly}
              onClick={() => !readonly && setForm(p => ({ ...p, entity_type: et2.value }))}
              style={{ fontSize: 11, padding: "5px 12px", borderRadius: 6, cursor: readonly ? "not-allowed" : "pointer", border: `1px solid ${form.entity_type === et2.value ? et2.color + "60" : "#1e1e2c"}`, background: form.entity_type === et2.value ? et2.color + "18" : "#0d0d18", color: form.entity_type === et2.value ? et2.color : "#9696a9", transition: "all 0.12s", opacity: readonly ? 0.6 : 1 }}>
              {et2.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
        {([ ["min", t("scalesPage.from")], ["max", t("scalesPage.to")], ["step", t("scalesPage.step")] ] as [string,string][]).map(([k, label]) => (
          <div key={k}>
            <label style={{ fontSize: 11, color: "#9696aa", marginBottom: 6, display: "block" }}>{label}</label>
            <input type="number" value={(form as any)[k]} onChange={f(k)} disabled={readonly} style={inputStyle()} />
          </div>
        ))}
      </div>

      {!readonly && (
        <div>
          <label style={{ fontSize: 11, color: "#9696aa", marginBottom: 6, display: "block" }}>{t("scalesPage.grouping")}</label>
          <select value={form.group_by} onChange={f("group_by")}
            style={{ width: "100%", background: "#0d0d18", border: "1px solid #1e1e2c", borderRadius: 8, padding: "9px 12px", color: "#c0c0d8", fontSize: 13, outline: "none" }}>
            {GROUP_BY.map(g => <option key={g.value} value={g.value}>{g.label}</option>)}
          </select>
        </div>
      )}

      {!readonly && (
        <div>
          <label style={{ fontSize: 11, color: "#9696aa", marginBottom: 8, display: "block" }}>{t("scalesPage.color")}</label>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {COLORS.map(c => (
              <button key={c} onClick={() => setForm(p => ({ ...p, color: c }))}
                style={{ width: 24, height: 24, borderRadius: 6, background: c, border: form.color === c ? "2px solid #fff" : "2px solid transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", transition: "transform 0.1s", transform: form.color === c ? "scale(1.2)" : "scale(1)" }}>
                {form.color === c && <Check size={12} style={{ color: "#fff" }} />}
              </button>
            ))}
            <input type="color" value={form.color} onChange={f("color")} style={{ width: 32, height: 24, borderRadius: 6, border: "1px solid #1e1e2c", background: "#0d0d18", cursor: "pointer" }} />
          </div>
        </div>
      )}

      <div>
        <label style={{ fontSize: 11, color: "#9696aa", marginBottom: 10, display: "block", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em" }}>
          {t("scalesPage.levelDescriptions")}
        </label>
        <LevelEditor
          levels={form.levels}
          min={Number(form.min)} max={Number(form.max)} step={Number(form.step)}
          color={form.color}
          onChange={levels => setForm(p => ({ ...p, levels }))}
        />
      </div>

      <div style={{ background: "#0a0a14", border: "1px solid #1e1e28", borderRadius: 10, padding: 14 }}>
        <div style={{ fontSize: 10, color: "#9696a7", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600 }}>{t("scalesPage.preview")}</div>
        <Ruler name={t("scalesPage.preview")} value={Math.floor((Number(form.min) + Number(form.max)) / 2)} min={Number(form.min)} max={Number(form.max)} color={form.color} showLabel />
        <div style={{ fontSize: 10, color: "#9696a6", marginTop: 6 }}>
          {t("scalesPage.previewSummary", { et: et?.label ?? "", min: form.min, max: form.max, step: form.step })}
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", paddingTop: 4 }}>
        <button onClick={onCancel} style={{ padding: "7px 16px", borderRadius: 8, border: "1px solid #1e1e2c", background: "transparent", color: "#9696aa", cursor: "pointer", fontSize: 12 }}>{t("actions.cancel")}</button>
        <button onClick={() => onSave(form)} style={{ padding: "7px 16px", borderRadius: 8, border: `1px solid ${ACCENT}40`, background: ACCENT + "18", color: ACCENT, cursor: "pointer", fontSize: 12, fontWeight: 600 }}>
          {initial ? t("actions.save") : t("scalesPage.create")}
        </button>
      </div>
    </div>
  )
}

// ── ScaleListItem — компактный элемент левой колонки ──────────────────────
function ScaleListItem({ scale, isActive, isHov, onSelect, onEnter, onLeave }: {
  scale: any; isActive: boolean; isHov: boolean
  onSelect: () => void; onEnter: () => void; onLeave: () => void
}) {
  const t = useT()
  const ENTITY_TYPES = ENTITY_TYPES_DEF.map(e => ({ ...e, label: t(e.labelKey) }))
  const et = ENTITY_TYPES.find(e => e.value === scale.entity_type)
  return (
    <div
      onClick={onSelect}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      style={{
        padding: "10px 16px",
        cursor: "pointer",
        borderLeft: `3px solid ${isActive ? scale.color : "transparent"}`,
        background: isActive ? `${scale.color}0c` : isHov ? theme.bg3 : "transparent",
        borderBottom: `1px solid ${theme.ln1}`,
        transition: "background 0.1s, border-color 0.1s",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 7 }}>
        <span style={{ fontSize: 13, fontWeight: isActive ? 600 : 400, color: isActive ? theme.tx1 : theme.tx2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, minWidth: 0 }}>
          {scale.name}
        </span>
        <div style={{ display: "flex", gap: 4, flexShrink: 0, marginLeft: 8 }}>
          {scale.builtin && (
            <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 3, background: "#4A90D914", color: "#4A90D9", border: "1px solid #4A90D928" }}>{t("scalesPage.builtinBadgeShort")}</span>
          )}
          {et && (
            <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 3, background: et.color + "14", color: et.color, border: `1px solid ${et.color}28` }}>{et.label}</span>
          )}
        </div>
      </div>
      <div style={{ padding: "0 8px" }}>
        <Ruler
          variant="compact"
          name={scale.name}
          value={null}
          min={scale.min}
          max={scale.max}
          step={scale.step}
          levels={scale.levels}
          color={scale.color}
          hideLabel
        />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, padding: "0 8px", fontFamily: "'JetBrains Mono', 'Fira Code', monospace", fontVariantNumeric: "tabular-nums" }}>
        <span style={{ fontSize: 11, color: theme.tx3 }}>{scale.min}</span>
        <span style={{ fontSize: 11, color: theme.tx3 }}>{scale.max}{scale.step !== 1 ? ` · ${t("scalesPage.stepShort", { n: scale.step })}` : ""}</span>
      </div>
    </div>
  )
}

// ── ScaleDetail — правая панель, режим просмотра ──────────────────────────
function ScaleDetail({ scale, onEdit, onDelete }: { scale: any; onEdit: () => void; onDelete?: () => void }) {
  const t = useT()
  const ENTITY_TYPES = ENTITY_TYPES_DEF.map(e => ({ ...e, label: t(e.labelKey) }))
  const GROUP_BY = GROUP_BY_DEF.map(g => ({ ...g, label: t(g.key) }))
  const et = ENTITY_TYPES.find(e => e.value === scale.entity_type)

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>

      <div style={{ background: `linear-gradient(180deg, ${scale.color}08 0%, ${theme.bg1} 100%)`, flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 24px 14px", borderBottom: `1px solid ${theme.ln1}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 42, height: 42, borderRadius: 13, background: `${scale.color}18`, border: `1.5px solid ${scale.color}40`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Scale size={19} style={{ color: scale.color }} />
            </div>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <span style={{ fontSize: 16, fontWeight: 700, color: theme.tx1 }}>{scale.name}</span>
                {scale.builtin && <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 4, background: "#4A90D918", color: "#4A90D9", border: "1px solid #4A90D930", fontWeight: 600 }}>{t("scalesPage.builtinBadge")}</span>}
              </div>
              {et && <span style={{ fontSize: 10, padding: "1px 7px", borderRadius: 4, background: et.color + "14", color: et.color, border: `1px solid ${et.color}28` }}>{et.label}</span>}
            </div>
          </div>
          <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
            <button onClick={onEdit}
              style={{ fontSize: 11, padding: "5px 12px", borderRadius: 7, border: `1px solid ${scale.color}30`, background: scale.color + "0c", color: scale.color + "cc", cursor: "pointer", display: "flex", alignItems: "center", gap: 5, fontWeight: 500, transition: "all 0.15s" }}
              onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.color = scale.color; el.style.background = scale.color + "18"; el.style.borderColor = scale.color + "60" }}
              onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.color = scale.color + "cc"; el.style.background = scale.color + "0c"; el.style.borderColor = scale.color + "30" }}>
              <Pencil size={11} /> {t("actions.edit")}
            </button>
            {!scale.builtin && onDelete && (
              <button onClick={onDelete}
                style={{ padding: "5px 8px", borderRadius: 7, border: "1px solid #E74C3C28", background: "#E74C3C0a", color: "#a77f7d", cursor: "pointer", display: "flex", alignItems: "center", transition: "all 0.15s" }}
                onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.color = "#E74C3C"; el.style.background = "#E74C3C18" }}
                onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.color = "#b69492"; el.style.background = "#E74C3C0a" }}>
                <Trash2 size={11} />
              </button>
            )}
          </div>
        </div>

        <div style={{ padding: "18px 24px 26px" }}>
          {scale.description && (
            <p style={{ fontSize: 13, color: theme.tx3, lineHeight: 1.75, margin: "0 0 2px" }}>{scale.description}</p>
          )}
          <Ruler
            variant="detail"
            name={scale.name}
            value={null}
            min={scale.min}
            max={scale.max}
            step={scale.step}
            levels={scale.levels}
            color={scale.color}
          />
          {(scale.step !== 1 || (scale.group_by && scale.group_by !== "none")) && (
            <div style={{ display: "flex", gap: 10, marginTop: 2 }}>
              {scale.step !== 1 && <span style={{ fontSize: 10, color: theme.tx4 }}>{t("scalesPage.stepShort", { n: scale.step })}</span>}
              {scale.group_by && scale.group_by !== "none" && (
                <span style={{ fontSize: 10, color: theme.tx4 }}>· {GROUP_BY.find(g => g.value === scale.group_by)?.label}</span>
              )}
            </div>
          )}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>
        <RulerLevelsList levels={scale.levels ?? []} color={scale.color} currentValue={null} />
      </div>
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────
export default function ScalesPage() {
  const t = useT()
  const dt = useDynamicTranslate(collectStrings(DEFAULT_SCALES))
  const ENTITY_TYPES = ENTITY_TYPES_DEF.map(e => ({ ...e, label: t(e.labelKey) }))

  const qc = useQueryClient()
  const [selected, setSelected]       = useState<any>(null)
  const [editTarget, setEditTarget]   = useState<any>(null)
  const [filter, setFilter]           = useState("all")
  const [search, setSearch]           = useState("")
  const [hov, setHov]                 = useState<string | null>(null)

  const customQ = useQuery({ queryKey: ["scales", "custom", "all"], queryFn: () => scalesApi.listCustom() })
  const overridesQ = useQuery({ queryKey: ["scales", "builtin-overrides"], queryFn: () => scalesApi.getBuiltinOverrides() })

  // встроенные шкалы: переопределения описаний уровней с бэкенда + перевод
  // (только для builtin — see translateScale, кастомные шкалы не трогаем)
  const builtinScales = DEFAULT_SCALES.map(s => {
    const override = overridesQ.data?.[s.id]
    const withOverride = override && override.length > 0 ? { ...s, levels: override } : s
    return translateScale(withOverride, dt)
  })
  // кастомные шкалы пользователя — их текст создаёт сам пользователь, не переводим
  const customScales = (customQ.data ?? []).map((d: any) => ({
    id: `custom_${d.id}`, _defId: d.id, name: d.name, entity_type: d.entity_type,
    min: d.min_val, max: d.max_val, step: d.step, group_by: d.group_by,
    color: d.color, builtin: false, description: d.description, levels: d.levels,
  }))
  const allScales = [...builtinScales, ...customScales]

  const filtered = allScales.filter(s => {
    if (filter !== "all" && s.entity_type !== filter) return false
    if (search.trim()) {
      const q = search.toLowerCase()
      return s.name.toLowerCase().includes(q) || s.description?.toLowerCase().includes(q)
    }
    return true
  })

  const groups = ENTITY_TYPES.reduce((acc, et) => {
    const items = filtered.filter(s => s.entity_type === et.value)
    if (items.length) acc.push({ ...et, items })
    return acc
  }, [] as any[])

  const setOverrideMut = useMutation({
    mutationFn: (v: { builtinKey: string; levels: any[] }) => scalesApi.setBuiltinOverride(v.builtinKey, v.levels),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["scales", "builtin-overrides"] }),
  })
  const createMut = useMutation({
    mutationFn: (d: any) => scalesApi.createCustom(d),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["scales", "custom", "all"] }),
  })
  const updateMut = useMutation({
    mutationFn: (v: { id: number; d: any }) => scalesApi.updateCustom(v.id, v.d),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["scales", "custom", "all"] }),
  })
  const deleteMut = useMutation({
    mutationFn: (id: number) => scalesApi.deleteCustom(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["scales", "custom", "all"] }),
  })

  const handleSave = (data: any) => {
    if (editTarget && editTarget !== "new") {
      if (editTarget.builtin) {
        setOverrideMut.mutate({ builtinKey: editTarget.id, levels: data.levels })
      } else {
        updateMut.mutate({
          id: editTarget._defId,
          d: {
            name: data.name, description: data.description,
            min_val: Number(data.min), max_val: Number(data.max), step: Number(data.step),
            group_by: data.group_by, color: data.color, levels: data.levels,
          },
        })
      }
      setSelected({ ...editTarget, ...data })
    } else {
      createMut.mutate({
        entity_type: data.entity_type, name: data.name, description: data.description,
        min_val: Number(data.min), max_val: Number(data.max), step: Number(data.step),
        group_by: data.group_by, color: data.color, levels: data.levels,
      }, {
        onSuccess: (created: any) => setSelected({
          id: `custom_${created.id}`, _defId: created.id, name: created.name, entity_type: created.entity_type,
          min: created.min_val, max: created.max_val, step: created.step, group_by: created.group_by,
          color: created.color, builtin: false, description: created.description, levels: created.levels,
        }),
      })
    }
    setEditTarget(null)
  }

  const handleDelete = (scale: any) => {
    if (scale.builtin) return
    deleteMut.mutate(scale._defId)
    if (selected?.id === scale.id) setSelected(null)
  }

  const showRight = !!selected || editTarget === "new"

  const leftPanel = (
    <div style={{ background: theme.bg1, height: "100%", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={sectionSearchWrap()}>
        <Search size={13} style={{ position: "absolute", left: 22, top: "50%", transform: "translateY(-50%)", color: "#848cb0", pointerEvents: "none" }} />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder={t("scalesPage.searchPlaceholder")}
          style={sectionSearch(ACCENT)}
          onFocus={e => (e.target as HTMLInputElement).style.borderColor = `${ACCENT}40`}
          onBlur={e => (e.target as HTMLInputElement).style.borderColor = "#1e1e2a"}
        />
      </div>

      <div style={{ display: "flex", gap: 4, padding: "8px 14px", flexWrap: "wrap", borderBottom: `1px solid ${theme.ln1}` }}>
        <button onClick={() => setFilter("all")}
          style={{ fontSize: 10, padding: "3px 10px", borderRadius: 5, border: `1px solid ${filter === "all" ? ACCENT + "50" : "#1e1e2c"}`, background: filter === "all" ? ACCENT + "14" : "transparent", color: filter === "all" ? ACCENT : theme.tx4, cursor: "pointer" }}>
          {t("scalesPage.allCount", { n: allScales.length })}
        </button>
        {ENTITY_TYPES.filter(et => allScales.some(s => s.entity_type === et.value)).map(et => (
          <button key={et.value} onClick={() => setFilter(et.value)}
            style={{ fontSize: 10, padding: "3px 10px", borderRadius: 5, border: `1px solid ${filter === et.value ? et.color + "50" : "#1e1e2c"}`, background: filter === et.value ? et.color + "14" : "transparent", color: filter === et.value ? et.color : theme.tx4, cursor: "pointer" }}>
            {et.label}
          </button>
        ))}
      </div>

      <div style={{ overflowY: "auto", flex: 1, minHeight: 0 }}>
        {groups.length === 0 ? (
          <div style={{ padding: "40px 16px", textAlign: "center", color: theme.tx4, fontSize: 13 }}>
            {search ? t("scalesPage.notFound") : t("scalesPage.noScales")}
          </div>
        ) : groups.map((group: any) => (
          <div key={group.value}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 16px 6px" }}>
              <div style={{ width: 3, height: 12, borderRadius: 2, background: group.color, flexShrink: 0 }} />
              <span style={{ fontSize: 9, fontWeight: 700, color: group.color, letterSpacing: "0.1em", textTransform: "uppercase" }}>{group.label}</span>
              <span style={{ fontSize: 9, color: theme.tx4 }}>({group.items.length})</span>
            </div>
            {group.items.map((scale: any) => (
              <ScaleListItem
                key={scale.id}
                scale={scale}
                isActive={selected?.id === scale.id && !editTarget}
                isHov={hov === scale.id}
                onSelect={() => { setSelected(scale); setEditTarget(null) }}
                onEnter={() => setHov(scale.id)}
                onLeave={() => setHov(null)}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  )

  const rightPanel = editTarget ? (
    <DetailPanel accent={ACCENT} noTopBorder>
      <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 24px", borderBottom: `1px solid ${theme.ln1}`, flexShrink: 0 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: theme.tx1 }}>
            {editTarget === "new" ? t("scalesPage.newScale") : editTarget.builtin ? t("scalesPage.viewScale") : t("scalesPage.editScaleTitle")}
          </span>
          <button onClick={() => setEditTarget(null)}
            style={{ background: "none", border: "none", cursor: "pointer", color: theme.tx4, display: "flex", padding: 4, borderRadius: 6, transition: "color 0.12s" }}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = theme.tx2}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = theme.tx4}>
            <X size={15} />
          </button>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>
          <ScaleForm
            initial={editTarget !== "new" ? editTarget : undefined}
            onSave={handleSave}
            onCancel={() => setEditTarget(null)}
          />
        </div>
      </div>
    </DetailPanel>
  ) : selected ? (
    <DetailPanel accent={ACCENT} noTopBorder>
      <ScaleDetail
        scale={selected}
        onEdit={() => setEditTarget(selected)}
        onDelete={() => handleDelete(selected)}
      />
    </DetailPanel>
  ) : (
    <DetailPanelEmpty accent={ACCENT} />
  )

  return (
    <PageShell>
      <Header titleKey="page.scales.title" color={ACCENT} icon={<Scale size={16} style={{ color: ACCENT }} />}
        actions={
          <button onClick={() => { setEditTarget("new"); setSelected(null) }}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 14px", borderRadius: 8, border: `1px solid ${ACCENT}40`, background: ACCENT + "18", color: ACCENT, cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
            <Plus size={13} /> {t("scalesPage.newScale")}
          </button>
        }
      />
      <PageContent overflow="auto" noPadding>
        <div style={SPLIT_BODY_STYLE}>
        <div style={{ height: "100%" }}>
        <ResizableLayout
          accent={ACCENT}
          backLabel={t("nav.analysis.scales")}
          showRight={showRight}
          onBack={() => { setSelected(null); setEditTarget(null) }}
          left={leftPanel}
          right={rightPanel}
        />
        </div>
        </div>
      </PageContent>
    </PageShell>
  )
}
