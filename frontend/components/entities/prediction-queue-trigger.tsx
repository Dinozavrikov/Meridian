"use client"
import { useState } from "react"
import { Modal } from "@/components/ui/modal"
import { PredictionQueue, type QueueItem } from "./prediction-queue"
import { getUrgency } from "@/lib/prediction-urgency"
import { Bell, ChevronRight } from "lucide-react"
import { useT } from "@/lib/i18n/useT"

interface PredictionQueueTriggerProps {
  items: QueueItem[]
  invalidateKeys?: any[][]
}

/**
 * Компактный триггер очереди проверки для дашборда — банер + счётчик вместо
 * встроенного списка неограниченной высоты (тот ломал верстку, наезжая на
 * PracticeInstrument). Клик открывает ту же Modal + PredictionQueue,
 * что и колокольчик на /predictions — единая точка входа, один источник кода.
 */
export function PredictionQueueTrigger({ items, invalidateKeys }: PredictionQueueTriggerProps) {
  const t = useT()
  const [open, setOpen] = useState(false)

  const overdue = items.filter(p => getUrgency({ status: p.status ?? "не проверен", expected_check_date: p.expected_check_date }) === "overdue").length
  const soon = items.filter(p => getUrgency({ status: p.status ?? "не проверен", expected_check_date: p.expected_check_date }) === "soon").length
  const total = overdue + soon

  if (total === 0) return null

  const accent = overdue > 0 ? "#E74C3C" : "#F5A623"

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        style={{
          display: "flex", alignItems: "center", gap: 12, width: "100%",
          padding: "14px 18px", borderRadius: 12, cursor: "pointer",
          border: `1px solid ${accent}40`,
          background: `linear-gradient(90deg, ${accent}14, transparent 70%)`,
          textAlign: "left", transition: "border-color 0.15s",
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = `${accent}70` }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = `${accent}40` }}
      >
        <div style={{
          width: 34, height: 34, borderRadius: 9, background: `${accent}18`,
          display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
        }}>
          <Bell size={16} style={{ color: accent }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#f2efe9" }}>
            {overdue > 0
              ? t(overdue === 1 ? "queue.overdue.one" : "queue.overdue.many", { n: overdue })
              : t("queue.soon", { n: soon })}
          </div>
          <div style={{ fontSize: 11, color: "rgba(242,239,233,0.45)", marginTop: 2 }}>
            {overdue > 0 && soon > 0 ? t("queue.andMoreSoon", { n: soon }) : t("queue.clickToSort")}
          </div>
        </div>
        <ChevronRight size={16} style={{ color: `${accent}90`, flexShrink: 0 }} />
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title={t("queue.modal.title")} size="xl">
        <PredictionQueue items={items} invalidateKeys={invalidateKeys} showHeader={false} bordered={false} onNavigate={() => setOpen(false)} />
      </Modal>
    </>
  )
}
