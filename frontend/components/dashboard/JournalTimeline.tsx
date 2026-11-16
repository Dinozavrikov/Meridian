"use client"
import { v2 } from "@/lib/theme"
import { Card, Label, EmptyState } from "./primitives"
import { Eye, Lightbulb, TrendingUp, BookOpen } from "lucide-react"
import { useT } from "@/lib/i18n/useT"
import { entityHref } from "@/lib/entity-routes"
import { PreviewLink } from "@/components/entities/preview-link"

export interface ActivityItem {
  type: "observation" | "hypothesis" | "prediction"
  id: number
  title: string
  status?: string
  date: string
}

const TYPE_ICON = { observation: Eye, hypothesis: Lightbulb, prediction: TrendingUp }
const TYPE_COLOR: Record<string, string> = { observation: v2.teal, hypothesis: v2.violet, prediction: v2.amber }

export function JournalTimeline({ items }: { items: ActivityItem[] }) {
  const t = useT()
  return (
    <Card style={{ flex: 1 }}>
      {!items.length ? (
        <EmptyState
          icon={<BookOpen size={15} />}
          title={t("dashboard.journal.empty.title")}
          actionLabel={t("dashboard.journal.empty.action")}
          actionHref="/observations"
        />
      ) : (
        <div style={{ position: "relative", paddingLeft: 18 }}>
          <div style={{
            position: "absolute", left: 4, top: 4, bottom: 4, width: 1,
            background: `linear-gradient(${v2.bd2}, transparent)`,
          }} />
          {items.slice(0, 8).map((a, i) => {
            const Icon = TYPE_ICON[a.type] ?? Eye
            const color = TYPE_COLOR[a.type] ?? v2.t3
            return (
              <PreviewLink key={`${a.type}-${a.id}-${i}`} type={a.type} id={a.id} href={entityHref(a.type, a.id)} style={{ textDecoration: "none", display: "block" }}>
                <div style={{ position: "relative", paddingBottom: 16 }}>
                  <div style={{
                    position: "absolute", left: -18, top: 3, width: 9, height: 9, borderRadius: "50%",
                    background: color, border: `2px solid ${v2.surf2}`, boxShadow: `0 0 0 1px ${v2.bd2}`,
                  }} />
                  <div style={{ fontFamily: v2.fontMono, fontSize: 9.5, color: v2.t3, marginBottom: 3 }}>{a.date}</div>
                  <div style={{ fontSize: 12, color: v2.t1, lineHeight: 1.4, display: "flex", alignItems: "center", gap: 6 }}>
                    <Icon size={10} style={{ color, flexShrink: 0 }} />
                    {a.title}
                  </div>
                </div>
              </PreviewLink>
            )
          })}
        </div>
      )}
    </Card>
  )
}
