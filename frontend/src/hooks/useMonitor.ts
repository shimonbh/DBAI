import { useEffect } from 'react'
import { connectMonitorWS } from '@/services/monitorService'
import { useMonitorStore } from '@/store/monitorStore'

/**
 * Opens a WebSocket to the monitor endpoint for the given connection.
 * Automatically cleans up on unmount or when connectionId changes.
 */
export function useMonitor(connectionId: string | null) {
  const { appendSnapshot, setWsConnected, clear } = useMonitorStore()

  useEffect(() => {
    if (!connectionId) return

    setWsConnected(false)
    const close = connectMonitorWS(
      connectionId,
      (snapshot) => {
        setWsConnected(true)
        appendSnapshot(snapshot)
      },
      () => setWsConnected(false),
    )

    return () => {
      close()
      clear()
    }
  }, [connectionId])
}
