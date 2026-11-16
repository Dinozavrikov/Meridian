"use client"
import { useState, useEffect } from "react"
import { Modal } from "@/components/ui/modal"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/input"
import { useT } from "@/lib/i18n/useT"

interface TaskCloseModalProps {
  open: boolean
  onClose: () => void
  onConfirm: (data: { expectation_confidence: number; expectation_text: string; check_in_days?: number; check_at?: string } | null) => void
  isPending?: boolean
}

const PRESET_DAYS = [7, 30, 90]

function daysFromNow(dateTimeLocal: string): number {
  const target = new Date(dateTimeLocal).getTime()
  const now = Date.now()
  return Math.max(1, Math.ceil((target - now) / (1000 * 60 * 60 * 24)))
}

function defaultCustomDateTime(): string {
  const d = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
  d.setSeconds(0, 0)
  // формат для <input type="datetime-local">: YYYY-MM-DDTHH:mm
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/**
 * Необязательная плашка при закрытии задачи — не блокирует закрытие
 * (можно закрыть и без фиксации, кнопка "Просто закрыть"). Идея та же,
 * что у PostCreateReflectionModal: ловить момент решения, пока мысль
 * ещё свежая, но никогда не заставлять.
 *
 * Внутренний стейт сбрасывается ТОЛЬКО когда `open` реально становится
 * false (см. эффект ниже) — не сразу после клика "подтвердить". Раньше
 * reset() вызывался синхронно сразу после onConfirm(), пока мутация
 * ещё летит на сервер — модалка на кадр откатывалась к intro-экрану,
 * что выглядело как "открылась заново" (см. баг-репорт в чате).
 */
export function TaskCloseModal({ open, onClose, onConfirm, isPending }: TaskCloseModalProps) {
  const t = useT()
  const [expanded, setExpanded] = useState(false)
  const [confidence, setConfidence] = useState(70)
  const [text, setText] = useState("")
  const [days, setDays] = useState(30)
  const [customMode, setCustomMode] = useState(false)
  const [customDateTime, setCustomDateTime] = useState(defaultCustomDateTime())

  useEffect(() => {
    if (!open) {
      setExpanded(false)
      setConfidence(70)
      setText("")
      setDays(30)
      setCustomMode(false)
      setCustomDateTime(defaultCustomDateTime())
    }
  }, [open])

  const handleClose = () => onClose()
  const handleSkip = () => onConfirm(null)
  const handleConfirm = () => {
    if (!text.trim()) return
    if (customMode) {
      // new Date(datetime-local) интерпретируется в локальном поясе браузера;
      // .toISOString() переводит в UTC — бэкенд ожидает aware datetime.
      onConfirm({ expectation_confidence: confidence, expectation_text: text.trim(), check_at: new Date(customDateTime).toISOString() })
    } else {
      onConfirm({ expectation_confidence: confidence, expectation_text: text.trim(), check_in_days: days })
    }
  }

  if (!expanded) {
    return (
      <Modal open={open} onClose={handleClose} title={t("taskClose.title")} size="sm">
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ fontSize: 13, color: "#c0c0d8", lineHeight: 1.5 }}>
            {t("taskClose.prompt")}
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <Button variant="ghost" onClick={handleSkip} disabled={isPending}>{t("taskClose.skip")}</Button>
            <Button variant="primary" onClick={() => setExpanded(true)}>{t("taskClose.fixate")}</Button>
          </div>
        </div>
      </Modal>
    )
  }

  return (
    <Modal open={open} onClose={handleClose} title={t("taskClose.dialogTitle")} size="sm">
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <Textarea
          label={t("taskClose.textLabel")}
          placeholder={t("taskClose.textPlaceholder")}
          value={text}
          onChange={(e: any) => setText(e.target.value)}
          rows={3}
        />
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={{ fontSize: 12, color: "#9999ad" }}>
            {t("taskClose.confidenceLabel")}: {confidence}%
          </label>
          <input type="range" min={0} max={100} step={5} value={confidence}
            onChange={e => setConfidence(+e.target.value)}
            style={{ width: "100%", accentColor: "#4A90D9" }} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={{ fontSize: 12, color: "#9999ad" }}>{t("taskClose.checkInLabel")}</label>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {PRESET_DAYS.map(d => (
              <button key={d} type="button" onClick={() => { setCustomMode(false); setDays(d) }}
                style={{
                  fontSize: 12, padding: "5px 12px", borderRadius: 6,
                  border: `1px solid ${!customMode && days === d ? "#4A90D9" : "#242430"}`,
                  background: !customMode && days === d ? "#4A90D918" : "transparent",
                  color: !customMode && days === d ? "#4A90D9" : "#9999ad", cursor: "pointer",
                }}>
                {t("taskClose.days", { n: d })}
              </button>
            ))}
            <button type="button" onClick={() => setCustomMode(true)}
              style={{
                fontSize: 12, padding: "5px 12px", borderRadius: 6,
                border: `1px solid ${customMode ? "#4A90D9" : "#242430"}`,
                background: customMode ? "#4A90D918" : "transparent",
                color: customMode ? "#4A90D9" : "#9999ad", cursor: "pointer",
              }}>
              {t("taskClose.customDate")}
            </button>
          </div>
          {customMode && (
            <input type="datetime-local"
              value={customDateTime}
              min={defaultCustomDateTime().slice(0, 10) + "T00:00" /* сегодня как нижняя граница, точнее не критично */}
              onChange={e => setCustomDateTime(e.target.value)}
              style={{
                marginTop: 4, fontSize: 12, padding: "6px 10px", borderRadius: 6,
                border: "1px solid #242430", background: "#0d0d18", color: "#c8c8e0",
              }} />
          )}
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <Button variant="ghost" onClick={handleSkip} disabled={isPending}>{t("taskClose.skip")}</Button>
          <Button variant="primary" onClick={handleConfirm} disabled={!text.trim() || isPending}>
            {isPending ? t("reflectionDialog.saving") : t("taskClose.confirmButton")}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
