import axios from "axios"
import { isGuestAllowedPath } from "@/lib/guest-access"
import { askConsent } from "@/lib/consent"

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"

export const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
})

export function resolveMediaUrl(path: string | null | undefined): string | null {
  if (!path) return null
  if (path.startsWith("http://") || path.startsWith("https://")) return path
  return `${API_BASE_URL}${path}`
}

/** Резолвит относительные src в тегах <img> внутри HTML-строки (Result.body
 * и подобный rich-контент) — тот же принцип, что resolveMediaUrl, только
 * для сериализованного HTML, а не одиночного пути. Только для отображения:
 * результат не должен уходить обратно на сохранение, иначе домен намертво
 * зашьётся в данные (ломается при переносе dev/prod). */
export function resolveHtmlImages(html: string): string {
  if (!html) return html
  return html.replace(/<img([^>]*)\ssrc="(\/[^"]*)"/g, (_m, attrs, path) => `<img${attrs} src="${resolveMediaUrl(path)}"`)
}

api.interceptors.response.use(
  r => r,
  async err => {
    const orig = err.config
    // 409 needs_consent: операция откроет запись лаборатории, нужно согласие владельца. Спрашиваем, кому показать, и повторяем с share=<выбор>.
    const detail = err.response?.data?.detail
    if (orig && err.response?.status === 409 && detail?.code === "needs_consent" && !orig._consentAsked) {
      orig._consentAsked = true
      const share = await askConsent(detail.impacts ?? [])
      if (share) {
        return api({ ...orig, params: { ...(orig.params ?? {}), share } })
      }
      err.consentDeclined = true
    }
    if (err.response?.status === 401 && !orig._retry) {
      orig._retry = true
      try {
        await axios.post(
          `${API_BASE_URL}/api/v1/auth/refresh`,
          {},
          { withCredentials: true }
        )
        return api(orig)
      } catch {
        // Не редиректим гостя на /login, если он и так на разрешённой ему
        // публичной странице (/feed) — 401 здесь просто значит "у гостя
        // нет доступа к этому конкретному второстепенному запросу", а не
        // "пользователя выкинули из системы".
        if (typeof window !== "undefined" && !isGuestAllowedPath(window.location.pathname)) {
          window.location.href = "/login"
        }
      }
    }
    return Promise.reject(err)
  }
)

// ── Auth ──────────────────────────────────────────────────────────────────
export const authApi = {
  register: (d: { username: string; email: string; password: string; display_name?: string; turnstile_token: string; website?: string }) =>
    api.post("/api/v1/auth/register", d).then(r => r.data),
  googleAvailable: () =>
    api.get<{ available: boolean }>("/api/v1/auth/google/available").then(r => r.data),
  login: (d: { username: string; password: string }) =>
    api.post("/api/v1/auth/login", d).then(r => r.data),
  logout: () => api.post("/api/v1/auth/logout"),
  me: () => api.get("/api/v1/auth/me").then(r => r.data),
  updateOnboarding: (step: number, completed = false) =>
    api.patch("/api/v1/auth/onboarding", { step, completed }).then(r => r.data),
  updateMe: (d: { display_name?: string; bio?: string; default_visibility?: string }) =>
    api.patch("/api/v1/auth/me", d).then(r => r.data),
  changePassword: (d: { current_password: string; new_password: string }) =>
    api.post("/api/v1/auth/change-password", d).then(r => r.data),
  changeEmail: (d: { new_email: string; password: string }) =>
    api.post("/api/v1/auth/change-email", d).then(r => r.data),
  deleteAccount: (password: string) =>
    api.delete("/api/v1/auth/me", { data: { password } }).then(r => r.data),
  forgotPassword: (email: string) =>
    api.post("/api/v1/auth/forgot-password", { email }).then(r => r.data),
  resetPassword: (d: { token: string; new_password: string }) =>
    api.post("/api/v1/auth/reset-password", d).then(r => r.data),
  uploadAvatar: (file: File) => {
    const fd = new FormData()
    fd.append("file", file)
    return api.post("/api/v1/users/me/avatar", fd, {
      headers: { "Content-Type": "multipart/form-data" },
    }).then(r => r.data)
  },
}

