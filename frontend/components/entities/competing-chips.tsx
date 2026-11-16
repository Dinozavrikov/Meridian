"use client"
import { useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { ChevronDown } from "lucide-react"
import { api } from "@/lib/api"
import { useT } from "@/lib/i18n/useT"
import { ink, theme } from "@/lib/theme"
import { readableOn } from "@/lib/color"
import { announceLinkChange } from "@/lib/link-undo"

export const ROLES = ["leading", "alternative", "rejected"] as const
type Role = (typeof ROLES)[number]
const ROLE_COLOR: Record<Role, string> = { leading: "#2ECC71", alternative: "#9aa1c2", rejected: "#6b7194" }
const STANCES = [
  { value: "подтверждает", key: "linkType.confirms", color: "#2ECC71" },
  { value: "опровергает", key: "linkType.refutes", color: "#E74C3C" },
  { value: "связано", key: "linkType.related", color: theme.edgeNeutral },
]
const rank = (r?: string | null) => (r === "leading" ? 0 : r === "rejected" ? 2 : 1)

/** Ведущая первой, отвергнутые внизу; порядок внутри роли сохраняется. */
export function sortByRole<T extends { role?: string | null }>(items: T[]): T[] {
  return [...items].sort((a, b) => rank(a.role) - rank(b.role))
}

/** Путь к смене роли/отношения: родитель (вопрос или задача) и гипотеза определяются по тому, кто из двоих родитель. */
export function competingPath(self: { type: string; id: number }, item: { type: string; id: number }) {
  const itemIsParent = item.type === "task" || item.type === "question"
  const parent = itemIsParent ? item : self
  const hid = itemIsParent ? self.id : item.id
  return `/api/v1/competing/${parent.type}/${parent.id}/${hid}`
}

export function CompetingSummary({ items }: { items: { role?: string | null; source?: string }[] }) {
  const t = useT()
  const competing = items.filter(i => i.source === "competing")
  if (competing.length === 0) return null
  const parts = ROLES.map(r => ({ r, n: competing.filter(i => (i.role ?? "alternative") === r).length })).filter(p => p.n > 0)
  return <span style={{ fontSize: 12, color: ink.muted }}>{parts.map(p => `${t(`relations.role.${p.r}`)} ${p.n}`).join(" · ")}</span>
}

interface ChipsProps {
  self: { type: string; id: number }
  item: { type: string; id: number; role?: string | null; stance?: string | null }
  editable: boolean
}

export function CompetingChips({ self, item, editable }: ChipsProps) {
  const t = useT()
  const qc = useQueryClient()
  const [open, setOpen] = useState<"role" | "stance" | null>(null)
  const role = (ROLES as readonly string[]).includes(item.role ?? "") ? (item.role as Role) : "alternative"
  const stance = STANCES.find(s => s.value === item.stance) ?? STANCES[2]

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["related"] })
    qc.invalidateQueries({ queryKey: ["entity-link-history"] })
    qc.invalidateQueries({ queryKey: ["competition"] })
  }
  const change = useMutation({
    mutationFn: (body: { role?: string; stance?: string }) => api.put(competingPath(self, item), body),
    onSuccess: () => {
      refresh()
      setOpen(null)
      void announceLinkChange({ entityType: self.type, entityId: self.id, kind: "change", other: item, message: t("relations.competingChanged"), onUndone: refresh })
    },
  })

  const chip = (kind: "role" | "stance", label: string, color: string, aria: string) => {
    const style = {
      display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 600, padding: "3px 10px", borderRadius: 999,
      border: `1px solid ${color}59`, background: `${color}1f`, color: readableOn(color),
    } as const
    return editable ? (
      <button type="button" aria-haspopup="menu" aria-expanded={open === kind} aria-label={aria} title={aria}
        onClick={() => setOpen(open === kind ? null : kind)} style={{ ...style, cursor: "pointer" }}>
        {label}<ChevronDown size={12} aria-hidden style={{ transform: open === kind ? "rotate(180deg)" : "none", transition: "transform 0.15s" }} />
      </button>
    ) : <span style={style}>{label}</span>
  }

  const option = (value: string, label: string, color: string, current: boolean, body: { role?: string; stance?: string }) => (
    <button key={value} type="button" role="menuitemradio" aria-checked={current} disabled={change.isPending}
      onClick={() => (current ? setOpen(null) : change.mutate(body))}
      style={{ fontSize: 12, padding: "3px 10px", borderRadius: 999, cursor: "pointer", fontWeight: current ? 600 : 400,
        border: `1px solid ${current ? color : ink.line}`, background: current ? `${color}1f` : "transparent", color: current ? readableOn(color) : ink.label }}>
      {label}
    </button>
  )

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6 }}>
        {chip("role", t(`relations.role.${role}`), ROLE_COLOR[role], t("relations.roleChange"))}
        {chip("stance", t(stance.key), stance.color, t("relations.stanceChange"))}
      </div>
      {open && (
        <div role="menu" style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {open === "role"
            ? ROLES.map(r => option(r, t(`relations.role.${r}`), ROLE_COLOR[r], r === role, { role: r }))
            : STANCES.map(s => option(s.value, t(s.key), s.color, s.value === stance.value, { stance: s.value }))}
        </div>
      )}
      {change.isError && <div role="alert" style={{ fontSize: 12, color: "#F5A623" }}>{t("relations.actionFailed")}</div>}
    </div>
  )
}
