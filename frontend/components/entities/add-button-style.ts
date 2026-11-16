// frontend/components/entities/add-button-style.ts
//
// Общий стиль триггер-кнопок "Добавить"/"Добавить X" в семье quick-add
// компонентов (AddRelatedButton, EntityQuickAddMenu). Раньше был
// продублирован построчно в 3 местах — расхождения копились молча.
export const ADD_BUTTON_STYLE: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 5,
  padding: "5px 12px", borderRadius: 6,
  border: "1px solid #1e1e2e", background: "transparent",
  color: "#9898bb", cursor: "pointer", fontSize: 11,
  fontWeight: 500, transition: "all 0.12s", whiteSpace: "nowrap",
}

export function addButtonHoverOn(e: React.MouseEvent) {
  const el = e.currentTarget as HTMLElement
  el.style.borderColor = "#4A90D9"
  el.style.color = "#4A90D9"
}

export function addButtonHoverOff(e: React.MouseEvent) {
  const el = e.currentTarget as HTMLElement
  el.style.borderColor = "#1e1e2e"
  el.style.color = "#9494b8"
}