// ── Sessions ──────────────────────────────────────────────────────────────
export const sessionsApi = {
  list: () => api.get("/api/v1/auth/sessions").then(r => r.data),
  revoke: (id: number) => api.delete(`/api/v1/auth/sessions/${id}`),
}

// ── Notification preferences ─────────────────────────────────────────────
export const notifPrefsApi = {
  get: () => api.get("/api/v1/users/me/notification-prefs").then(r => r.data),
  update: (d: { new_messages?: boolean; comments?: boolean; prediction_reminders?: boolean }) =>
    api.patch("/api/v1/users/me/notification-prefs", d).then(r => r.data),
}

// ── Data export ───────────────────────────────────────────────────────────
export const exportApi = {
  download: () => api.get("/api/v1/users/me/export").then(r => r.data),
}

// ── Observations ──────────────────────────────────────────────────────────
export const obsApi = {
  list: (params?: { tag?: string; author?: string; lab_id?: number; includeOpened?: boolean }) =>
    api.get("/api/v1/observations/", { params: params ? { ...params, include_opened: params.includeOpened || undefined, includeOpened: undefined } : undefined }).then(r => r.data),
  get: (id: number | string) => api.get(`/api/v1/observations/${id}`).then(r => r.data),
  create: (d: any) => api.post("/api/v1/observations/", d).then(r => r.data),
  update: (id: number, d: any) => api.put(`/api/v1/observations/${id}`, d).then(r => r.data),
  delete: (id: number) => api.delete(`/api/v1/observations/${id}`),
  addReflection: (id: number, d: { stage: "creation" | "resolution"; factors: any[]; raw_dialogue_text?: string }) =>
    api.post(`/api/v1/observations/${id}/reflections`, d).then(r => r.data),
  listReflections: (id: number) =>
    api.get(`/api/v1/observations/${id}/reflections`).then(r => r.data),
  manualInsight: (id: number) =>
    api.post(`/api/v1/observations/${id}/reflections/insights/manual`).then(r => r.data),
  listInsights: (id: number) =>
    api.get(`/api/v1/observations/${id}/reflections/insights`).then(r => r.data),
  reflectionQuestion: (id: number, insightId: number) =>
    api.post(`/api/v1/observations/${id}/reflections/insights/${insightId}/question`).then(r => r.data),
}

// ── Hypotheses ────────────────────────────────────────────────────────────
// ── Scales ────────────────────────────────────────────────────────────────
export const scalesApi = {
  listCustom: (entityType?: string) =>
    api.get("/api/v1/scales/defs", { params: entityType ? { entity_type: entityType } : {} }).then(r => r.data),
  createCustom: (d: any) => api.post("/api/v1/scales/defs", d).then(r => r.data),
  updateCustom: (id: number, d: any) => api.put(`/api/v1/scales/defs/${id}`, d).then(r => r.data),
  deleteCustom: (id: number) => api.delete(`/api/v1/scales/defs/${id}`),

  getBuiltinOverrides: () => api.get("/api/v1/scales/defs/builtin").then(r => r.data),
  setBuiltinOverride: (builtinKey: string, levels: any[]) =>
    api.put(`/api/v1/scales/defs/builtin/${builtinKey}`, { levels }).then(r => r.data),

  getValues: (entityType: string, entityId: number) =>
    api.get("/api/v1/scales/values", { params: { entity_type: entityType, entity_id: entityId } }).then(r => r.data),
  setValue: (entityType: string, entityId: number, scaleId: string, value: number | null) =>
    api.put("/api/v1/scales/values", { entity_type: entityType, entity_id: entityId, scale_id: scaleId, value }).then(r => r.data),
}

