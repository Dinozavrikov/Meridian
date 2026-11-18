/**
 * Реквизиты для поддержки проекта: единый источник для страницы /support.
 * Те же значения лежат в .github/FUNDING.yml и в README; lib/support.test.ts следит, чтобы они не разошлись.
 */
export const YOOMONEY_URL = "https://yoomoney.ru/to/4100118892485316"
export const CLOUDTIPS_URL = "https://pay.cloudtips.ru/p/d6f0acf8"

export const CARD_METHODS = [
  { id: "yoomoney", url: YOOMONEY_URL, nameKey: "support.method.yoomoney.name", descKey: "support.method.yoomoney.desc" },
  { id: "cloudtips", url: CLOUDTIPS_URL, nameKey: "support.method.cloudtips.name", descKey: "support.method.cloudtips.desc" },
] as const

export const CRYPTO = [
  { id: "btc", symbol: "BTC", nameKey: "support.crypto.btc", address: "19uURkCzLR7XTd7LAReMTQrfEh8AA1d9zk" },
  { id: "eth", symbol: "ETH", nameKey: "support.crypto.eth", address: "0xd217E1591799C41Ca45F6496958d26dc3740b5f8" },
  { id: "ltc", symbol: "LTC", nameKey: "support.crypto.ltc", address: "LSyYMor5HHWtH52vFPJ8aPVdaEV74EJHf6" },
] as const
