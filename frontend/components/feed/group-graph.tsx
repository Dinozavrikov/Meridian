"use client"
import { lazy, Suspense, useState } from "react"
import { useT } from "@/lib/i18n/useT"
import { GRAPH_SIZE, graphModel } from "@/lib/feed-dossier"
import { plain, type FeedGroup } from "@/lib/feed-groups"
import { Modal } from "@/components/ui/modal"

// Тяжёлый граф грузится только по клику: лента его не тянет.
const LocalGraph = lazy(() => import("@/components/entities/relations-panel").then(m => ({ default: m.LocalGraphPanel })))
const GRAPH_HEIGHT = 480

/** Схема карточки: на неё смотрят, чтобы понять «сколько вокруг этой записи и чем она подкреплена».
 *  Клик (или Enter/Пробел — это настоящая кнопка) открывает полный локальный граф записи-ядра. */
export function GroupGraph({ group }: { group: FeedGroup }) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const m = graphModel(group)
  const core = group.core
  // как у ссылки «Обсуждение»: у репоста граф строится по исходной записи
  const type = (core.repost_source_type as string | undefined) ?? core.type
  const id = (core.repost_source_id as number | undefined) ?? core.entity_id
  const title = core.title || plain(core.preview).slice(0, 80)
  return (
    <>
      <button type="button" className="mf-graph-open" data-testid="group-graph-open"
        aria-label={t("feedGroups.graphOpen")} title={t("feedGroups.graphOpen")} onClick={() => setOpen(true)}
        style={{ background: "none", border: "none", padding: 0, cursor: "pointer", display: "block", color: "inherit", font: "inherit" }}>
        <svg className="mf-graph" data-testid="group-graph" viewBox={`0 0 ${GRAPH_SIZE} ${GRAPH_SIZE}`}
          width={GRAPH_SIZE} height={GRAPH_SIZE} role="img" aria-label={t("feedGroups.graphLabel", { n: group.size })}>
          <g strokeWidth={2} strokeLinecap="round" fill="none">
            {m.edges.map(e => (
              <line key={e.key} data-testid="graph-edge" x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2}
                stroke={e.stroke} strokeDasharray={e.dashed ? "3 4" : undefined} />
            ))}
          </g>
          {m.nodes.map(n => n.hollow ? (
            <g key={n.key} data-testid="graph-overflow">
              <circle cx={n.x} cy={n.y} r={n.r} fill="none" stroke={n.fill} strokeDasharray="2 2" />
              <text x={n.x} y={n.y + 3} textAnchor="middle" fontSize="8" fill="currentColor">+{m.hidden}</text>
            </g>
          ) : (
            <circle key={n.key} data-testid="graph-node" cx={n.x} cy={n.y} r={n.r} fill={n.fill} />
          ))}
          <circle cx={m.core.x} cy={m.core.y} r={17} fill="none" stroke={m.core.fill} strokeOpacity={0.3} />
          <circle data-testid="graph-core" cx={m.core.x} cy={m.core.y} r={m.core.r} fill={m.core.fill} />
        </svg>
      </button>
      {open && (
        <Modal open onClose={() => setOpen(false)} title={t("feedGroups.graphModalTitle")} size="lg">
          <Suspense fallback={<div style={{ height: GRAPH_HEIGHT }} aria-busy="true" />}>
            <LocalGraph entityType={type} entityId={id} entityTitle={title} bare height={GRAPH_HEIGHT} />
          </Suspense>
        </Modal>
      )}
    </>
  )
}