export const userApi = {
  get: (username: string) => api.get(`/api/v1/users/${username}`).then(r => r.data),
}

export const hypApi = {
  list: (params?: { status?: string; tag?: string; lab_id?: number; includeOpened?: boolean }) =>
    api.get("/api/v1/hypotheses/", { params: params ? { ...params, include_opened: params.includeOpened || undefined, includeOpened: undefined } : undefined }).then(r => r.data),
  get: (id: number | string) => api.get(`/api/v1/hypotheses/${id}`).then(r => r.data),
  create: (d: any) => api.post("/api/v1/hypotheses/", d).then(r => r.data),
  update: (id: number, d: any) => api.put(`/api/v1/hypotheses/${id}`, d).then(r => r.data),
  delete: (id: number) => api.delete(`/api/v1/hypotheses/${id}`),
  getMaturitySuggestion: (id: number) =>
    api.get(`/api/v1/hypotheses/${id}/maturity-suggestion`).then(r => r.data),
  acceptMaturitySuggestion: (id: number) =>
    api.post(`/api/v1/hypotheses/${id}/maturity-suggestion/accept`).then(r => r.data),
  dismissMaturitySuggestion: (id: number) =>
    api.post(`/api/v1/hypotheses/${id}/maturity-suggestion/dismiss`),
  maturityProgress: (id: number) =>
    api.get(`/api/v1/hypotheses/${id}/maturity-progress`).then(r => r.data),
  evidenceDiversity: (id: number) =>
    api.get(`/api/v1/hypotheses/${id}/evidence-diversity`).then(r => r.data),
  tagCalibration: (tag: string) =>
    api.get("/api/v1/hypotheses/tag-calibration", { params: { tag } }).then(r => r.data),
  suggestedObservations: (id: number) =>
    api.get(`/api/v1/hypotheses/${id}/suggested-observations`).then(r => r.data),
}

// ── Predictions ───────────────────────────────────────────────────────────
export const predApi = {
  list: (params?: { status?: string; hypothesis_id?: number; lab_id?: number; mine?: boolean; includeOpened?: boolean }) =>
    api.get("/api/v1/predictions/", { params: params ? { ...params, include_opened: params.includeOpened || undefined, includeOpened: undefined } : undefined }).then(r => r.data),
  get: (id: number | string) => api.get(`/api/v1/predictions/${id}`).then(r => r.data),
  create: (d: any) => api.post("/api/v1/predictions/", d).then(r => r.data),
  update: (id: number, d: any) => api.put(`/api/v1/predictions/${id}`, d).then(r => r.data),
  delete: (id: number) => api.delete(`/api/v1/predictions/${id}`),
  close: (id: number, status: string, result_notes: string) =>
    api.put(`/api/v1/predictions/${id}/close`, { status, result_notes }).then(r => r.data),
  addReflection: (id: number, d: { stage: "creation" | "resolution"; factors: any[]; raw_dialogue_text?: string }) =>
    api.post(`/api/v1/predictions/${id}/reflections`, d).then(r => r.data),
  listReflections: (id: number) =>
    api.get(`/api/v1/predictions/${id}/reflections`).then(r => r.data),
  manualInsight: (id: number) =>
    api.post(`/api/v1/predictions/${id}/reflections/insights/manual`).then(r => r.data),
  listInsights: (id: number, triggeredBy?: "manual" | "resolution") =>
    api.get(`/api/v1/predictions/${id}/reflections/insights`, { params: triggeredBy ? { triggered_by: triggeredBy } : {} }).then(r => r.data),
  reflectionQuestion: (id: number, insightId: number) =>
    api.post(`/api/v1/predictions/${id}/reflections/insights/${insightId}/question`).then(r => r.data),
}
export const resultApi = {
  list: (params?: { lab_id?: number }) =>
    api.get("/api/v1/results/", { params }).then(r => r.data),
  get: (id: number | string) => api.get(`/api/v1/results/${id}`).then(r => r.data),
  create: (d: any) => api.post("/api/v1/results/", d).then(r => r.data),
  update: (id: number, d: any) => api.put(`/api/v1/results/${id}`, d).then(r => r.data),
  delete: (id: number) => api.delete(`/api/v1/results/${id}`),
  publish: (id: number) => api.post(`/api/v1/results/${id}/publish`).then(r => r.data),
  unpublish: (id: number) => api.post(`/api/v1/results/${id}/unpublish`).then(r => r.data),
  listSuggestions: (id: number) =>
    api.get(`/api/v1/results/${id}/suggestions`).then(r => r.data),
  listAvailableSources: (id: number) =>
    api.get(`/api/v1/results/${id}/sources/available`).then(r => r.data),
  listAvailableSourcesByLab: (labId: number) =>
    api.get(`/api/v1/results/labs/${labId}/sources/available`).then(r => r.data),
  listLinkedSources: (id: number) =>
    api.get(`/api/v1/results/${id}/sources/linked`).then(r => r.data),
  linkSource: (id: number, sourceDocumentId: number) =>
    api.post(`/api/v1/results/${id}/sources/link`, { source_document_id: sourceDocumentId }).then(r => r.data),
  unlinkSource: (id: number, linkId: number) =>
    api.delete(`/api/v1/results/${id}/sources/link/${linkId}`),
  createSuggestion: (id: number, proposed_body: string) =>
    api.post(`/api/v1/results/${id}/suggestions`, { proposed_body }).then(r => r.data),
  acceptSuggestion: (id: number, sid: number) =>
    api.post(`/api/v1/results/${id}/suggestions/${sid}/accept`).then(r => r.data),
  rejectSuggestion: (id: number, sid: number) =>
    api.post(`/api/v1/results/${id}/suggestions/${sid}/reject`).then(r => r.data),
}

