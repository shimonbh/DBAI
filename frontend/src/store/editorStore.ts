import { create } from 'zustand'
import type { EditorTab, QueryResult } from '@/types/query'
import type { AnalysisResult } from '@/types/ai'
import { queryService } from '@/services/queryService'
import { aiService } from '@/services/aiService'
import { stripSqlHeader } from '@/utils/sqlHeader'
import { theme } from '@/theme'

let _tabCounter = 1

/** Module-level AbortController — lives outside Zustand (non-serialisable). */
let _abortCtrl: AbortController | null = null

interface EditorState {
  tabs: EditorTab[]
  activeTabId: string
  inlineSuggestion: string | null
  analysisResult: AnalysisResult | null
  isAnalyzing: boolean
  isGenerating: boolean
  isExecuting: boolean
  queryLimit: number

  openTab: (sql?: string, title?: string) => string
  closeTab: (tabId: string) => void
  moveTab: (fromIdx: number, toIdx: number) => void
  closeTabsToRight: (tabId: string) => void
  closeOtherTabs: (tabId: string) => void
  setActiveTab: (tabId: string) => void
  updateTabSql: (tabId: string, sql: string) => void
  updateTabDatabase: (tabId: string, db: string | null) => void
  setInlineSuggestion: (text: string | null) => void
  acceptSuggestion: (tabId: string) => void
  setResult: (tabId: string, result: QueryResult) => void
  clearResult: (tabId: string) => void
  setAnalysis: (result: AnalysisResult | null) => void
  setQueryLimit: (limit: number) => void

  executeQuery: (connectionId: string) => Promise<void>
  executeQueryText: (connectionId: string, sql: string) => Promise<void>
  cancelQuery: () => void
  generateFullQuery: (connectionId: string) => Promise<void>
  generateTextToSQL: (connectionId: string, description: string) => Promise<void>
  analyzeQuery: (connectionId: string) => Promise<void>
}

const _newTab = (sql = '', title?: string): EditorTab => ({
  id: `tab-${_tabCounter++}`,
  title: title ?? `Query ${_tabCounter - 1}`,
  sql,
  result: null,
  isDirty: false,
  selectedDatabase: null,
})

