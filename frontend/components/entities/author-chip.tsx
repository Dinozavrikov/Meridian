"use client"
import Link from "next/link"

/** Автор записи: кружок с инициалом и имя; со ссылкой на профиль, если известен username. */
export function AuthorChip({ name, username }: { name?: string | null; username?: string | null }) {
  if (!name) return null
  const style: React.CSSProperties = {
    display: "inline-flex", alignItems: "center", gap: 8, minWidth: 0, maxWidth: "100%",
    fontSize: 13, color: "#d6d9ec", textDecoration: "none",
  }
  const body = (
    <>
      <span aria-hidden style={{
        width: 22, height: 22, borderRadius: "50%", background: "#2a2f4a", color: "#d6d9ec", flexShrink: 0,
        display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 600,
      }}>
        {name.trim().charAt(0).toUpperCase()}
      </span>
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</span>
    </>
  )
  return username ? <Link href={`/profile/${username}`} style={style}>{body}</Link> : <span style={style}>{body}</span>
}
