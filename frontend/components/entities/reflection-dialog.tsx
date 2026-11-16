"use client"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input, Textarea } from "@/components/ui/input"
import { Plus, Trash2, ArrowUp, ArrowDown } from "lucide-react"
import { useT } from "@/lib/i18n/useT"

export interface ReflectionFactorInput {
  factor: string
  weight: number
  direction: "for" | "against"
}

interface ReflectionDialogProps {
  stage: "creation" | "resolution"
  onSubmit: (factors: ReflectionFactorInput[], rawText: string) => void
  onSkip: () => void
  isPending?: boolean
  /** Необязательный оверрайд подписи направления факторов поверх i18n —
   *  по умолчанию берутся из t("reflectionDialog.for"/"against") (прогнозы),
   *  для Worldview передаются явные строки "Подтверждает"/"Опровергает". */
  forLabel?: string
  againstLabel?: string
}

export function ReflectionDialog({ stage, onSubmit, onSkip, isPending, forLabel, againstLabel }: ReflectionDialogProps) {
  const t = useT()
  const [factors, setFactors] = useState<ReflectionFactorInput[]>([
    { factor: "", weight: 0.5, direction: "for" },
  ])
  const [rawText, setRawText] = useState("")

  const title = stage === "creation"
    ? t("reflectionDialog.title.creation")
    : t("reflectionDialog.title.resolution")

  const hint = stage === "creation"
    ? t("reflectionDialog.hint.creation")
    : t("reflectionDialog.hint.resolution")

  const updateFactor = (i: number, patch: Partial<ReflectionFactorInput>) => {
    setFactors(fs => fs.map((f, idx) => idx === i ? { ...f, ...patch } : f))
  }
  const addFactor = () => setFactors(fs => [...fs, { factor: "", weight: 0.5, direction: "for" }])
  const removeFactor = (i: number) => setFactors(fs => fs.filter((_, idx) => idx !== i))

  const canSubmit = factors.some(f => f.factor.trim().length > 0)

  const handleSubmit = () => {
    const cleaned = factors.filter(f => f.factor.trim().length > 0)
    onSubmit(cleaned, rawText)
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div>
        <div style={{ fontSize: 14, fontWeight: 600, color: "#e0e0e0", marginBottom: 4 }}>{title}</div>
        <div style={{ fontSize: 12, color: "#9999ad", lineHeight: 1.5 }}>{hint}</div>
      </div>

      <div>
        <div style={{ fontSize: 11, color: "#9696aa", marginBottom: 8 }}>{t("reflectionDialog.freeTextLabel")}</div>
        <Textarea
          value={rawText}
          onChange={e => setRawText(e.target.value)}
          rows={2}
          placeholder={t("reflectionDialog.freeTextPlaceholder")}
        />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ fontSize: 11, color: "#9696aa" }}>
          {t("reflectionDialog.factorsHint")}
        </div>
        {factors.map((f, i) => (
          <div key={i} style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <Input
              value={f.factor}
              onChange={e => updateFactor(i, { factor: e.target.value })}
              placeholder={t("reflectionDialog.factorPlaceholder")}
              className="flex-1"
            />
            <button
              type="button"
              onClick={() => updateFactor(i, { direction: f.direction === "for" ? "against" : "for" })}
              title={f.direction === "for" ? t("reflectionDialog.forHint") : t("reflectionDialog.againstHint")}
              style={{
                minWidth: 56, height: 32, padding: "0 10px", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
                border: `1px solid ${f.direction === "for" ? "#27AE6070" : "#E74C3C70"}`,
                background: f.direction === "for" ? "#27AE6018" : "#E74C3C18",
                color: f.direction === "for" ? "#27AE60" : "#E74C3C",
                flexShrink: 0,
                whiteSpace: "nowrap",
              }}
            >
              {f.direction === "for" ? <ArrowUp size={14} /> : <ArrowDown size={14} />}
              <span style={{ fontSize: 10, fontWeight: 600, whiteSpace: "nowrap" }}>{f.direction === "for" ? (forLabel ?? t("reflectionDialog.for")) : (againstLabel ?? t("reflectionDialog.against"))}</span>
            </button>
            <input
              type="range" min={0} max={1} step={0.1}
              value={f.weight}
              onChange={e => updateFactor(i, { weight: Number(e.target.value) })}
              style={{ width: 70, flexShrink: 0 }}
              title={t("reflectionDialog.weightTitle", { n: f.weight })}
            />
            <button
              type="button"
              onClick={() => removeFactor(i)}
              disabled={factors.length === 1}
              style={{ width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", color: "#9999a9", flexShrink: 0, opacity: factors.length === 1 ? 0.3 : 1 }}
            >
              <Trash2 size={13} />
            </button>
          </div>
        ))}
        <Button variant="ghost" size="sm" onClick={addFactor} className="self-start">
          <Plus size={13} /> {t("reflectionDialog.addFactor")}
        </Button>
      </div>

      <div style={{ display: "flex", gap: 8, justifyContent: "space-between", alignItems: "center", paddingTop: 12, borderTop: "1px solid #1e1e2c" }}>
        <button
          type="button"
          onClick={onSkip}
          style={{ fontSize: 11, color: "#9696aa", textDecoration: "underline", background: "none", border: "none", cursor: "pointer" }}
        >
          {t("reflectionDialog.skip")}
        </button>
        <Button variant="primary" onClick={handleSubmit} disabled={!canSubmit || isPending}>
          {isPending ? t("reflectionDialog.saving") : t("actions.save")}
        </Button>
      </div>
    </div>
  )
}
