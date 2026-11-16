// Образец ответа /meta/privacy-facts для тестов страницы приватности (форму закрепляет tests/test_privacy_facts.py).
import type { PrivacyFacts } from "@/lib/privacy"

export const FACTS: PrivacyFacts = {
  session: { access_minutes: 15, refresh_days: 30 },
  reset_link_minutes: 15,
  google_state_minutes: 10,
  cookies: [
    { name: "access_token", purpose: "access", ttl_seconds: 900 },
    { name: "refresh_token", purpose: "refresh", ttl_seconds: 2592000 },
    { name: "google_oauth_state", purpose: "oauth_state", ttl_seconds: 600 },
  ],
}
