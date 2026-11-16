// Общий словарь типов влияния для связи "сущность → убеждение".
// Подписи лежат в словаре i18n (ключи labelKey/descKey), текст в компонентах получают через influenceOptions(t).
// Это НЕ то же самое, что getLinkTypes() (подтверждает/опровергает/связано): для убеждения связь семантически другая.
export interface WorldviewInfluenceOption {
  value: string
  labelKey: string
  descKey: string
  color: string
  pulse?: boolean
}

export const WORLDVIEW_INFLUENCE: WorldviewInfluenceOption[] = [
  { value: "strengthens", labelKey: "influence.strengthens.label", descKey: "influence.strengthens.desc", color: "#A3E635" },
  { value: "challenges",  labelKey: "influence.challenges.label",  descKey: "influence.challenges.desc",  color: "#E84393", pulse: true },
  { value: "transforms",  labelKey: "influence.transforms.label",  descKey: "influence.transforms.desc",  color: "#22D3EE" },
  { value: "contradicts", labelKey: "influence.contradicts.label", descKey: "influence.contradicts.desc", color: "#E74C3C", pulse: true },
]

export interface InfluenceOption { value: string; label: string; desc: string; color: string; pulse?: boolean }

/** Влияния с уже переведёнными подписями: форма, которую читают потребители (value/label/color + desc/pulse). */
export function influenceOptions(t: (key: string) => string): InfluenceOption[] {
  return WORLDVIEW_INFLUENCE.map(i => ({ value: i.value, label: t(i.labelKey), desc: t(i.descKey), color: i.color, pulse: i.pulse }))
}

/** Пункты легенды графа для влияний, которые реально есть среди рёбер: [цвет, ключ подписи], в порядке словаря. */
export function influenceLegendFor(edges: { linkType?: string }[]): [string, string][] {
  return WORLDVIEW_INFLUENCE.filter(i => edges.some(e => e.linkType === i.value)).map(i => [i.color, i.labelKey])
}