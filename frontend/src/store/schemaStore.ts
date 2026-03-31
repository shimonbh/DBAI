import { create } from 'zustand'
import type { SchemaDatabase } from '@/types/schema'
import { schemaService } from '@/services/schemaService'

export interface SchemaEntry {
  databases:     SchemaDatabase[]
  isLoading:     boolean
  expandedNodes: Set<string>
}

const defaultEntry = (): SchemaEntry => ({
  databases:     [],
  isLoading:     false,
  expandedNodes: new Set(),
})

interface SchemaState {
  /** Map from connectionId → its schema entry */
  schemas: Record<string, SchemaEntry>

  loadSchema:    (connectionId: string) => Promise<void>
  refreshSchema: (connectionId: string) => Promise<void>
  clearSchema:   (connectionId: string) => void
  toggleNode:    (connectionId: string, nodeId: string) => void
}

// ── Helper: auto-expand first DB + Tables category ───────────────────────────
function autoExpand(dbs: SchemaDatabase[]): Set<string> {
  const first = dbs[0]?.name
  return new Set<string>(first ? [`db:${first}`, `cat:${first}:tables`] : [])
}

// ── Helper: update a single entry inside the map ─────────────────────────────
function patchEntry(
  schemas: Record<string, SchemaEntry>,
  id: string,
  patch: Partial<SchemaEntry>,
): Record<string, SchemaEntry> {
  return {
    ...schemas,
    [id]: { ...(schemas[id] ?? defaultEntry()), ...patch },
  }
}

export const useSchemaStore = create<SchemaState>((set, get) => ({
  schemas: {},

  loadSchema: async (connectionId) => {
    set(s => ({ schemas: patchEntry(s.schemas, connectionId, { isLoading: true }) }))
    try {
      const tree = await schemaService.getSchema(connectionId)
      const dbs  = tree.databases || []
      set(s => ({
        schemas: patchEntry(s.schemas, connectionId, {
          databases:     dbs,
          isLoading:     false,
          expandedNodes: autoExpand(dbs),
        }),
      }))
    } catch {
      set(s => ({ schemas: patchEntry(s.schemas, connectionId, { isLoading: false }) }))
    }
  },

  refreshSchema: async (connectionId) => {
    set(s => ({ schemas: patchEntry(s.schemas, connectionId, { isLoading: true }) }))
    try {
      const tree = await schemaService.refreshSchema(connectionId)
      const dbs  = tree.databases || []
      set(s => ({
        schemas: patchEntry(s.schemas, connectionId, {
          databases:     dbs,
          isLoading:     false,
          expandedNodes: autoExpand(dbs),
        }),
      }))
    } catch {
      set(s => ({ schemas: patchEntry(s.schemas, connectionId, { isLoading: false }) }))
    }
  },

  clearSchema: (connectionId) => {
    set(s => {
      const next = { ...s.schemas }
      delete next[connectionId]
      return { schemas: next }
    })
  },

  toggleNode: (connectionId, nodeId) => {
    set(s => {
      const entry = s.schemas[connectionId] ?? defaultEntry()
      const next  = new Set(entry.expandedNodes)
      next.has(nodeId) ? next.delete(nodeId) : next.add(nodeId)
      return { schemas: patchEntry(s.schemas, connectionId, { expandedNodes: next }) }
    })
  },
}))
