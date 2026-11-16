"use client"
// Единый переключатель "область данных" — переиспользуется на /graph
// (Мой граф / Глобальный граф) и на странице лаборатории (Лента / Граф).
export function ScopeToggle<T extends string>({ options, value, onChange }: {
  options: { value: T; label: string }[]
  value: T
  onChange: (v: T) => void
}) {
  return (
    <div style={{
      display: "flex", gap: 2, padding: 3, borderRadius: 10,
      background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)",
    }}>
      {options.map(o => (
        <button key={o.value} onClick={() => onChange(o.value)} style={{
          fontSize: 12, fontWeight: 600, padding: "6px 13px", borderRadius: 7, cursor: "pointer",
          border: "none",
          background: value === o.value ? "rgba(74,144,217,0.16)" : "transparent",
          color: value === o.value ? "#4A90D9" : "#989aa7",
          boxShadow: value === o.value ? "inset 0 0 0 1px rgba(74,144,217,0.35)" : "none",
          transition: "background .15s, color .15s",
        }}>
          {o.label}
        </button>
      ))}
    </div>
  )
}
