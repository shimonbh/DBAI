import type { MetricsSnapshot } from '@/types/monitor'

/**
 * WebSocket client for the live monitor stream.
 * Returns a cleanup function to close the connection.
 */
export function connectMonitorWS(
  connectionId: string,
  onMetrics: (snapshot: MetricsSnapshot) => void,
  onError?: (err: Event) => void,
): () => void {
  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
  const host = window.location.host
  const url = `${protocol}://${host}/ws/${connectionId}`

  const ws = new WebSocket(url)

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data) as MetricsSnapshot
      onMetrics(data)
    } catch {
      /* ignore malformed messages */
    }
  }

  ws.onerror = (e) => onError?.(e)

  // Keep-alive ping every 30s
  const pingInterval = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) ws.send('ping')
  }, 30_000)

  return () => {
    clearInterval(pingInterval)
    ws.close()
  }
}
