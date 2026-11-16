"use client"
import { useCallback, useEffect, useRef, useState } from "react"
import { API_BASE_URL } from "@/lib/api"

export type PresenceState = "offline" | "online" | "typing"

const HEARTBEAT_MS = 20_000
const RECONNECT_BASE_MS = 1_000
const RECONNECT_MAX_MS = 15_000

/**
 * Один сокет на открытый диалог. Аутентификация идёт через access_token
 * cookie — тот же механизм, что и у обычных REST-запросов через axios,
 * никакого отдельного токена передавать не нужно: браузер сам приложит
 * cookie к WebSocket-хендшейку.
 */
export function usePresence(otherUsername: string | undefined) {
  const [peerOnline, setPeerOnline] = useState(false)
  const [peerTyping, setPeerTyping] = useState(false)

  const wsRef = useRef<WebSocket | null>(null)
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const reconnectAttempt = useRef(0)
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const closedByClient = useRef(false)

  const connect = useCallback(() => {
    if (!otherUsername) return
    const wsOrigin = API_BASE_URL.replace(/^http/, "ws")
    const ws = new WebSocket(`${wsOrigin}/api/v1/ws/presence/${otherUsername}`)
    wsRef.current = ws

    ws.onopen = () => {
      reconnectAttempt.current = 0
      heartbeatRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "ping" }))
      }, HEARTBEAT_MS)
    }

    ws.onmessage = (event) => {
      let msg: any
      try { msg = JSON.parse(event.data) } catch { return }
      if (msg.type === "presence") setPeerOnline(!!msg.online)
      else if (msg.type === "typing") setPeerTyping(true)
      else if (msg.type === "stop_typing") setPeerTyping(false)
    }

    ws.onclose = () => {
      if (heartbeatRef.current) clearInterval(heartbeatRef.current)
      setPeerOnline(false)
      setPeerTyping(false)
      if (closedByClient.current) return
      const delay = Math.min(RECONNECT_BASE_MS * 2 ** reconnectAttempt.current, RECONNECT_MAX_MS)
      reconnectAttempt.current += 1
      reconnectTimer.current = setTimeout(connect, delay)
    }

    ws.onerror = () => ws.close()
  }, [otherUsername])

  useEffect(() => {
    closedByClient.current = false
    connect()
    return () => {
      closedByClient.current = true
      if (heartbeatRef.current) clearInterval(heartbeatRef.current)
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current)
      wsRef.current?.close()
    }
  }, [connect])

  const setTyping = useCallback((isTyping: boolean) => {
    const ws = wsRef.current
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: isTyping ? "typing" : "stop_typing" }))
    }
  }, [])

  const presence: PresenceState = peerTyping ? "typing" : peerOnline ? "online" : "offline"
  return { presence, peerOnline, peerTyping, setTyping }
}
