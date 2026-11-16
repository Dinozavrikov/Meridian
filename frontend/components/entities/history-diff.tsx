"use client"
import type { CSSProperties } from "react"
import { theme } from "@/lib/theme"
import { useT } from "@/lib/i18n/useT"
import { EMPTY_VALUE } from "@/lib/entity-history-view"

// Длинное значение в одну строку «старое → новое» не читается: от этого порога идут два блока.
const LONG_VALUE = 40
const OLD_BG = "rgba(231,76,60,0.10)"
const OLD_LINE = "rgba(231,76,60,0.45)"
const NEW_BG = "rgba(46,204,113,0.10)"
const NEW_LINE = "rgba(46,204,113,0.55)"

const labelStyle: CSSProperties = { fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "#9aa1c2" }
const chip: CSSProperties = { display: "inline-block", padding: "2px 8px", borderRadius: 6, fontSize: 14, lineHeight: 1.5, maxWidth: "100%", wordBreak: "break-word" }

function Block({ isNew, title, text }: { isNew: boolean; title: string; text: string }) {
  return (
    <div style={{
      borderLeft: `2px solid ${isNew ? NEW_LINE : OLD_LINE}`, background: isNew ? NEW_BG : OLD_BG,
      borderRadius: "0 6px 6px 0", padding: "6px 10px",
    }}>
      <div style={{ ...labelStyle, marginBottom: 2 }}>{title}</div>
      <div style={{ fontSize: 14, lineHeight: 1.55, color: isNew ? theme.tx1 : "#b4b9d2", wordBreak: "break-word" }}>{text}</div>
    </div>
  )
}

/** Одно изменённое поле: подпись и «старое → новое» (короткие значения) либо блоки «Было»/«Стало». */
export function DiffField({ label, oldText, newText }: { label: string; oldText: string; newText: string }) {
  const t = useT()
  const long = oldText.length > LONG_VALUE || newText.length > LONG_VALUE
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={labelStyle}>{label}</div>
      {long ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <Block isNew={false} title={t("history.was")} text={oldText} />
          <Block isNew title={t("history.became")} text={newText} />
        </div>
      ) : (
        <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
          <span style={{ ...chip, background: OLD_BG, color: "#b4b9d2", textDecoration: oldText === EMPTY_VALUE ? "none" : "line-through" }}>{oldText}</span>
          <span aria-hidden="true" style={{ color: "#9aa1c2" }}>→</span>
          <span style={{ ...chip, background: NEW_BG, color: theme.tx1 }}>{newText}</span>
        </div>
      )}
    </div>
  )
}
