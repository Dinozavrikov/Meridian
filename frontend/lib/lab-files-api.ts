import { labKeys } from "@/lib/lab-queries"
import { api } from "@/lib/api"

// Контракт: GET /api/v1/labs/{id}/files (backend/app/api/v1/labs.py, backend/docs/ACCESS_POLICY.md).
export interface LabFile {
  kind: "attachment" | "image"
  id: number
  name: string
  file_kind: string
  mime_type: string | null
  size_bytes: number | null
  created_at: string
  entity_type: string
  entity_id: number
  entity_title: string
  uploader_id: number
  uploader_username: string | null
  download_url: string | null // вложения качаются через авторизованный эндпоинт
  url: string | null // картинки лежат в статике
  thumb_url: string | null
}

export interface LabFilesResponse { items: LabFile[]; count: number; truncated: boolean; total_bytes: number }

export const labFilesKey = labKeys.files

export const labFilesApi = {
  list: (labId: number) => api.get(`/api/v1/labs/${labId}/files`).then(r => r.data as LabFilesResponse),
}
