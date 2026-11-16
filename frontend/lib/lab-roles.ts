// Роли участника лаборатории — раньше ROLE_COLOR/ROLE_LABEL дублировались
// без изменений в 3 местах (labs/page.tsx, user-preview-modal.tsx,
// lab-members-tab.tsx), ROLE_ORDER — ещё отдельно в lab-members-tab.tsx;
// ни одна копия не была локализована. Один источник правды вместо трёх.
export const ROLE_COLOR: Record<string, string> = {
  owner: "#1ABC9C",
  admin: "#9B59B6",
  member: "#606060",
}
export const ROLE_ORDER: Record<string, number> = { owner: 0, admin: 1, member: 2 }
export function roleLabel(t: (key: string) => string, role: string): string {
  if (role === "owner") return t("labsPage.roleOwner")
  if (role === "admin") return t("labsPage.roleAdmin")
  if (role === "member") return t("labsPage.roleMember")
  return role
}
