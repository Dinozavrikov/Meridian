// Правило выбора формы множественного числа для русского языка (1/2-4/5+).
// Раньше жило только внутри labs/[id]/page.tsx как pluralizeMembers(),
// возвращавшее готовое русское слово напрямую (в обход t() — не
// переводилось на другие locale). Вынесено сюда как чистая функция,
// возвращающая только форму; конкретное слово каждый вызывающий берёт
// через t() с нужным ключом для each формы (см. labsPage.memberOne/.memberFew/.memberMany).
export function ruPluralForm(n: number): "one" | "few" | "many" {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return "one"
  if ([2, 3, 4].includes(mod10) && ![12, 13, 14].includes(mod100)) return "few"
  return "many"
}

const FORM_KEY = { one: "One", few: "Few", many: "Many" } as const
/** Ключ нужной формы слова при числе: base + One/Few/Many по правилам русского языка. */
export const pluralKey = (base: string, n: number): string => `${base}${FORM_KEY[ruPluralForm(n)]}`
