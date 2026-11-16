"use client"
import { labKeys } from "@/lib/lab-queries"
import { useMemo, useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { ArrowDownAZ, ArrowUpAZ, ChevronDown } from "lucide-react"
import { api, userApi } from "@/lib/api"
import { v2 } from "@/lib/theme"
import { UserPreviewModal } from "@/components/labs/user-preview-modal"
import { useT } from "@/lib/i18n/useT"
import { ROLE_COLOR, ROLE_ORDER, roleLabel } from "@/lib/lab-roles"
import { Avatar } from "@/components/ui/avatar"
import { Select } from "@/components/ui/select"

type SortField = "name" | "role" | "score"

// Ширина "хвостовых" колонок фиксирована, чтобы строки выравнивались друг под другом при
// любом числе участников — без этого "69%"/"5%" и роль/кнопка "гуляли" по горизонтали
// (flex растягивался под контент каждой строки отдельно, не единой сеткой).
const SCORE_COL_WIDTH = 72
const ROLE_COL_WIDTH = 108

export function LabMembersTab({ labId, isOwner }: { labId: number; isOwner: boolean }) {
  const t = useT()
  const qc = useQueryClient()
  const [previewUsername, setPreviewUsername] = useState<string | null>(null)
  const [previewRole, setPreviewRole] = useState<string | undefined>(undefined)
  const [sortField, setSortField] = useState<SortField>("role")
  const [sortAsc, setSortAsc] = useState(true)

  const { data: previewUser } = useQuery({
    queryKey: ["user", previewUsername],
    queryFn: () => userApi.get(previewUsername as string),
    enabled: !!previewUsername,
  })
  const { data: members = [], isLoading } = useQuery({
    queryKey: labKeys.members(labId),
    queryFn: () => api.get(`/api/v1/labs/${labId}/members`).then(r => r.data),
  })

  const setRole = useMutation({
    mutationFn: ({ userId, role }: { userId: number; role: string }) =>
      api.patch(`/api/v1/labs/${labId}/members/${userId}/role`, { role }),
    onSuccess: () => qc.invalidateQueries({ queryKey: labKeys.members(labId) }),
  })

  // Единый список людей и их вклада в калибровку лабы — раньше были два отдельных блока
  // (одни и те же участники дважды), объединено 01.10 по продуктовому решению. Сортировка —
  // на фронте, по уже полученным данным (участников лабы не бывает тысячи, в отличие от
  // ленты/комментариев — один SQL-проход на всех на бэкенде, список не пагинирован).
  const sorted = useMemo(() => {
    const dir = sortAsc ? 1 : -1
    return [...members].sort((a: any, b: any) => {
      if (sortField === "role") {
        const byRole = ((ROLE_ORDER[a.role] ?? 9) - (ROLE_ORDER[b.role] ?? 9)) * dir
        if (byRole !== 0) return byRole
        return (a.display_name || a.username).localeCompare(b.display_name || b.username, "ru")
      }
      if (sortField === "score") {
        // Без данных (score_pct=null) — ниже всех при любом направлении, не "выше" при desc:
        // отсутствие рейтинга не должно выглядеть как первое место.
        const sa = a.score_pct ?? -1
        const sb = b.score_pct ?? -1
        if (sa !== sb) return (sb - sa) * (sortAsc ? -1 : 1)
        return (a.display_name || a.username).localeCompare(b.display_name || b.username, "ru")
      }
      return (a.display_name || a.username).localeCompare(b.display_name || b.username, "ru") * dir
    })
  }, [members, sortField, sortAsc])

  // Медаль-акцент топ-3 — только когда человек САМ выбрал "по калибровке, лучшие первые":
  // при сортировке по имени/роли или по возрастанию балла это выглядело бы как случайный
  // рейтинг, которого никто не просил.
  const isBestFirstByScore = sortField === "score" && !sortAsc
  const RANK_COLOR: Record<number, string> = { 0: "#F5C542", 1: "#C7CCD6", 2: "#C98A4B" }

  if (isLoading) {
    return <div className="p-5" style={{ color: v2.t3, fontSize: 12 }}>…</div>
  }

  if (sorted.length === 0) {
    return (
      <div className="p-5">
        <div style={{ textAlign: "center", padding: "40px 0", color: v2.t3, fontSize: 12 }}>
          {t("labsPage.noMembersYet")}
        </div>
      </div>
    )
  }

  return (
    <div className="p-5">
      <div className="max-w-xl" style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <div style={{ position: "relative" }}>
          <Select
            value={sortField}
            onChange={e => setSortField(e.target.value as SortField)}
            options={[
              { value: "role", label: t("labsPage.sortByRole") },
              { value: "name", label: t("labsPage.sortByName") },
              { value: "score", label: t("labsPage.sortByScore") },
            ]}
            style={{ padding: "6px 28px 6px 10px", fontSize: 12 }}
          />
          <ChevronDown size={13} style={{
            position: "absolute", right: 9, top: "50%", transform: "translateY(-50%)",
            color: v2.t3, pointerEvents: "none",
          }} />
        </div>
        <button
          onClick={() => setSortAsc(v => !v)}
          title={sortAsc ? t("labsPage.sortAsc") : t("labsPage.sortDesc")}
          style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            width: 32, height: 32, borderRadius: 8, cursor: "pointer",
            background: v2.surf, border: `1px solid ${v2.bd}`, color: v2.t3,
          }}>
          {sortAsc ? <ArrowUpAZ size={14} /> : <ArrowDownAZ size={14} />}
        </button>
      </div>

      <div className="max-w-xl" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {sorted.map((m: any, i: number) => {
          const color = ROLE_COLOR[m.role] ?? ROLE_COLOR.member
          const hasScore = m.score_pct !== null && m.score_pct !== undefined
          const rankColor = isBestFirstByScore && hasScore ? RANK_COLOR[i] : undefined
          return (
            <div key={m.user_id} onClick={() => { setPreviewUsername(m.username); setPreviewRole(m.role) }}
              className="flex items-center gap-3" style={{
              padding: "10px 14px", borderRadius: 10, cursor: "pointer",
              background: v2.surf, border: `1px solid ${v2.bd}`,
              borderLeft: `2px solid ${rankColor ?? color}`,
            }}>
              <Avatar name={m.display_name || m.username} avatarUrl={m.avatar_url} size={32} ringColor={rankColor ?? color} />
              <div className="flex-1 min-w-0">
                <p className="truncate" style={{ fontSize: 12, fontWeight: 500, color: v2.t1 }}>
                  {m.display_name || m.username}
                </p>
                <p className="truncate" style={{ fontSize: 10, color: v2.t3 }}>@{m.username}</p>
              </div>

              {/* Фиксированная ширина — колонка балла выравнивается по вертикали независимо от
                  того, сколько цифр в проценте или есть ли калибровка вообще у этой строки. */}
              <div style={{ width: SCORE_COL_WIDTH, flexShrink: 0, display: "flex", justifyContent: "flex-end" }}>
                {m.n_closed > 0 && (
                  hasScore ? (
                    <div style={{
                      display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 1,
                      padding: "3px 8px", borderRadius: 8, background: `${v2.teal}14`,
                    }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: v2.teal, fontFamily: "monospace", lineHeight: 1.1 }}>
                        {m.score_pct}%
                      </span>
                      <span style={{ fontSize: 9, color: v2.t3, lineHeight: 1.1 }}>
                        {t("labCalibration.closedCount", { n: m.n_closed })}
                      </span>
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 1 }}>
                      <span style={{ fontSize: 10, color: v2.t3, fontStyle: "italic" }}>{t("labsPage.gatheringHistory")}</span>
                      <span style={{ fontSize: 9, color: v2.t3 }}>{t("labCalibration.closedCount", { n: m.n_closed })}</span>
                    </div>
                  )
                )}
              </div>

              {/* Та же логика фиксированной ширины — роль-плашка и кнопка "сделать админом"
                  занимают один слот, чтобы правый край строк не прыгал. */}
              <div style={{ width: ROLE_COL_WIDTH, flexShrink: 0, display: "flex", justifyContent: "flex-end" }}>
                {isOwner && m.role !== "owner" ? (
                  <button
                    onClick={(e) => { e.stopPropagation(); setRole.mutate({ userId: m.user_id, role: m.role === "admin" ? "member" : "admin" }) }}
                    disabled={setRole.isPending}
                    style={{ fontSize: 10, color: v2.t3, background: "transparent", border: "none", cursor: "pointer", textDecorationLine: "underline", textDecorationStyle: "dotted", textAlign: "right" }}>
                    {m.role === "admin" ? t("labsPage.revokeAdminButton") : t("labsPage.makeAdminButton")}
                  </button>
                ) : (
                  <span style={{
                    fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em",
                    padding: "2px 8px", borderRadius: 999,
                    background: `${color}18`, color,
                  }}>
                    {roleLabel(t, m.role)}
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>
      <UserPreviewModal
        user={previewUser ? { ...previewUser, role: previewRole } : null}
        onClose={() => setPreviewUsername(null)}
      />
    </div>
  )
}
