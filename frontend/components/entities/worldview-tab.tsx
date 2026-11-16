"use client"
import { useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { api } from "@/lib/api"
import { Plus, Zap, X, ExternalLink } from "lucide-react"
import Link from "next/link"
import { Ruler } from "@/components/ui/ruler"
import { DEFAULT_SCALES } from "@/lib/scales"
import { influenceOptions } from "@/lib/worldview-influence"
import { announceLinkChange } from "@/lib/link-undo"
import { AddRelatedButton } from "@/components/entities/add-related-button"
import { LinkExistingModal } from "@/components/entities/link-existing-modal"
import { QuickAddWorldviewModal } from "@/components/entities/quick-add-worldview-modal"
import { useIsMobile } from "@/components/layout/resizable-layout"
import { useT } from "@/lib/i18n/useT"
import { useStore } from "@/lib/store"
import { useTranslatedRelated } from "@/lib/i18n/use-translated-query"

const CONFIDENCE_SCALE = DEFAULT_SCALES.find(s => s.id === "confidence")!

function WorldviewCard({ item, onRemove, onUpdateInfluence }: {
  item: any
  onRemove: () => void
  onUpdateInfluence: (v: string) => void
}) {
  const [hov, setHov] = useState(false)
  const t = useT()
  const isMobile = useIsMobile()
  const INFLUENCE = influenceOptions(t)
  const influence = INFLUENCE.find(i => i.value === (item.link_type ?? "strengthens")) ?? INFLUENCE[0]
  const needsAttention = influence.pulse

  return (
    <div onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{
        background: "#0a0a14", border: `1px solid ${hov ? influence.color + "40" : "#18182a"}`,
        borderLeft: `3px solid ${influence.color}`,
        borderRadius: 10, padding: "12px 14px",
        transition: "all 0.15s", position: "relative",
      }}>

      {/* пульс для напряжённых */}
      {needsAttention && (
        <div style={{ position: "absolute", top: 10, right: 10, display: "flex", alignItems: "center", gap: 4 }}>
          <Zap size={10} style={{ color: influence.color }} />
        </div>
      )}

      {/* тип влияния */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: influence.color, letterSpacing: "0.08em", textTransform: "uppercase", padding: "2px 6px", borderRadius: 4, background: influence.color + "18", border: `1px solid ${influence.color}30` }}>
          {influence.label}
        </span>
        <span style={{ fontSize: 12, color: "#9696a6" }}>{influence.desc}</span>
      </div>

      {/* текст убеждения */}
      <Link href={`/worldview?id=${item.id}&tab=detail`} style={{ textDecoration: "none" }}>
        <p style={{ fontSize: 13, color: hov ? "#e0e0f0" : "#a0a0c8", lineHeight: 1.6, margin: "0 0 10px", transition: "color 0.12s" }}>
          {item.title}
        </p>
      </Link>

      {/* шкала уверенности */}
      {item.confidence != null && (
        <div style={{ marginBottom: 10 }}>
          <Ruler
            name={CONFIDENCE_SCALE.name}
            value={item.confidence ?? 3}
            min={CONFIDENCE_SCALE.min}
            max={CONFIDENCE_SCALE.max}
            color={influence.color}
            levels={CONFIDENCE_SCALE.levels}
          />
        </div>
      )}

      {/* переключатель типа влияния */}
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
        {INFLUENCE.map(inf => (
          <button key={inf.value} onClick={() => onUpdateInfluence(inf.value)}
            style={{
              fontSize: 12, padding: "2px 7px", borderRadius: 4, cursor: "pointer",
              border: `1px solid ${inf.value === influence.value ? inf.color + "60" : "#1a1a28"}`,
              background: inf.value === influence.value ? inf.color + "18" : "transparent",
              color: inf.value === influence.value ? inf.color : "#9898a8",
              transition: "all 0.1s",
            }}>
            {inf.label}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <div style={{ display: "flex", gap: 3, opacity: (isMobile || hov) ? 1 : 0, transition: "opacity 0.12s" }}>
          <Link href={`/worldview?id=${item.id}&tab=detail`}
            style={{ fontSize: 12, color: "#9696a7", padding: "2px 5px", borderRadius: 4, border: "1px solid #1e1e2e", display: "flex", alignItems: "center", textDecoration: "none" }}
            onMouseEnter={e => (e.currentTarget.style.color = "#9090c0")}
            onMouseLeave={e => (e.currentTarget.style.color = "#9696a8")}>
            <ExternalLink size={9} />
          </Link>
          <button onClick={onRemove} aria-label={t("relations.remove")} title={t("relations.remove")}
            style={{ fontSize: 12, color: "#9696a7", padding: "2px 5px", borderRadius: 4, border: "1px solid #1e1e2e", background: "none", cursor: "pointer", display: "flex", alignItems: "center" }}
            onMouseEnter={e => (e.currentTarget.style.color = "#E74C3C")}
            onMouseLeave={e => (e.currentTarget.style.color = "#9696a8")}>
            <X size={9} />
          </button>
        </div>
      </div>
    </div>
  )
}

export function WorldviewTab({ entityType, entityId, entityName }: { entityType: string; entityId: number; entityName?: string }) {
  const t = useT()
  const user = useStore(s => s.user)
  const qc = useQueryClient()
  const [showModal, setShowModal] = useState(false)
  const [quickCreateOpen, setQuickCreateOpen] = useState(false)

  const { data, isLoading } = useTranslatedRelated(entityType, entityId)

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["related", entityType, entityId] })
    qc.invalidateQueries({ queryKey: ["entity-link-history"] })
  }
  const target = (toId: number) => `from_type=${entityType}&from_id=${entityId}&to_type=worldview&to_id=${toId}`

  // «Вернуть» живёт в общем хосте уведомлений; откат платформенный (событие истории связей)
  const removeLink = useMutation({
    mutationFn: async (toId: number) => {
      await api.delete(`/api/v1/graph/links?${target(toId)}`)
      return { toId }
    },
    onSuccess: r => {
      refresh()
      void announceLinkChange({ entityType, entityId, kind: "remove", other: { type: "worldview", id: r.toId }, message: t("relations.removed"), tone: "info", onUndone: refresh })
    },
  })

  // Смена влияния: один PUT (событие link_type_changed). Прежнее «удалить, потом создать» давало два события,
  // и откат последнего терял связь.
  const updateInfluence = useMutation({
    mutationFn: async ({ toId, linkType }: { toId: number; linkType: string }) => {
      await api.put(`/api/v1/graph/links?${target(toId)}&link_type=${encodeURIComponent(linkType)}`)
      return { toId }
    },
    onSuccess: r => {
      refresh()
      void announceLinkChange({ entityType, entityId, kind: "change", other: { type: "worldview", id: r.toId }, message: t("relations.typeChanged"), onUndone: refresh })
    },
  })

  const all: any[] = data?.related?.worldview ?? []

  // Сортируем: сначала требующие внимания
  const sorted = [...all].sort((a, b) => {
    const priority = (v: string) => v === "contradicts" ? 0 : v === "challenges" ? 1 : v === "transforms" ? 2 : 3
    return priority(a.link_type) - priority(b.link_type)
  })

  const attention = sorted.filter(i => ["contradicts","challenges"].includes(i.link_type))
  const rest = sorted.filter(i => !["contradicts","challenges"].includes(i.link_type))

  if (isLoading) return <div style={{ padding: "24px 0", textAlign: "center", color: "#9696a6", fontSize: 12 }}>Загрузка…</div>

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, paddingBottom: 32 }}>

      {/* шапка */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        {attention.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 10px", borderRadius: 6, background: "#E74C3C10", border: "1px solid #E74C3C30" }}>
            <Zap size={11} style={{ color: "#E74C3C" }} />
            <span style={{ fontSize: 12, color: "#E74C3C", fontWeight: 600 }}>{attention.length} требуют внимания</span>
          </div>
        )}
        {attention.length === 0 && <div />}
        <AddRelatedButton
          triggerLabel={t("actions.addWorldview")}
          createLabel={t("actions.addWorldview")}
          linkLabel={t("relations.addWorldview")}
          onCreateSelect={() => setQuickCreateOpen(true)}
          onLinkSelect={() => setShowModal(true)}
          isGuest={!user}
        />
      </div>

      {all.length === 0 && (
        <div style={{ textAlign: "center", padding: "32px 0", color: "#9999a2" }}>
          <p style={{ fontSize: 13 }}>Убеждения не связаны</p>
          <p style={{ fontSize: 12, marginTop: 4, color: "#96969e" }}>Добавьте убеждения, на которые влияет эта гипотеза</p>
        </div>
      )}

      {/* требуют внимания — вверху */}
      {attention.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: "#E74C3Caa", letterSpacing: "0.1em", textTransform: "uppercase" }}>⚡ Требуют внимания</span>
          {attention.map(item => (
            <WorldviewCard key={item.id} item={item}
              onRemove={() => removeLink.mutate(item.id)}
              onUpdateInfluence={v => updateInfluence.mutate({ toId: item.id, linkType: v })}
            />
          ))}
        </div>
      )}

      {/* остальные */}
      {rest.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {attention.length > 0 && <span style={{ fontSize: 12, fontWeight: 700, color: "#2ECC71aa", letterSpacing: "0.1em", textTransform: "uppercase" }}>✓ Согласуются</span>}
          {rest.map(item => (
            <WorldviewCard key={item.id} item={item}
              onRemove={() => removeLink.mutate(item.id)}
              onUpdateInfluence={v => updateInfluence.mutate({ toId: item.id, linkType: v })}
            />
          ))}
        </div>
      )}

      {showModal && (
        <LinkExistingModal
          entityType={entityType}
          entityId={entityId}
          onlyType="worldview"
          linkTypes={influenceOptions(t)}
          defaultLinkType="strengthens"
          onClose={() => setShowModal(false)}
        />
      )}
      {entityName && (
        <QuickAddWorldviewModal
          open={quickCreateOpen}
          onClose={() => setQuickCreateOpen(false)}
          targetType={entityType}
          targetId={entityId}
          targetLabel={entityName}
          onCreated={() => qc.invalidateQueries({ queryKey: ["related", entityType, entityId] })}
        />
      )}
    </div>
  )
}
