"use client"
import { useState } from "react"
import { Plus, Check, ChevronDown, ChevronRight, Link2 } from "lucide-react"
import Link from "next/link"
import { useT } from "@/lib/i18n/useT"
import { LinkExistingModal } from "@/components/entities/link-existing-modal"
import { QuickAddTaskModal } from "@/components/entities/quick-add-task-modal"
import { StatusBadge } from "@/components/ui/status-badge"
import { useIsMobile } from "@/components/layout/resizable-layout"
import { useStore } from "@/lib/store"
import { useTranslatedRelated } from "@/lib/i18n/use-translated-query"
import { useRemoveLinkWithUndo } from "@/lib/use-remove-link"
import { theme } from "@/lib/theme"

// Статусы задачи те же, что на странице задач (tasks/page.tsx): открыта, исследуется, приостановлена, решена, закрыта.
// Закрытие задачи (с ожиданием) делается на её странице, здесь статус только показывается.
const DONE = ["решена", "закрыта"]
const IN_PROGRESS = ["исследуется"]

function useStatusGroups() {
  const t = useT()
  return [
    { id: "in_progress", label: t("tasksTab.status.inProgress"), color: "#4A90D9", has: (s: string) => IN_PROGRESS.includes(s) },
    { id: "todo",        label: t("tasksTab.status.todo"),       color: "#9696aa", has: (s: string) => !IN_PROGRESS.includes(s) && !DONE.includes(s) },
    { id: "done",        label: t("tasksTab.status.done"),       color: "#2ECC71", has: (s: string) => DONE.includes(s) },
  ]
}

function TaskRow({ task, onRemove, removeLabel }: { task: any; onRemove: () => void; removeLabel: string }) {
  const [hov, setHov] = useState(false)
  const isMobile = useIsMobile()
  const done = DONE.includes(task.status)
  return (
    <div onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 8, background: hov ? "#0f0f1a" : "transparent", transition: "background 0.1s", borderLeft: `2px solid ${done ? "#2ECC7140" : "#4A90D940"}` }}>
      <div aria-hidden style={{ flexShrink: 0, width: 16, height: 16, borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center",
        border: `1px solid ${done ? "#2ECC7160" : "#4A90D960"}`, background: done ? "#2ECC7130" : "#4A90D910" }}>
        {done && <Check size={10} style={{ color: "#2ECC71" }} />}
      </div>
      <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 13, color: done ? "#9696a8" : "#c0c0d8", textDecoration: done ? "line-through" : "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {task.title}
        </span>
        <StatusBadge status={task.status} fontSize={12} />
      </div>
      <div style={{ display: "flex", gap: 4, opacity: (isMobile || hov) ? 1 : 0, transition: "opacity 0.12s" }}>
        <Link href={`/tasks?id=${task.id}&tab=detail`} style={{ fontSize: 12, color: "#9696a7", padding: "2px 6px", borderRadius: 4, border: "1px solid #1e1e2e", textDecoration: "none" }}>↗</Link>
        <button type="button" onClick={onRemove} aria-label={removeLabel} title={removeLabel}
          style={{ fontSize: 12, color: "#9696a7", padding: "2px 6px", borderRadius: 4, border: "1px solid #1e1e2e", background: "none", cursor: "pointer" }}>
          ×
        </button>
      </div>
    </div>
  )
}

