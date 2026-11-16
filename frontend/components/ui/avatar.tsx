"use client"
import Link from "next/link"
import { resolveMediaUrl } from "@/lib/api"

export function avatarHue(name: string) {
  return name.split("").reduce((a, c) => a + c.charCodeAt(0), 0) % 360
}

/**
 * Расширено для полевого журнала (NotesTimeline): опциональные avatarUrl
 * (настоящее фото вместо буквы) и ringColor (акцентная обводка+свечение
 * при наведении). Оба параметра необязательны — все существующие вызовы
 * (UserChip, hypotheses/page.tsx, observations/page.tsx, comment-thread.tsx)
 * продолжают работать без изменений и выглядят так же, как раньше.
 */
export function Avatar({
  name, size = 28, avatarUrl, ringColor,
}: { name: string; size?: number; avatarUrl?: string | null; ringColor?: string }) {
  const letter = (name || "?")[0].toUpperCase()
  const hueVal = avatarHue(name)
  const radius = Math.round(size / 3.5)
  const border = ringColor ? `1.5px solid ${ringColor}` : `1px solid hsl(${hueVal},40%,26%)`
  const glow = ringColor ? `0 0 6px ${ringColor}40` : "none"
  const resolved = avatarUrl ? resolveMediaUrl(avatarUrl) : null

  if (resolved) {
    return (
      <div style={{
        width: size, height: size, borderRadius: radius, overflow: "hidden",
        flexShrink: 0, border, boxShadow: glow, transition: "border-color .15s, box-shadow .15s",
      }}>
        <img src={resolved} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      </div>
    )
  }

  return (
    <div style={{
      width: size, height: size, borderRadius: radius,
      background: `hsl(${hueVal},35%,16%)`,
      border, boxShadow: glow,
      display: "flex", alignItems: "center", justifyContent: "center",
      flexShrink: 0, fontSize: Math.round(size * 0.4), fontWeight: 700,
      color: `hsl(${hueVal},55%,65%)`,
      userSelect: "none",
      transition: "border-color .15s, box-shadow .15s",
    }}>{letter}</div>
  )
}

export function UserChip({ username, display, size = 24, avatarUrl }: { username: string; display?: string; size?: number; avatarUrl?: string | null }) {
  const name = display || username
  const hueVal = avatarHue(name)
  return (
    <Link href={`/profile/${username}`}
      style={{ display: "inline-flex", alignItems: "center", gap: 6, textDecoration: "none" }}
      onClick={e => e.stopPropagation()}>
      <Avatar name={name} size={size} avatarUrl={avatarUrl} />
      <span style={{
        fontSize: size * 0.5, fontWeight: 600,
        color: `hsl(${hueVal},40%,55%)`,
        transition: "color 0.12s",
      }}
        onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = `hsl(${hueVal},55%,70%)`}
        onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = `hsl(${hueVal},40%,55%)`}
      >{name}</span>
    </Link>
  )
}
