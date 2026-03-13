import { create } from 'zustand'
import type { ConnectionProfile, ConnectionFormData } from '@/types/connection'
import { connectionService } from '@/services/connectionService'

// ── Persist last-used connection across restarts ──────────────────────────────
const LAST_CONN_KEY  = 'dbai_last_connection'
const getLastConn    = () => localStorage.getItem(LAST_CONN_KEY)
const setLastConn    = (id: string) => localStorage.setItem(LAST_CONN_KEY, id)
const clearLastConn  = () => localStorage.removeItem(LAST_CONN_KEY)

interface ConnectionState {
  profiles: ConnectionProfile[]
  activeConnectionId: string | null
  isConnecting: boolean
  error: string | null

  loadProfiles: () => Promise<void>
  createProfile: (data: ConnectionFormData) => Promise<void>
  updateProfile: (id: string, data: ConnectionFormData) => Promise<void>
  deleteProfile: (id: string) => Promise<void>
  connect: (id: string) => Promise<void>
  disconnect: () => Promise<void>
  clearError: () => void
}

export const useConnectionStore = create<ConnectionState>((set, get) => ({
  profiles: [],
  activeConnectionId: null,
  isConnecting: false,
  error: null,

  loadProfiles: async () => {
    const profiles = await connectionService.getAll()
    set({ profiles })

    // 1. If the backend already has an active connection (same process session), keep it
    const stillActive = profiles.find(p => p.is_connected)
    if (stillActive) {
      set({ activeConnectionId: stillActive.id })
      return
    }

    // 2. Auto-reconnect the last used connection (persisted in localStorage)
    const lastId = getLastConn()
    if (lastId && profiles.find(p => p.id === lastId)) {
      try {
        await connectionService.connect(lastId)
        set(s => ({
          activeConnectionId: lastId,
          profiles: s.profiles.map(p => ({ ...p, is_connected: p.id === lastId })),
        }))
      } catch {
        // DB unavailable / moved — clear stored ID, let user connect manually
        clearLastConn()
      }
    }
  },

  createProfile: async (data) => {
    const profile = await connectionService.create(data)
    set(s => ({ profiles: [...s.profiles, profile] }))
  },

  updateProfile: async (id, data) => {
    const updated = await connectionService.update(id, data)
    set(s => ({ profiles: s.profiles.map(p => p.id === id ? updated : p) }))
  },

  deleteProfile: async (id) => {
    await connectionService.delete(id)
    if (get().activeConnectionId === id) {
      clearLastConn()
      set({ activeConnectionId: null })
    }
    set(s => ({ profiles: s.profiles.filter(p => p.id !== id) }))
  },

  connect: async (id) => {
    set({ isConnecting: true, error: null })
    try {
      await connectionService.connect(id)
      setLastConn(id)          // Remember for next app startup
      set(s => ({
        activeConnectionId: id,
        isConnecting: false,
        profiles: s.profiles.map(p => ({ ...p, is_connected: p.id === id })),
      }))
    } catch (e: unknown) {
      set({ error: (e as Error).message, isConnecting: false })
      throw e
    }
  },

  disconnect: async () => {
    const id = get().activeConnectionId
    if (!id) return
    await connectionService.disconnect(id)
    clearLastConn()             // Don't auto-reconnect after explicit disconnect
    set(s => ({
      activeConnectionId: null,
      profiles: s.profiles.map(p => ({ ...p, is_connected: false })),
    }))
  },

  clearError: () => set({ error: null }),
}))