// ── Worldview ─────────────────────────────────────────────────────────────
export const wvApi = {
  list: (params?: { status?: string }) =>
    api.get("/api/v1/worldview/", { params }).then(r => r.data),
  get: (id: number | string) => api.get(`/api/v1/worldview/${id}`).then(r => r.data),
  create: (d: any) => api.post("/api/v1/worldview/", d).then(r => r.data),
  update: (id: number, d: any) => api.put(`/api/v1/worldview/${id}`, d).then(r => r.data),
  delete: (id: number) => api.delete(`/api/v1/worldview/${id}`),
  // Тип ослаблен до "creation" | "resolution" для совместимости с общим
  // интерфейсом ReflectionApi (lib/reflection-api.ts) — у Worldview на практике
  // передаётся только "creation", стадии resolution у этой сущности не существует.
  addReflection: (id: number, d: { stage: "creation" | "resolution"; factors: any[]; raw_dialogue_text?: string }) =>
    api.post(`/api/v1/worldview/${id}/reflections`, d).then(r => r.data),
  listReflections: (id: number) =>
    api.get(`/api/v1/worldview/${id}/reflections`).then(r => r.data),
  manualInsight: (id: number) =>
    api.post(`/api/v1/worldview/${id}/reflections/insights/manual`).then(r => r.data),
  listInsights: (id: number) =>
    api.get(`/api/v1/worldview/${id}/reflections/insights`).then(r => r.data),
  reflectionQuestion: (id: number, insightId: number) =>
    api.post(`/api/v1/worldview/${id}/reflections/insights/${insightId}/question`).then(r => r.data),
}

// ── Questions ─────────────────────────────────────────────────────────────
export const questionApi = {
  list: (params?: { status?: string; priority?: string }) =>
    api.get("/api/v1/questions/", { params }).then(r => r.data),
  get: (id: number | string) => api.get(`/api/v1/questions/${id}`).then(r => r.data),
  create: (d: any) => api.post("/api/v1/questions/", d).then(r => r.data),
  update: (id: number, d: any) => api.put(`/api/v1/questions/${id}`, d).then(r => r.data),
  delete: (id: number) => api.delete(`/api/v1/questions/${id}`),
}

