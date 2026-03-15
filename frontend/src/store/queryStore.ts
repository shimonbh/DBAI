import { create } from 'zustand'
import type { QueryHistoryEntry, SavedQuery } from '@/types/query'
import { queryService } from '@/services/queryService'

interface QueryState {
  history: QueryHistoryEntry[]
  saved: SavedQuery[]
  isLoading: boolean

  loadHistory: (connectionId: string) => Promise<void>
  searchHistory: (connectionId: string, q: string) => Promise<void>
  loadSaved: (connectionId?: string) => Promise<void>
  saveQuery: (data: Partial<SavedQuery>) => Promise<SavedQuery>
  updateSaved: (id: string, data: Partial<SavedQuery>) => Promise<void>
  deleteHistory: (connectionId: string, id: string) => Promise<void>
  deleteSaved: (id: string) => Promise<void>
}

export const useQueryStore = create<QueryState>((set, get) => ({
  history: [],
  saved: [],
  isLoading: false,

  loadHistory: async (connectionId) => {
    set({ isLoading: true })
    try {
      const history = await queryService.getHistory(connectionId)
      set({ history, isLoading: false })
    } catch {
      set({ isLoading: false })
    }
  },

  searchHistory: async (connectionId, q) => {
    if (!q.trim()) { return get().loadHistory(connectionId) }
    const history = await queryService.searchHistory(connectionId, q)
    set({ history })
  },

  loadSaved: async (connectionId) => {
    const saved = await queryService.getSaved(connectionId)
    set({ saved })
  },

  saveQuery: async (data) => {
    const saved = await queryService.saveQuery(data)
    set(s => ({ saved: [...s.saved, saved] }))
    return saved
  },

  updateSaved: async (id, data) => {
    const updated = await queryService.updateSaved(id, data)
    set(s => ({ saved: s.saved.map(q => q.id === id ? updated : q) }))
  },

  deleteHistory: async (connectionId, id) => {
    await queryService.deleteHistory(connectionId, id)
    set(s => ({ history: s.history.filter(h => h.id !== id) }))
  },

  deleteSaved: async (id) => {
    await queryService.deleteSaved(id)
    set(s => ({ saved: s.saved.filter(q => q.id !== id) }))
  },
}))
