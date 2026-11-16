"use client"
import React from "react"
import { ImageAttachment } from "@/components/ui/image-attachment"
import { VideoAttachment } from "@/components/ui/video-attachment"
import { v2 } from "@/lib/theme"

/** Ширина колонки сообщений. Пузырь ограничен половиной колонки (.conv-entry в globals.css),
 *  поэтому развёрнутый ролик (320px + отступы) должен в эту половину помещаться. */
export const CONV_COLUMN_MAX_WIDTH = 760

export interface ConvEntryProps {
  mine: boolean
  authorName: string
  authorHref: string
  time: string
  text: string
  imageSrc?: string | null
  ytId?: string | null
  viId?: string | null
}

export function ConvEntry({ mine, authorName, authorHref, time, text, imageSrc, ytId, viId }: ConvEntryProps) {
  const accent = mine ? v2.teal : v2.violet
  const side = mine ? "flex-end" : "flex-start"
  const hasVideo = !!(ytId || viId)
  const timeEl = (
    <span style={{ fontFamily: v2.fontMono, color: v2.t3, textTransform: "none", letterSpacing: 0 }}>{time}</span>
  )
  const nameEl = (
    <a href={authorHref} className="conv-author-link" style={{ color: "inherit", textDecoration: "none" }}>{authorName}</a>
  )
  return (
    <div className={`conv-entry-row ${mine ? "you" : "them"}`} style={{ display: "flex", justifyContent: side, marginBottom: 20 }}>
      <div className="conv-entry" style={{
        padding: "11px 14px 10px", borderRadius: 12,
        background: "rgba(255,255,255,0.015)",
        border: `1px solid ${mine ? "rgba(77,207,166,0.28)" : "rgba(139,128,240,0.28)"}`,
        boxShadow: mine ? `inset -2px 0 0 ${v2.teal}` : `inset 2px 0 0 ${v2.violet}`,
      }}>
        <div style={{
          display: "flex", alignItems: "center", gap: 6, marginBottom: 5,
          fontSize: 9.5, letterSpacing: "0.06em", textTransform: "uppercase",
          color: accent, justifyContent: side,
        }}>
          {mine ? <>{timeEl}{nameEl}</> : <>{nameEl}{timeEl}</>}
        </div>
        {text && (
          <div style={{ fontSize: 13.5, lineHeight: 1.55, color: v2.t1, wordBreak: "break-word", whiteSpace: "pre-wrap", textAlign: mine ? "right" : "left", marginBottom: (imageSrc || hasVideo) ? 8 : 0 }}>
            {text}
          </div>
        )}
        {imageSrc && (
          <div style={{ display: "flex", justifyContent: side }}>
            <span className="conv-attachment-pin">
              <ImageAttachment src={imageSrc} accent={accent} caption={`${authorName} · ${time}`} />
            </span>
          </div>
        )}
        {hasVideo && (
          <div style={{ display: "flex", justifyContent: side }}>
            <VideoAttachment ytId={ytId} viId={viId} accent={accent} />
          </div>
        )}
      </div>
    </div>
  )
}