// ── Tasks ─────────────────────────────────────────────────────────────────
export const taskApi = {
  list: () => api.get("/api/v1/tasks/").then(r => r.data),
  get: (id: number | string) => api.get(`/api/v1/tasks/${id}`).then(r => r.data),
  create: (d: any) => api.post("/api/v1/tasks/", d).then(r => r.data),
  update: (id: number, d: any) => api.put(`/api/v1/tasks/${id}`, d).then(r => r.data),
  delete: (id: number) => api.delete(`/api/v1/tasks/${id}`),
  closeWithExpectation: (id: number, d: any | null) =>
    api.post(`/api/v1/tasks/${id}/close-with-expectation`, d).then(r => r.data),
  pendingExpectations: () =>
    api.get("/api/v1/tasks/expectations/pending").then(r => r.data),
  resolveExpectation: (id: number, d: any) =>
    api.post(`/api/v1/tasks/expectations/${id}/resolve`, d).then(r => r.data),
  dismissExpectation: (id: number) =>
    api.post(`/api/v1/tasks/expectations/${id}/dismiss`).then(r => r.data),
}

// ── Graph ─────────────────────────────────────────────────────────────────
export const graphApi = {
  get: () => api.get("/api/v1/graph/").then(r => r.data),
  lab: (labId: number, params?: { includeOpened?: boolean }) =>
    api.get(`/api/v1/graph/lab/${labId}`, { params: { include_opened: params?.includeOpened || undefined } }).then(r => r.data),
  addLink: (d: any) => api.post("/api/v1/graph/links", null, { params: d }).then(r => r.data),
  removeLink: (d: any) => api.delete("/api/v1/graph/links", { params: d }),
  whatIf: (exclude: number[], labId?: number, global?: boolean) =>
    api.post(global ? "/api/v1/graph/global/what-if" : labId ? `/api/v1/graph/lab/${labId}/what-if` : "/api/v1/graph/what-if", { exclude_observation_ids: exclude }).then(r => r.data),
  blindSpots: (labId?: number, global?: boolean) =>
    api.get(global ? "/api/v1/graph/global/blind-spots" : labId ? `/api/v1/graph/lab/${labId}/blind-spots` : "/api/v1/graph/blind-spots").then(r => r.data),
}

// ── Stats ─────────────────────────────────────────────────────────────────
export const statsApi = {
  get: () => api.get("/api/v1/stats/").then(r => r.data),
  dashboard: () => api.get("/api/v1/stats/dashboard").then(r => r.data),
}

// ── Корзина ──────────────────────────────────────────────────────────────
export const trashApi = {
  list: (entityType?: string) =>
    api.get("/api/v1/trash", { params: entityType ? { entity_type: entityType } : undefined }).then(r => r.data),
  restore: (entityType: string, id: number) => api.post(`/api/v1/${entityType}/${id}/restore`),
  purge: (entityType: string, id: number) => api.delete(`/api/v1/${entityType}/${id}/permanent`),
}

// ── Search ────────────────────────────────────────────────────────────────
export const searchApi = {
  search: (q: string) => api.get("/api/v1/search/", { params: { q } }).then(r => r.data),
}

// ── Sources ───────────────────────────────────────────────────────────────
export const sourceApi = {
  list: (entityType: string, entityId: number) =>
    api.get(`/api/v1/${entityType}/${entityId}/sources`).then(r => r.data),
  add: (entityType: string, entityId: number, url: string) =>
    api.post(`/api/v1/${entityType}/${entityId}/sources`, { url }).then(r => r.data),
  setVerdict: (entityType: string, entityId: number, docId: number, verdict: string) =>
    api.patch(`/api/v1/${entityType}/${entityId}/sources/${docId}/verdict`, { verdict }).then(r => r.data),
  delete: (entityType: string, entityId: number, docId: number) =>
    api.delete(`/api/v1/${entityType}/${entityId}/sources/${docId}`),
}