export const useEditorStore = create<EditorState>((set, get) => {
  const firstTab = _newTab()

  return {
    tabs: [firstTab],
    activeTabId: firstTab.id,
    inlineSuggestion: null,
    analysisResult: null,
    isAnalyzing: false,
    isGenerating: false,
    isExecuting: false,
    queryLimit: theme.queryLimit,

    openTab: (sql = '', title) => {
      const tab = _newTab(sql, title)
      set(s => ({ tabs: [...s.tabs, tab], activeTabId: tab.id }))
      return tab.id
    },

    closeTab: (tabId) =>
      set(s => {
        const remaining = s.tabs.filter(t => t.id !== tabId)
        if (!remaining.length) {
          const fresh = _newTab()
          return { tabs: [fresh], activeTabId: fresh.id }
        }
        const activeId = s.activeTabId === tabId
          ? remaining[remaining.length - 1].id
          : s.activeTabId
        return { tabs: remaining, activeTabId: activeId }
      }),

    moveTab: (fromIdx, toIdx) =>
      set(s => {
        if (fromIdx === toIdx) return {}
        const tabs = [...s.tabs]
        const [tab] = tabs.splice(fromIdx, 1)
        tabs.splice(toIdx, 0, tab)
        return { tabs }
      }),

    closeTabsToRight: (tabId) =>
      set(s => {
        const idx = s.tabs.findIndex(t => t.id === tabId)
        if (idx === -1 || idx === s.tabs.length - 1) return {}
        const newTabs = s.tabs.slice(0, idx + 1)
        const activeStillExists = newTabs.some(t => t.id === s.activeTabId)
        return { tabs: newTabs, activeTabId: activeStillExists ? s.activeTabId : tabId }
      }),

    closeOtherTabs: (tabId) =>
      set(s => {
        const tab = s.tabs.find(t => t.id === tabId)
        if (!tab) return {}
        return { tabs: [tab], activeTabId: tabId }
      }),

    setActiveTab: (id) => set({ activeTabId: id }),

    updateTabSql: (tabId, sql) =>
      set(s => ({
        tabs: s.tabs.map(t => t.id === tabId ? { ...t, sql, isDirty: true } : t),
      })),

    updateTabDatabase: (tabId, db) =>
      set(s => ({
        tabs: s.tabs.map(t => t.id === tabId ? { ...t, selectedDatabase: db } : t),
      })),

    setInlineSuggestion: (text) => set({ inlineSuggestion: text }),

    acceptSuggestion: (tabId) => {
      const { inlineSuggestion, tabs } = get()
      if (!inlineSuggestion) return
      const tab = tabs.find(t => t.id === tabId)
      if (!tab) return
      get().updateTabSql(tabId, tab.sql + inlineSuggestion)
      set({ inlineSuggestion: null })
    },

    setResult: (tabId, result) =>
      set(s => ({
        tabs: s.tabs.map(t => t.id === tabId ? { ...t, result, isDirty: false } : t),
      })),

    clearResult: (tabId) =>
      set(s => ({
        tabs: s.tabs.map(t => t.id === tabId ? { ...t, result: null } : t),
      })),

    setAnalysis: (result) => set({ analysisResult: result }),

    setQueryLimit: (limit) => set({ queryLimit: limit }),

    cancelQuery: () => {
      _abortCtrl?.abort()
      _abortCtrl = null
      set({ isExecuting: false })
    },

    executeQuery: async (connectionId) => {
      const { tabs, activeTabId, queryLimit } = get()
      const tab = tabs.find(t => t.id === activeTabId)
      if (!tab?.sql.trim()) return
      _abortCtrl?.abort()
      _abortCtrl = new AbortController()
      set({ isExecuting: true })
      try {
        const result = await queryService.execute(
          connectionId, tab.sql, tab.selectedDatabase ?? undefined,
          queryLimit, _abortCtrl.signal,
        )
        get().setResult(activeTabId, result)
      } catch (e: unknown) {
        if (_isAbort(e)) return
        get().setResult(activeTabId, {
          query_id: '', columns: [], rows: [], row_count: 0, duration_ms: 0,
          error: (e as Error).message,
        })
      } finally {
        _abortCtrl = null
        set({ isExecuting: false })
      }
    },

    executeQueryText: async (connectionId, sql) => {
      const { tabs, activeTabId, queryLimit } = get()
      const tab = tabs.find(t => t.id === activeTabId)
      if (!sql.trim()) return
      _abortCtrl?.abort()
      _abortCtrl = new AbortController()
      set({ isExecuting: true })
      try {
        const result = await queryService.execute(
          connectionId, sql, tab?.selectedDatabase ?? undefined,
          queryLimit, _abortCtrl.signal,
        )
        get().setResult(activeTabId, result)
      } catch (e: unknown) {
        if (_isAbort(e)) return
        get().setResult(activeTabId, {
          query_id: '', columns: [], rows: [], row_count: 0, duration_ms: 0,
          error: (e as Error).message,
        })
      } finally {
        _abortCtrl = null
        set({ isExecuting: false })
      }
    },

    generateFullQuery: async (connectionId) => {
      const { tabs, activeTabId } = get()
      const tab = tabs.find(t => t.id === activeTabId)
      if (!tab) return
      set({ isGenerating: true })
      try {
        const sql = await aiService.completeQuery(connectionId, tab.sql, {
          database: tab.selectedDatabase ?? undefined,
        })
        get().updateTabSql(activeTabId, sql)
      } finally {
        set({ isGenerating: false })
      }
    },

    generateTextToSQL: async (connectionId, description) => {
      const { activeTabId, tabs } = get()
      const tab = tabs.find(t => t.id === activeTabId)
      set({ isGenerating: true })
      try {
        const sql = await aiService.textToSQL(connectionId, description, {
          database: tab?.selectedDatabase ?? undefined,
        })
        get().updateTabSql(activeTabId, sql)
      } finally {
        set({ isGenerating: false })
      }
    },

    analyzeQuery: async (connectionId) => {
      const { tabs, activeTabId } = get()
      const tab = tabs.find(t => t.id === activeTabId)
      if (!tab?.sql.trim()) return
      set({ isAnalyzing: true, analysisResult: null })
      try {
        // Strip the auto-generated header block so the AI only sees clean SQL
        const cleanSql = stripSqlHeader(tab.sql)
        const result = await aiService.analyze(connectionId, cleanSql, {
          database: tab.selectedDatabase ?? undefined,
        })
        set({ analysisResult: result })
      } finally {
        set({ isAnalyzing: false })
      }
    },
  }
})

function _isAbort(e: unknown): boolean {
  if (!e || typeof e !== 'object') return false
  const err = e as Record<string, unknown>
  return (
    err['code'] === 'ERR_CANCELED' ||
    err['name'] === 'AbortError' ||
    err['name'] === 'CanceledError'
  )
}
