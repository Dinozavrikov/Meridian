// Версия продукта для подвала. Значение подставляет сборка (next.config.ts читает package.json),
// поэтому править ее нужно только через scripts/release.sh.
export function appVersion(): string {
  return process.env.NEXT_PUBLIC_APP_VERSION || "dev"
}