export function TasksTab({ entityType, entityId, entityName }: { entityType: string; entityId: number; entityName?: string }) {
  const t = useT()
  const user = useStore(s => s.user)
  const GROUPS = useStatusGroups()
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({ done: true })
  const [showLinkModal, setShowLinkModal] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)

  const { data, isLoading } = useTranslatedRelated(entityType, entityId)
  const removeLink = useRemoveLinkWithUndo(entityType, entityId)

  const tasks: any[] = data?.related?.task ?? []
  const total = tasks.length
  const done = tasks.filter(x => DONE.includes(x.status)).length
  const groups = GROUPS.map(g => ({ ...g, items: tasks.filter(x => g.has(x.status)) }))

  if (isLoading) return <div style={{ padding: "24px 0", textAlign: "center", color: "#9696a6", fontSize: 12 }}>{t("tasksTab.loading")}</div>

  const dashed = { display: "flex", alignItems: "center", gap: 6, padding: "8px 12px", borderRadius: 8, border: "1px dashed #1e1e2e", background: "transparent", color: "#9696a7", cursor: "pointer", fontSize: 12 } as const

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0, paddingBottom: 32 }}>
      {total > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <span style={{ fontSize: 12, color: "#9696a7", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em" }}>{t("tasksTab.progress")}</span>
            <span style={{ fontSize: 12, color: done === total ? "#2ECC71" : "#9898ac" }}>{done} / {total}</span>
          </div>
          <div style={{ height: 4, background: "#1e1e2e", borderRadius: 4, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${total ? (done / total) * 100 : 0}%`, background: done === total ? "#2ECC71" : "#4A90D9", borderRadius: 4, transition: "width 0.3s" }} />
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
        <div style={{ flex: 1, marginBottom: 16 }}>
          {user ? (
            <button type="button" onClick={() => setCreateOpen(true)} style={{ ...dashed, width: "100%" }}><Plus size={12} /> {t("tasksTab.quickAdd")}</button>
          ) : (
            <div style={{ fontSize: 12, color: "#9295a5", padding: "8px 0" }}>{t("ownership.addLoginRequired")}</div>
          )}
        </div>
        {user && (
          <button type="button" onClick={() => setShowLinkModal(true)} style={{ ...dashed, whiteSpace: "nowrap" }}><Link2 size={12} /> {t("tasksTab.linkExisting")}</button>
        )}
      </div>

      {total === 0 && (
        <div style={{ textAlign: "center", padding: "32px 0", color: "#9999a2" }}>
          <p style={{ fontSize: 13 }}>{t("tasksTab.empty.title")}</p>
          <p style={{ fontSize: 12, marginTop: 4, color: "#96969e" }}>{t("tasksTab.empty.subtitle")}</p>
        </div>
      )}

      {groups.map(group => {
        if (group.items.length === 0) return null
        const isCollapsed = collapsed[group.id]
        return (
          <div key={group.id} style={{ marginBottom: 12 }}>
            <button type="button" onClick={() => setCollapsed(p => ({ ...p, [group.id]: !p[group.id] }))}
              style={{ display: "flex", alignItems: "center", gap: 6, width: "100%", background: "none", border: "none", cursor: "pointer", padding: "4px 0", marginBottom: 4 }}>
              {isCollapsed ? <ChevronRight size={12} style={{ color: "#9696a7" }} /> : <ChevronDown size={12} style={{ color: "#9696a7" }} />}
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: group.color }} />
              <span style={{ fontSize: 12, fontWeight: 700, color: group.color + "cc", letterSpacing: "0.08em", textTransform: "uppercase" }}>{group.label}</span>
              <span style={{ fontSize: 12, color: "#9696a6" }}>({group.items.length})</span>
            </button>
            {!isCollapsed && (
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                {group.items.map(task => (
                  <TaskRow key={task.id} task={task} removeLabel={t("relations.remove")}
                    onRemove={() => removeLink.mutate({ toType: "task", toId: task.id })} />
                ))}
              </div>
            )}
          </div>
        )
      })}

      {user && <QuickAddTaskModal open={createOpen} onClose={() => setCreateOpen(false)} targetType={entityType} targetId={entityId} targetLabel={entityName ?? ""} />}
      {showLinkModal && (
        <LinkExistingModal entityType={entityType} entityId={entityId} onlyType="task"
          linkTypes={[{ value: "связано", label: t("linkType.related"), color: theme.edgeNeutral }]}
          defaultLinkType="связано" onClose={() => setShowLinkModal(false)} />
      )}
    </div>
  )
}
