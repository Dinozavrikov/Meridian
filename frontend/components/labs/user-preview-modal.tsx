"use client"
import { Modal } from "@/components/ui/modal"
import { v2 } from "@/lib/theme"
import { resolveMediaUrl } from "@/lib/api"
import Link from "next/link"
import { ExternalLink } from "lucide-react"
import { useT } from "@/lib/i18n/useT"
import { ROLE_COLOR, roleLabel } from "@/lib/lab-roles"

interface UserPreviewModalProps {
  user: {
    username: string
    display_name: string
    bio?: string
    avatar_url?: string | null
    created_at?: string
    role?: string
  } | null
  onClose: () => void
}

export function UserPreviewModal({ user, onClose }: UserPreviewModalProps) {
  const t = useT()
  if (!user) return null
  const color = ROLE_COLOR[user.role ?? "member"] ?? ROLE_COLOR.member
  const joined = user.created_at
    ? new Date(user.created_at).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" })
    : null

  return (
    <Modal open={!!user} onClose={onClose} size="sm">
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 4 }}>
        <div style={{
          width: 56, height: 56, borderRadius: "50%", overflow: "hidden",
          background: `${color}18`, display: "flex", alignItems: "center", justifyContent: "center",
          marginBottom: 12, border: `1px solid ${color}30`,
        }}>
          {user.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={resolveMediaUrl(user.avatar_url) ?? undefined} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          ) : (
            <span style={{ fontSize: 20, fontWeight: 700, color }}>
              {(user.display_name || user.username)[0].toUpperCase()}
            </span>
          )}
        </div>

        <h2 style={{ fontSize: 16, fontWeight: 700, color: v2.t1, margin: 0 }}>
          {user.display_name || user.username}
        </h2>
        <p style={{ fontSize: 12, color: v2.t3, margin: "2px 0 10px" }}>@{user.username}</p>

        {user.role && (
          <span style={{
            fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em",
            padding: "3px 10px", borderRadius: 999, marginBottom: 14,
            background: `${color}18`, color,
          }}>
            {roleLabel(t, user.role)}
          </span>
        )}

        {user.bio && (
          <p style={{ fontSize: 13, color: v2.t2, lineHeight: 1.6, margin: "0 0 16px", maxWidth: 400 }}>
            {user.bio}
          </p>
        )}

        {joined && (
          <p style={{ fontSize: 11, color: v2.t3, margin: "0 0 18px" }}>
            {t("labsPage.joinedOnPrefix", { date: joined })}
          </p>
        )}

        <Link href={`/profile/${user.username}`}
          style={{
            display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
            width: "100%", padding: "10px 16px", borderRadius: 9, textDecoration: "none",
            background: `${color}14`, color, border: `1px solid ${color}30`,
            fontSize: 12.5, fontWeight: 600,
          }}>
          {t("labsPage.openProfileButton")} <ExternalLink size={13} />
        </Link>
      </div>
    </Modal>
  )
}
