"use client"
// Диалог «Кто увидит эту запись?» (см. lib/consent.ts). Монтируется один раз в app/(app)/layout.tsx; рисует ActionDialog.
import { useEffect, useRef, useState } from "react"
import { Globe, Lock, Users, type LucideIcon } from "lucide-react"
import { ActionDialog, type DialogChoice } from "@/components/ui/action-dialog"
import { v2 } from "@/lib/theme"
import { useT } from "@/lib/i18n/useT"
import { setConsentHandler, type ConsentImpact, type ShareChoice } from "@/lib/consent"

const ORDER: ShareChoice[] = ["me", "lab", "public"]
const ICON: Record<ShareChoice, LucideIcon> = { me: Lock, lab: Users, public: Globe }
const LABEL: Record<ShareChoice, string> = { me: "consent.option.me", lab: "consent.option.lab", public: "consent.option.public" }
const DESC: Record<ShareChoice, string> = { me: "consent.option.me.desc", lab: "consent.option.lab.desc", public: "consent.option.public.desc" }

const badge = (text: string, color: string) => (
  <span style={{ fontSize: 11, padding: "1px 7px", borderRadius: 999, border: `1px solid ${color}66`, color }}>{text}</span>
)

export function ConsentDialog() {
  const t = useT()
  const [impacts, setImpacts] = useState<ConsentImpact[] | null>(null)
  const resolveRef = useRef<((c: ShareChoice | null) => void) | null>(null)
  const queueRef = useRef<Promise<unknown>>(Promise.resolve())

  useEffect(() => {
    setConsentHandler(list => {
      // параллельные запросы показываем по одному
      const run = () => new Promise<ShareChoice | null>(resolve => { resolveRef.current = resolve; setImpacts(list) })
      const p = queueRef.current.then(run)
      queueRef.current = p
      return p
    })
    return () => { setConsentHandler(null); resolveRef.current?.(null); resolveRef.current = null }
  }, [])

  const answer = (c: ShareChoice | null) => {
    resolveRef.current?.(c)
    resolveRef.current = null
    setImpacts(null)
  }

  const list = impacts ?? []
  const openJoin = list.some(i => i.open_join)
  const choices: DialogChoice[] = ORDER.filter(o => list.every(i => (i.options ?? []).includes(o))).map(o => ({
    key: o, label: t(LABEL[o]), description: t(DESC[o]), icon: ICON[o],
    tone: o === "public" || (o === "lab" && openJoin) ? "warn" : "default",
    note: o === "lab" && openJoin ? t("consent.openJoin") : undefined,
  }))

  const summary = (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {list.map((i, k) => (
        <div key={k} style={{ padding: "10px 12px", borderRadius: 10, background: v2.surf, border: `1px solid ${v2.bd}` }}>
          <div style={{ color: v2.t1, fontSize: 13.5, fontWeight: 600 }}>{i.title}</div>
          <div style={{ color: v2.t3, fontSize: 12, marginTop: 2 }}>{t("consent.row", { via: i.via_title, lab: i.lab_name, n: i.members })}</div>
          {(i.lab_is_public || i.open_join) && (
            <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
              {i.lab_is_public && badge(t("consent.badge.public"), v2.teal)}
              {i.open_join && badge(t("consent.badge.openJoin"), v2.amber)}
            </div>
          )}
        </div>
      ))}
    </div>
  )

  return (
    <ActionDialog open={impacts !== null} title={t("consent.title")} summary={summary} choices={choices}
      onChoose={k => answer(k as ShareChoice)} onClose={() => answer(null)} cancelLabel={t("actions.cancel")}
      footnote={<><div>{t("consent.noSignal")}</div><div>{t("consent.irreversible")}</div></>} />
  )
}
