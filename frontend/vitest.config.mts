import { defineConfig } from "vitest/config"
import { playwright } from "@vitest/browser-playwright"
import { fileURLToPath } from "node:url"
import path from "node:path"

// JSX преобразуется по tsconfig (jsx: react-jsx), плагин React не нужен;
// алиас "@" повторяет paths из tsconfig.
// Два проекта: unit (jsdom, быстро) и browser (реальный Chromium, нужен там,
// где важна раскладка: getBoundingClientRect, медиазапросы, ::before).
export default defineConfig({
  resolve: { alias: { "@": path.resolve(fileURLToPath(new URL(".", import.meta.url))) } },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          environment: "jsdom",
          setupFiles: ["./vitest.setup.ts"],
          include: ["**/*.test.{ts,tsx}"],
          exclude: ["node_modules/**", ".next/**", "**/*.browser.test.{ts,tsx}"],
        },
      },
      {
        extends: true,
        test: {
          name: "browser",
          include: ["**/*.browser.test.{ts,tsx}"],
          exclude: ["node_modules/**", ".next/**"],
          browser: {
            enabled: true,
            headless: true,
            provider: playwright(),
            instances: [{ browser: "chromium" }],
          },
        },
      },
    ],
  },
})
