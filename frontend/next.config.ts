import type { NextConfig } from "next";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Версия продукта: единственный источник — frontend/package.json (ее поднимает scripts/release.sh).
const { version } = JSON.parse(
  readFileSync(join(process.cwd(), "package.json"), "utf8"),
) as { version: string };

const nextConfig: NextConfig = {
  allowedDevOrigins: ["miridin.com"],
  devIndicators: false,
  env: { NEXT_PUBLIC_APP_VERSION: version },
};

export default nextConfig;
