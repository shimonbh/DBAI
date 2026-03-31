import { create } from 'zustand'
import type { ConnectionProfile, ConnectionFormData } from '@/types/connection'
import { connectionService } from '@/services/connectionService'

// ── Persist last-used connection across restarts ──────────────────────────────
const LAST_CONN_KEY = 'dbai_last_connection'
const getLastConn   = () => localStorage.getItem(LAST_CONN_KEY)
const setLastConn   = (id: string) => localStorage.setItem(LAST_CONN_KEY, id)
const clearLastConn = () => localStorage.removeItem(LAST_CONN_KEY)

interface ConnectionState {
  profiles: ConnectionProfile[]
  /** All currently open (live) connections */
  connectedIds: Set<string>
  /** The connection used for new queries / AI — must be a member of connectedIds */
  activeConnectionId: string | null
  connectingId: string | null   // id of the connection currently being established
  error: string | null

  loadProfiles: () => Promise<void>
  createProfile: (data: ConnectionFormData) => Promise<void>
  updateProfile: (id: string, data: ConnectionFormData) => Promise<void>
  deleteProfile: (id: string) => Promise<void>
  /** Open a new connection and make it the active one for queries. */
  connect: (id: string) => Promise<void>
  /** Close one specific connection. If it was active, promote another or set null. */
  disconnect: (id: string) => Promise<void>
  /** Switch which open connection is the active one for queries (no network call). */
  setActive: (id: string) => void
  clearError: () => void
}

export const useConnectionStore = create<ConnectionState>((set, get) => ({
  profiles:           [],
  connectedIds:       new Set<string>(),
  activeConnectionId: null,
  connectingId:       null,
  error:              null,

  loadProfiles: async () => {
    const profiles = await connectionService.getAll()
    set({ profiles })

    // 1. Re-hydrate connections the backend already has open (same process session)
    const stillConnected = profiles.filter(p => p.is_connected).map(p => p.id)
    if (stillConnected.length) {
      const connectedIds = new Set(stillConnected)
      const activeId = stillConnected.includes(getLastConn() ?? '')
        ? getLastConn()!
        : stillConnected[0]
      set({ connectedIds, activeConnectionId: activeId })
      return
    }

    // 2. Auto-reconnect last used connection
    const lastId = getLastConn()
    if (lastId && profiles.find(p => p.id === lastId)) {
      const tryConnect = async (attemptsLeft: number): Promise<void> => {
        try {
          await connectionService.connect(lastId)
          set(s => ({
            activeConnectionId: lastId,
            connectedIds: new Set([...s.connectedIds, lastId]),
            profiles: s.profiles.map(p => ({ ...p, is_connected: p.id === lastId })),
          }))
        } catch {
          if (attemptsLeft > 0) {
            await new Promise(r => setTimeout(r, 600))
            return tryConnect(attemptsLeft - 1)
          }
          clearLastConn()
        }
      }
      await tryConnect(1)
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
    // Disconnect first if open
    if (get().connectedIds.has(id)) {
      try { await connectionService.disconnect(id) } catch { /* ignore */ }
    }
    await connectionService.delete(id)
    const { activeConnectionId, connectedIds } = get()
    const nextConnected = new Set([...connectedIds].filter(c => c !== id))
    const nextActive = activeConnectionId === id
      ? ([...nextConnected][0] ?? null)
      : activeConnectionId
    set(s => ({
      profiles:           s.profiles.filter(p => p.id !== id),
      connectedIds:       nextConnected,
      activeConnectionId: nextActive,
    }))
    if (activeConnectionId === id) clearLastConn()
  },

  connect: async (id) => {
    set({ connectingId: id, error: null })
    try {
      await connectionService.connect(id)
      setLastConn(id)
      set(s => ({
        activeConnectionId: id,
        connectedIds:       new Set([...s.connectedIds, id]),
        connectingId:       null,
        profiles:           s.profiles.map(p =>
          p.id === id ? { ...p, is_connected: true } : p
        ),
      }))
    } catch (e: unknown) {
      set({ error: (e as Error).message, connectingId: null })
      throw e
    }
  },

  disconnect: async (id: string) => {
    try { await connectionService.disconnect(id) } catch { /* ignore */ }
    const { activeConnectionId, connectedIds } = get()
    const nextConnected = new Set([...connectedIds].filter(c => c !== id))
    const nextActive = activeConnectionId === id
      ? ([...nextConnected][0] ?? null)
      : activeConnectionId
    if (activeConnectionId === id) {
      nextActive ? setLastConn(nextActive) : clearLastConn()
    }
    set(s => ({
      connectedIds:       nextConnected,
      activeConnectionId: nextActive,
      profiles:           s.profiles.map(p =>
        p.id === id ? { ...p, is_connected: false } : p
      ),
    }))
  },

  setActive: (id: string) => {
    if (!get().connectedIds.has(id)) return
    setLastConn(id)
    set({ activeConnectionId: id })
  },

  clearError: () => set({ error: null }),
}))