// ── Entity Images ─────────────────────────────────────────────────────────
export const imageApi = {
  list: (entityType: string, entityId: number) =>
    api.get(`/api/v1/${entityType}/${entityId}/images`).then(r => r.data),
  upload: (entityType: string, entityId: number, files: File[]) => {
    const fd = new FormData()
    files.forEach(f => fd.append("files", f))
    return api.post(`/api/v1/${entityType}/${entityId}/images`, fd, {
      headers: { "Content-Type": "multipart/form-data" },
    }).then(r => r.data)
  },
  delete: (entityType: string, entityId: number, imageId: number) =>
    api.delete(`/api/v1/${entityType}/${entityId}/images/${imageId}`),
}

// ── Sources Global ────────────────────────────────────────────────────────
export const sourceGlobalApi = {
  listAll: () =>
    api.get("/api/v1/sources/").then(r => r.data),
  edit: (docId: number, body: { verdict?: string; summary?: string }) =>
    api.patch(`/api/v1/sources/${docId}`, body).then(r => r.data),
  delete: (docId: number) =>
    api.delete(`/api/v1/sources/${docId}`),
}

// ── Messages ─────────────────────────────────────────────────────────────
export const messagesApi = {
  listConversations: () => api.get("/api/v1/messages/conversations").then(r => r.data),
  getConversation: (username: string) => api.get(`/api/v1/messages/conversations/${username}`).then(r => r.data),
  sendMessage: (username: string, content: string) =>
    api.post(`/api/v1/messages/conversations/${username}`, { content }).then(r => r.data),
  unreadCount: () => api.get("/api/v1/messages/unread-count").then(r => r.data),
  uploadImage: (file: File) => {
    const fd = new FormData()
    fd.append("file", file)
    return api.post("/api/v1/messages/upload-image", fd, {
      headers: { "Content-Type": "multipart/form-data" },
    }).then(r => r.data as { url: string })
  },
}

// ── Profile stats ────────────────────────────────────────────────────────
export const profileApi = {
  stats: (username: string, visibility?: string[], labId?: number | null) => {
    const params = new URLSearchParams()
    if (visibility && visibility.length > 0) params.set("visibility", visibility.join(","))
    if (labId) params.set("lab_id", String(labId))
    const qs = params.toString()
    return api.get(`/api/v1/users/${username}/stats${qs ? `?${qs}` : ""}`).then(r => r.data)
  },
  thinkingPatterns: () =>
    api.get("/api/v1/users/me/thinking-patterns").then(r => r.data),
}

// ── Feed ──────────────────────────────────────────────────────────────────
export interface FeedGroupsParams { page?: number; pageSize?: number; types?: string[]; topic?: string }
const groupsQuery = (p?: FeedGroupsParams) => ({ page: p?.page, page_size: p?.pageSize, types: p?.types?.join(","), topic: p?.topic })

export const feedApi = {
  repost: (d: { source_type: string; source_id: number; target_type: string; target: "personal" | "lab"; lab_id?: number | null; comment?: string; expected_check_date?: string }) =>
    api.post("/api/v1/feed/repost", d).then(r => r.data),
  groupsPublic: (params?: FeedGroupsParams) =>
    api.get("/api/v1/feed/groups/public", { params: groupsQuery(params) }).then(r => r.data),
  groupsLab: (labId: number, params?: FeedGroupsParams) =>
    api.get(`/api/v1/feed/groups/lab/${labId}`, { params: groupsQuery(params) }).then(r => r.data),
  graphTeaser: () => api.get("/api/v1/feed/public/graph-teaser").then(r => r.data),
  recentlyConfirmed: () => api.get("/api/v1/feed/public/recently-confirmed").then(r => r.data),
  groupEntity: (type: string, id: number) => api.get(`/api/v1/feed/groups/entity/${type}/${id}`).then(r => r.data),
}

