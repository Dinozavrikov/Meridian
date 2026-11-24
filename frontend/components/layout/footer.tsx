"use client"
import { useT } from "@/lib/i18n/useT"
import { appVersion } from "@/lib/version"
import { REPO_URL, EXTERNAL_LINK_PROPS } from "@/lib/project-links"

type FooterLink = { label: string; href: string; external?: boolean }
const extProps = (l: FooterLink) => (l.external ? EXTERNAL_LINK_PROPS : {})

const YEAR = new Date().getFullYear()

export function Footer() {
  const t = useT()
  const statusLabel = t("footer.status")
  const LINKS: Record<"product" | "support" | "legal", FooterLink[]> = {
    product: [
      { label: t("footer.link.features"), href: "/features" },
      { label: t("footer.link.roadmap"), href: "/roadmap" },
    ],
    support: [
      { label: t("footer.link.docs"), href: "/docs" },
      { label: t("footer.link.support"), href: "/support" },
      { label: t("footer.link.source"), href: REPO_URL, external: true },
    ],
    legal: [
      { label: t("footer.link.privacy"), href: "/privacy" },
      { label: t("footer.link.terms"), href: "/terms" },
    ],
  }

  return (
    <>
      <style>{`
        @keyframes pulse-dot {
          0%, 100% { opacity: 1; box-shadow: 0 0 0 0 rgba(29,158,117,0.4); }
          50% { opacity: 0.8; box-shadow: 0 0 0 4px rgba(29,158,117,0); }
        }
        .footer-link {
          font-size: 13px;
          color: #606080;
          text-decoration: none;
          cursor: pointer;
          transition: color 0.15s;
          padding: 2px 0;
          position: relative;
          letter-spacing: 0.01em;
        }
        .footer-link::after {
          content: '';
          position: absolute;
          bottom: -1px;
          left: 0;
          width: 0;
          height: 1px;
          background: #4A90D9;
          transition: width 0.2s ease;
        }
        .footer-link:hover { color: #9090c8; }
        .footer-link:hover::after { width: 100%; }
        .footer-status-dot {
          display: inline-block;
          width: 6px; height: 6px;
          border-radius: 50%;
          background: #1D9E75;
          animation: pulse-dot 2.5s ease-in-out infinite;
          flex-shrink: 0;
        }
      `}</style>
      <footer className="app-footer" style={{
        background: "transparent",
        borderTop: "1px solid transparent",
        backgroundImage: "linear-gradient(to right, transparent, #4A90D920 30%, #4A90D920 70%, transparent), linear-gradient(to right, #ffffff04, #ffffff04)",
        backgroundOrigin: "border-box",
        backgroundClip: "border-box",
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        justifyContent: "center",
        gap: 16,
        position: "relative",
      }}>
        <div style={{
          position: "absolute", top: 0, left: "10%", right: "10%", height: "1px",
          background: "linear-gradient(to right, transparent, #4A90D930, #7070c020, #4A90D930, transparent)",
        }} />

        <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
          <div style={{
            width: 28, height: 28, borderRadius: 8,
            background: "linear-gradient(135deg, #4A90D915, #7070c010)",
            border: "1px solid #4A90D925",
            display: "flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0,
            boxShadow: "0 0 12px #4A90D910",
          }}>
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
              <path d="M6.5 1L12 6.5L6.5 12L1 6.5L6.5 1Z" stroke="#4A90D9" strokeWidth="1.2" fill="none" strokeLinejoin="round"/>
              <path d="M6.5 3.5L9.5 6.5L6.5 9.5L3.5 6.5L6.5 3.5Z" fill="#4A90D930" stroke="#4A90D960" strokeWidth="0.8" strokeLinejoin="round"/>
            </svg>
          </div>
          <div>
            <div style={{
              fontSize: 13, fontWeight: 700,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "#e8e8f0",
              lineHeight: 1.1,
            }}>
              <span>MER</span><span style={{ color: "#1D9E75" }}>I</span><span>DIAN</span>
            </div>
            <div style={{
              fontSize: 11, color: "#888897",
              letterSpacing: "0.02em",
              marginTop: 2,
              lineHeight: 1,
            }}>{t("footer.tagline")}</div>
          </div>
        </div>

        <nav style={{ display: "flex", alignItems: "center", gap: 0, flexWrap: "wrap", justifyContent: "center" }}>
          {(() => {
            const groups = [LINKS.product, LINKS.support, LINKS.legal]
            return groups.map((group, gi) => (
              <span key={gi} style={{ display: "flex", alignItems: "center" }}>
                {group.map((l, li) => (
                  <span key={l.label} style={{ display: "flex", alignItems: "center" }}>
                    <a href={l.href} {...extProps(l)} className="footer-link">{l.label}</a>
                    {li < group.length - 1 && (
                      <span style={{ color: "#9999a1", margin: "0 8px", fontSize: 10 }}>·</span>
                    )}
                  </span>
                ))}
                {gi < groups.length - 1 && (
                  <span style={{
                    width: 1, height: 10, background: "#1e1e2e",
                    margin: "0 16px", display: "inline-block", flexShrink: 0,
                  }} />
                )}
              </span>
            ))
          })()}
        </nav>

        <div className="app-footer-right" style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", justifyContent: "center" }}>
          <div style={{
            display: "flex", alignItems: "center", gap: 6,
            background: "#1D9E7510",
            border: "1px solid #1D9E7522",
            borderRadius: 6, padding: "4px 10px",
          }}>
            <span className="footer-status-dot" />
            <span style={{ fontSize: 12, color: "#1D9E75", fontWeight: 500, letterSpacing: "0.02em" }}>
              {statusLabel}
            </span>
          </div>
          <div style={{
            display: "flex", alignItems: "center", gap: 1,
            background: "#ffffff05", border: "1px solid #ffffff08",
            borderRadius: 5, padding: "3px 7px",
          }}>
            <span style={{ fontSize: 12, color: "#9696a2", fontFamily: "monospace", letterSpacing: "0.06em" }}>v{appVersion()}</span>
          </div>
          <span style={{ fontSize: 12, color: "#9898a2", letterSpacing: "0.02em" }}>© {YEAR}</span>
        </div>
      </footer>
    </>
  )
}
