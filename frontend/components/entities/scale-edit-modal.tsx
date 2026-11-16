"use client"
import { useState } from "react"
import { Modal } from "@/components/ui/modal"
import { Ruler } from "@/components/ui/ruler"
import { Button } from "@/components/ui/button"
import { DEFAULT_SCALES, translateScale, type Scale } from "@/lib/scales"
import { useT } from "@/lib/i18n/useT"
import { useDynamicTranslate } from "@/lib/i18n/useDynamicT"
import { collectStrings } from "@/lib/i18n/collect-strings"
import { Trash2 } from "lucide-react"

interface ScaleEditModalProps {
  open: boolean
  onClose: () => void
  scales: Scale[]
  values: Record<string, any>
  onSave: (patch: Record<string, number | null>) => void
  isPending?: boolean
  lockedIds?: Set<string>
}

export function ScaleEditModal({
  open, onClose, scales, values, onSave, isPending = false, lockedIds,
}: ScaleEditModalProps) {
  const t = useT()
  const dt = useDynamicTranslate(collectStrings(DEFAULT_SCALES))
  const translatedScales = scales.map(s => translateScale(s, dt))

  const [draft, setDraft] = useState<Record<string, number | null>>(() => {
    const init: Record<string, number | null> = {}
    scales.forEach(s => { init[s.id] = values[s.id] ?? null })
    return init
  })

  const [lastOpen, setLastOpen] = useState(false)
  if (open && !lastOpen) {
    const init: Record<string, number | null> = {}
    scales.forEach(s => { init[s.id] = values[s.id] ?? null })
    setDraft(init)
    setLastOpen(true)
  }
  if (!open && lastOpen) setLastOpen(false)

  const set = (id: string, v: number | null) =>
    setDraft(prev => ({ ...prev, [id]: v }))

  const handleSave = () => {
    onSave(draft)
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title={t("scaleEditModal.title")} size="md">
      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        {translatedScales.map(scale => {
          const val = draft[scale.id]
          const isSet = val !== null && val !== undefined
          const locked = lockedIds?.has(scale.id) ?? false

          return (
            <div key={scale.id} style={{ display: "flex", flexDirection: "column", gap: 10 }}>

              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: scale.color, flexShrink: 0 }} />
                  <span style={{ fontSize: 13, fontWeight: 600, color: "#c0c0d8" }}>{scale.name}</span>
                  <span style={{ fontSize: 11, color: "#9295a5" }}>{scale.description}</span>
                </div>
                <button
                  type="button"
                  onClick={() => !locked && set(scale.id, null)}
                  title={locked ? t("scales.lockedHint") : t("scalesPage.resetValue")}
                  style={{
                    display: "flex", alignItems: "center", gap: 4,
                    padding: "4px 8px", borderRadius: 6, border: "none",
                    background: isSet && !locked ? "#2a1a1a" : "#1a1a1a",
                    color: isSet && !locked ? "#e05555" : "#9395a5",
                    fontSize: 11, cursor: isSet && !locked ? "pointer" : "default",
                    transition: "all 0.15s",
                  }}
                >
                  <Trash2 size={11} />
                  {t("scalesPage.reset")}
                </button>
              </div>

              <div style={{
                background: "#111", border: "1px solid #1e1e2c",
                borderRadius: 10, padding: "14px 16px", opacity: locked ? 0.6 : 1,
              }}>
                <Ruler
                  name={scale.name}
                  value={isSet ? val : scale.min}
                  min={scale.min}
                  max={scale.max}
                  step={scale.step}
                  color={isSet && !locked ? scale.color : "#2a2a40"}
                  levels={scale.levels}
                  size="lg"
                  showLabel
                  onChange={locked ? undefined : (v => set(scale.id, v))}
                />
                {locked && (
                  <div style={{ fontSize: 10, color: "#9295a5", marginTop: 6 }}>{t("scales.lockedHint")}</div>
                )}
              </div>

              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontSize: 10, color: "#9295a5" }}>
                  {scale.levels?.[0]?.label ?? scale.min}
                </span>
                <span style={{ fontSize: 10, color: "#9295a5" }}>
                  {scale.levels?.[scale.levels.length - 1]?.label ?? scale.max}
                </span>
              </div>
            </div>
          )
        })}

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", paddingTop: 8, borderTop: "1px solid #1e1e2c" }}>
          <Button variant="ghost" onClick={onClose}>{t("actions.cancel")}</Button>
          <Button variant="primary" onClick={handleSave} disabled={isPending}>
            {isPending ? t("settings.saving") : t("actions.save")}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