// ── Labs ──────────────────────────────────────────────────────────────────
export const labApi = {
  signal: (labId: number) => api.get(`/api/v1/labs/${labId}/signal`).then(r => r.data),
  mine: () => api.get("/api/v1/labs").then(r => r.data),
  public: () => api.get("/api/v1/labs/public").then(r => r.data),
}

// ── Global Graph (публичный, read-only) ────────────────────────────────────
export const globalGraphApi = {
  all: () => api.get("/api/v1/graph/global/all").then(r => r.data),
  overview: () => api.get("/api/v1/graph/global").then(r => r.data),
  expand: (type: string) => api.get(`/api/v1/graph/global/expand/${type}`).then(r => r.data),
}

// ── Discussion (страница обсуждения записи ленты) ─────────────────────────
export const discussionApi = {
  comments: (type: string, id: number) => api.get(`/api/v1/comments/${type}/${id}`).then(r => r.data),
  post: (type: string, id: number, d: { content: string; stance?: string | null; parent_id?: number | null; source?: string | null }) =>
    api.post(`/api/v1/comments/${type}/${id}`, d).then(r => r.data),
}

// ── Repost comment ──────────────────────────────────────────────────────
export const commentRepostApi = {
  repost: (d: { comment_id: number; target_type: string; target: "personal" | "lab"; lab_id?: number | null; comment?: string; keep_attachments: boolean; expected_check_date?: string }) =>
    api.post("/api/v1/feed/repost-comment", d).then(r => r.data),
}

// ── Entity Attachments (файлы: код / документы / прочее) ──────────────────
export const attachmentApi = {
  list: (entityType: string, entityId: number) =>
    api.get(`/api/v1/${entityType}/${entityId}/attachments`).then(r => r.data),
  get: (attachmentId: number) =>
    api.get(`/api/v1/attachments/${attachmentId}`).then(r => r.data),
  // Файлы шлём по ОДНОМУ на запрос: nginx ограничивает размер запроса целиком
  // (client_max_body_size 20M), пачка из нескольких больших файлов получила бы 413.
  upload: (entityType: string, entityId: number, files: File[]) => {
    const fd = new FormData()
    files.forEach(f => fd.append("files", f))
    return api.post(`/api/v1/${entityType}/${entityId}/attachments`, fd, {
      headers: { "Content-Type": "multipart/form-data" },
    }).then(r => r.data)
  },
  delete: (entityType: string, entityId: number, attachmentId: number) =>
    api.delete(`/api/v1/${entityType}/${entityId}/attachments/${attachmentId}`),
  // Замена содержимого существующего вложения (тот же id, версия старого
  // содержимого сохраняется на бэкенде автоматически) — см. backend/app/api/v1/attachments.py.
  replaceFile: (entityType: string, entityId: number, attachmentId: number, file: File) => {
    const fd = new FormData()
    fd.append("file", file)
    return api.put(`/api/v1/${entityType}/${entityId}/attachments/${attachmentId}/file`, fd, {
      headers: { "Content-Type": "multipart/form-data" },
    }).then(r => r.data)
  },
  replaceText: (entityType: string, entityId: number, attachmentId: number, text_content: string, language?: string | null) =>
    api.put(`/api/v1/${entityType}/${entityId}/attachments/${attachmentId}/text`, {
      text_content, language: language ?? undefined,
    }).then(r => r.data),
  listVersions: (entityType: string, entityId: number, attachmentId: number) =>
    api.get(`/api/v1/${entityType}/${entityId}/attachments/${attachmentId}/versions`).then(r => r.data),
  restoreVersion: (entityType: string, entityId: number, attachmentId: number, versionId: number) =>
    api.post(`/api/v1/${entityType}/${entityId}/attachments/${attachmentId}/versions/${versionId}/restore`).then(r => r.data),
}
