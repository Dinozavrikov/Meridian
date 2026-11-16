"use client"
import { LayoutGrid, List } from "lucide-react"
import { useT } from "@/lib/i18n/useT"
import type { FeedViewMode } from "@/lib/feed-view-mode"

export function FeedViewToggle({ mode, onChange }: { mode: FeedViewMode; onChange: (m: FeedViewMode) => void }) {
  const t = useT()
  return (
    <div className="mfl-toggle" role="group" aria-label={t("feedList.viewLabel")} data-testid="feed-view-toggle">
      <button type="button" aria-pressed={mode === "cards"} data-testid="feed-view-cards" onClick={() => onChange("cards")}>
        <LayoutGrid size={13} aria-hidden="true" />{t("feedList.viewCards")}
      </button>
      <button type="button" aria-pressed={mode === "list"} data-testid="feed-view-list" onClick={() => onChange("list")}>
        <List size={13} aria-hidden="true" />{t("feedList.viewList")}
      </button>
    </div>
  )
}
