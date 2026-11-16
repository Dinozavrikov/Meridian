/** Типы связи «подтверждает / опровергает / связано»: цвет и подпись. Отдельный модуль без React-зависимостей,
 *  чтобы менеджер связей, панель и формы быстрого добавления не импортировали друг друга по кругу. */
import { theme } from "@/lib/theme"
export function getLinkTypes(t: (key: string) => string) {
  return [
    { value: "подтверждает", label: t("linkType.confirms"), color: "#2ECC71" },
    { value: "опровергает",  label: t("linkType.refutes"),  color: "#E74C3C" },
    { value: "связано",      label: t("linkType.related"),  color: theme.edgeNeutral },
  ]
}
