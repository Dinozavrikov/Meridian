"use client"
import { useT } from "@/lib/i18n/useT"
import { v2 } from "@/lib/theme"

export function HomeExample({ k }: { k: string | null }) {
  const t = useT()
  if (!k) return null
  return (
    <span data-testid="home-example" style={{ display: "block", marginTop: 10, fontSize: 13, lineHeight: 1.55, color: v2.t3, overflowWrap: "anywhere" }}>
      {t(k)}
    </span>
  )
}
