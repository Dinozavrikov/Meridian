"use client"
import { CheckCircle, Pencil, Plus, XCircle } from "lucide-react"
import { useT } from "@/lib/i18n/useT"
import { useElementSize } from "@/lib/use-element-size"
import { ActionButton } from "@/components/ui/action-button"
import { EntityCallout } from "@/components/entities/entity-callout"
import { renderableHtml } from "@/lib/render-safe-html"
import { RichHtml } from "@/components/entities/rich-html"
import { ink } from "@/lib/theme"
import { readableOn } from "@/lib/color"

const WIDE_MIN = 560
const GREEN = "#2ECC71"
const RED = "#E74C3C"

/** Пустой ли HTML из редактора: пусто и «», и «<p></p>», и «<p><br></p>». Картинка без текста — не пусто. */
export function isBlankHtml(html: string | null | undefined): boolean {
  if (!html) return true
  if (/<img\b/i.test(html)) return false
  return html.replace(/<[^>]*>|&nbsp;/g, "").trim() === ""
}

export interface EvidencePanelsProps {
  /** HTML поля как есть: очистка делается здесь, в месте вставки */
  confirmingHtml?: string | null
  refutingHtml?: string | null
  accent: string
  canEdit?: boolean
  /** открыть форму правки: действие в шапках карточек рисуется, только если она есть и canEdit */
  onEdit?: () => void
}

function EvidenceAction({ filled, onClick }: { filled: boolean; onClick: () => void }) {
  const t = useT()
  return (
    <ActionButton size="sm" icon={filled ? <Pencil size={14} /> : <Plus size={14} />} onClick={onClick}>
      {t(filled ? "evidencePanel.edit" : "evidencePanel.add")}
    </ActionButton>
  )
}

function EvidenceBody({ html, nudge }: { html?: string | null; nudge?: string }) {
  const t = useT()
  if (!isBlankHtml(html)) return <RichHtml html={renderableHtml(html as string)} accent="#4A90D9" />
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <span style={{ color: ink.muted }}>{t("evidencePanel.empty")}</span>
      {nudge && <span style={{ fontSize: 13, lineHeight: 1.5, color: ink.muted }}>{nudge}</span>}
    </div>
  )
}

/** «Основания» убеждения: что подтверждает и что опровергает. Две карточки рядом, на узком блоке друг под другом. */
export function EvidencePanels({ confirmingHtml, refutingHtml, accent, canEdit = false, onEdit }: EvidencePanelsProps) {
  const t = useT()
  const [ref, size] = useElementSize<HTMLElement>()
  const wide = size.width >= WIDE_MIN
  const editable = canEdit && !!onEdit
  const confirmingFilled = !isBlankHtml(confirmingHtml)
  const refutingFilled = !isBlankHtml(refutingHtml)
  const nudge = editable && confirmingFilled && !refutingFilled ? t("evidencePanel.refutingNudge") : undefined
  return (
    <section ref={ref} aria-label={t("evidencePanel.title")} style={{ minWidth: 0 }}>
      <h3 style={{ margin: 0, fontSize: 12, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: readableOn(accent) }}>
        {t("evidencePanel.title")}
      </h3>
      <p style={{ margin: "4px 0 12px", fontSize: 13, lineHeight: 1.5, color: ink.muted }}>{t("evidencePanel.hint")}</p>
      <div data-testid="evidence-body" data-wide={String(wide)} style={{ display: "grid", gap: 12, alignItems: "stretch", gridTemplateColumns: wide ? "repeat(2, minmax(0, 1fr))" : "minmax(0, 1fr)" }}>
        <EntityCallout tone={GREEN} icon={<CheckCircle size={15} />} title={t("evidencePanel.confirming")}
          action={editable ? <EvidenceAction filled={confirmingFilled} onClick={onEdit!} /> : undefined}>
          <EvidenceBody html={confirmingHtml} />
        </EntityCallout>
        <EntityCallout tone={RED} icon={<XCircle size={15} />} title={t("evidencePanel.refuting")}
          action={editable ? <EvidenceAction filled={refutingFilled} onClick={onEdit!} /> : undefined}>
          <EvidenceBody html={refutingHtml} nudge={nudge} />
        </EntityCallout>
      </div>
    </section>
  )
}
