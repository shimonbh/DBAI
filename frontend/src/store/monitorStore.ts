import { create } from 'zustand'
import type { MetricsSnapshot } from '@/types/monitor'
import { theme } from '@/theme'

interface MonitorState {
  isOpen: boolean
  snapshots: MetricsSnapshot[]   // Rolling buffer
  wsConnected: boolean

  toggleMonitor: () => void
  appendSnapshot: (s: MetricsSnapshot) => void
  setWsConnected: (v: boolean) => void
  clear: () => void
}

export const useMonitorStore = create<MonitorState>((set) => ({
  isOpen: false,
  snapshots: [],
  wsConnected: false,

  toggleMonitor: () => set(s => ({ isOpen: !s.isOpen })),

  appendSnapshot: (snapshot) =>
    set(s => {
      const next = [...s.snapshots, snapshot]
      // Keep rolling buffer at configured size
      if (next.length > theme.monitorBufferSize) next.shift()
      return { snapshots: next }
    }),

  setWsConnected: (v) => set({ wsConnected: v }),
  clear: () => set({ snapshots: [], wsConnected: false }),
}))
