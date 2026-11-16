// frontend/lib/entity-submit.ts
//
// Единый контракт onSave у общих форм сущностей (ObservationForm, PredictionForm, ...):
// тело записи + то, что можно создать только ПОСЛЕ появления id (связи, галерея,
// inline-картинки из редактора, у которых пока blob-url).
import type { PendingLink } from "@/components/entities/entity-link-picker"

export interface EntitySubmit {
  data: Record<string, any>
  links: PendingLink[]
  images: File[]
  pendingFiles: Map<string, File>
}
