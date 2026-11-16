/** Бейдж рядом с названием таба. extra: «N + M» — строгие + открытые через связь, M рисуется тусклее. */
export function TabBadge({ n, extra, warn }: { n: number; extra?: number; warn?: boolean }) {
  if (!n && !extra) return null
  const bg = warn ? "#E8A02020" : "#1ABC9C20"
  const fg = warn ? "#E8A020" : "#1ABC9C"
  return (
    <span style={{ fontSize: 10, padding: "1px 5px", borderRadius: 3, background: bg, color: fg, whiteSpace: "nowrap" }}>
      {n}
      {!!extra && <span style={{ opacity: .7 }}>{" + "}{extra}</span>}
    </span>
  )
}
