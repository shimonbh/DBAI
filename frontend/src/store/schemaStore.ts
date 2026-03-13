import { create } from 'zustand'
import type { SchemaDatabase } from '@/types/schema'
import { schemaService } from '@/services/schemaService'

interface SchemaState {
  databases: SchemaDatabase[]
  isLoading: boolean
  selectedDatabase: string | null
  expandedNodes: Set<string>

  loadSchema: (connectionId: string) => Promise<void>
  refreshSchema: (connectionId: string) => Promise<void>
  selectDatabase: (name: string) => void
  toggleNode: (nodeId: string) => void
  clearSchema: () => void
}

export const useSchemaStore = create<SchemaState>((set) => ({
  databases: [],
  isLoading: false,
  selectedDatabase: null,
  expandedNodes: new Set(),

  loadSchema: async (connectionId) => {
    set({ isLoading: true })
    try {
      const tree = await schemaService.getSchema(connectionId)
      const dbs = tree.databases || []
      // Auto-expand the first database + its Tables category
      const first = dbs[0]?.name
      const autoExpanded = new Set<string>(
        first ? [`db:${first}`, `cat:${first}:tables`] : []
      )
      set({
        databases: dbs,
        selectedDatabase: dbs[0]?.name ?? null,
        expandedNodes: autoExpanded,
        isLoading: false,
      })
    } catch {
      set({ isLoading: false })
    }
  },

  refreshSchema: async (connectionId) => {
    set({ isLoading: true })
    try {
      const tree = await schemaService.refreshSchema(connectionId)
      const dbs = tree.databases || []
      const first = dbs[0]?.name
      const autoExpanded = new Set<string>(
        first ? [`db:${first}`, `cat:${first}:tables`] : []
      )
      set({ databases: dbs, expandedNodes: autoExpanded, isLoading: false })
    } catch {
      set({ isLoading: false })
    }
  },

  selectDatabase: (name) => set({ selectedDatabase: name }),

  toggleNode: (nodeId) =>
    set(s => {
      const next = new Set(s.expandedNodes)
      next.has(nodeId) ? next.delete(nodeId) : next.add(nodeId)
      return { expandedNodes: next }
    }),

  clearSchema: () => set({ databases: [], selectedDatabase: null, expandedNodes: new Set() }),
}))
