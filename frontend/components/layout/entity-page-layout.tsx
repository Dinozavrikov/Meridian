"use client"
import React from "react"
import { Header } from "./header"
import { PageShell, PageContent } from "./page-shell"

interface EntityPageLayoutProps {
  title: string
  color?: string
  icon?: React.ReactNode
  actions?: React.ReactNode
  children: React.ReactNode
}

export function EntityPageLayout({
  title, color, icon, actions, children
}: EntityPageLayoutProps) {
  return (
    <PageShell>
      <Header title={title} color={color} icon={icon} actions={actions} />
      <PageContent noPadding overflow="auto">
        <div style={{
          minHeight: "100%",
          display: "flex",
          flexDirection: "column",
        }}>
          <div style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
            {children}
          </div>
        </div>
      </PageContent>
    </PageShell>
  )
}
