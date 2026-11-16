"use client"
// Окно «Привязать существующее» для вкладок наблюдений, гипотез и прогнозов: тонкая обёртка над LinkExistingModal
// (раньше здесь жила его копия). Для пары записей одного типа «подтверждает/опровергает» не предлагаем.
import { LinkExistingModal } from "@/components/entities/link-existing-modal"
import { getLinkTypes } from "@/components/entities/link-types"
import { linkTypesFor } from "@/lib/link-vocab"
import { influenceOptions } from "@/lib/worldview-influence"
import { useT } from "@/lib/i18n/useT"

export function LinkModal({ entityType, entityId, onClose, onlyType }: {
  entityType: string; entityId: number; onClose: () => void; onlyType: string
}) {
  const t = useT()
  return (
    <LinkExistingModal entityType={entityType} entityId={entityId} onlyType={onlyType}
      linkTypes={linkTypesFor(getLinkTypes(t), entityType, onlyType, influenceOptions(t))} defaultLinkType="связано" onClose={onClose} />
  )
}
