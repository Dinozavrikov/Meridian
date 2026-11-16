"use client"
import type { CSSProperties } from "react"
import { ImagesTab } from "@/components/entities/images-tab"
import { AttachmentsSection } from "@/components/entities/attachments-section"
import { theme } from "@/lib/theme"
import { useT } from "@/lib/i18n/useT"

/** Вкладка «Файлы»: картинки (EntityImage, свой пайплайн) и вложения
 * (EntityAttachment: код/документы/прочее) — две разные таблицы, объединены
 * только здесь, на фронте. Идентификатор вкладки на страницах остаётся "images". */
export function FilesTab({ entityType, entityId, isOwner = true }: {
  entityType: string
  entityId: number
  isOwner?: boolean
}) {
  const t = useT()
  const heading: CSSProperties = { fontSize: 12, letterSpacing: 0.4, color: theme.tx3, padding: "14px 20px 0" }
  return (
    <div>
      <div style={heading}>{t("filesTab.imagesHeading")}</div>
      <ImagesTab entityType={entityType} entityId={entityId} isOwner={isOwner} />
      <div style={heading}>{t("filesTab.filesHeading")}</div>
      <AttachmentsSection entityType={entityType} entityId={entityId} isOwner={isOwner} />
    </div>
  )
}
