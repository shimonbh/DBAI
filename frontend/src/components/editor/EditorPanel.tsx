import { useRef, useCallback } from 'react'
import { useEditorStore } from '@/store/editorStore'
import { useConnectionStore } from '@/store/connectionStore'
import { useSchemaStore } from '@/store/schemaStore'
import { queryService } from '@/services/queryService'
import { MonacoEditor } from './MonacoEditor'
import { AIToolbar } from './AIToolbar'
import { SuggestionPanel } from './SuggestionPanel'
import { ResultsPane } from './ResultsPane'
import { theme } from '@/theme'

/**
 * Right panel: multi-tab editor with AI toolbar, results pane, and analysis panel.
 * Supports drag-and-drop file import and Ctrl+Enter / F5 to run.
 */
export function EditorPanel() {
  const { tabs, activeTabId, setActiveTab, openTab, closeTab, updateTabSql,
          isAnalyzing, analyzeQuery } = useEditorStore()
  const { activeConnectionId } = useConnectionStore()
  const { databases } = useSchemaStore()
  const dropRef = useRef<HTMLDivElement>(null)

  // ── Keyboard shortcut: Ctrl+Enter → execute ──────────────────────────────
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      if (activeConnectionId) {
        useEditorStore.getState().executeQuery(activeConnectionId)
      }
    }
  }, [activeConnectionId])

  // ── Drag-and-drop .sql file import ────────────────────────────────────────
  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (!file || !file.name.endsWith('.sql')) return
    const result = await queryService.importFile(file)
    result.statements.forEach((sql, i) =>
      openTab(sql, `${file.name.replace('.sql', '')} #${i + 1}`)
    )
  }, [openTab])

  const activeTab = tabs.find(t => t.id === activeTabId)

  return (
    <div
      style={styles.container}
      ref={dropRef}
      onKeyDown={handleKeyDown}
      onDragOver={e => e.preventDefault()}
      onDrop={handleDrop}
    >
      {/* Tab bar */}
      <div style={styles.tabBar}>
        {tabs.map(tab => (
          <div
            key={tab.id}
            style={{
              ...styles.tab,
              ...(tab.id === activeTabId ? styles.tabActive : {}),
            }}
            onClick={() => setActiveTab(tab.id)}
          >
            <span style={styles.tabTitle}>
              {tab.title}{tab.isDirty ? ' •' : ''}
            </span>
            {tabs.length > 1 && (
              <button
                style={styles.tabClose}
                onClick={e => { e.stopPropagation(); closeTab(tab.id) }}
              >×</button>
            )}
          </div>
        ))}
        <button style={styles.newTabBtn} onClick={() => openTab()} title="New tab">+</button>

        {/* Right side of tab bar: database selector + Analyze */}
        <div style={styles.tabBarRight}>
          {databases.length > 0 && (
            <select
              style={styles.dbSelect}
              value={activeTab?.selectedDatabase ?? ''}
              onChange={e => useEditorStore.getState().updateTabDatabase(activeTabId, e.target.value || null)}
            >
              <option value="">All databases</option>
              {databases.map(db => (
                <option key={db.name} value={db.name}>{db.name}</option>
              ))}
            </select>
          )}

          <button
            style={styles.analyzeBtn}
            onClick={() => activeConnectionId && analyzeQuery(activeConnectionId)}
            disabled={isAnalyzing || !activeConnectionId}
            title="Analyze query and suggest improvements"
          >
            {isAnalyzing ? '…' : '🔍 Analyze'}
          </button>
        </div>
      </div>

      {/* AI Toolbar */}
      <AIToolbar />

      {/* Editor + Results split */}
      {activeTab && (
        <div style={styles.editorArea}>
          {/* Editor */}
          <div style={{ height: `${theme.editorHeightPct}%`, minHeight: 100 }}>
            <MonacoEditor
              tabId={activeTab.id}
              sql={activeTab.sql}
              onChange={sql => updateTabSql(activeTab.id, sql)}
            />
          </div>

          {/* Analysis panel (collapsible) */}
          <SuggestionPanel />

          {/* Results */}
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <ResultsPane tabId={activeTab.id} />
          </div>
        </div>
      )}

      {/* Drop zone hint */}
      <div style={styles.dropHint}>Drop .sql file to import</div>
    </div>
  )
}

const styles = {
  container:   { display: 'flex' as const, flexDirection: 'column' as const, height: '100%', background: theme.bgPrimary, position: 'relative' as const },
  tabBar:      { display: 'flex', alignItems: 'center', background: theme.bgSecondary, borderBottom: `1px solid ${theme.borderColor}`, overflowX: 'auto' as const, minHeight: 34 },
  tab:         { display: 'flex', alignItems: 'center', gap: 4, padding: '6px 12px', cursor: 'pointer', borderRight: `1px solid ${theme.borderColor}`, color: theme.textMuted, fontSize: 12, whiteSpace: 'nowrap' as const, flexShrink: 0 },
  tabActive:   { background: theme.bgPrimary, color: theme.textPrimary, borderTop: `2px solid ${theme.accentColor}` },
  tabTitle:    { maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis' },
  tabClose:    { background: 'none', border: 'none', color: theme.textMuted, cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: '0 2px' },
  newTabBtn:   { background: 'none', border: 'none', color: theme.textMuted, cursor: 'pointer', fontSize: 18, padding: '0 10px', flexShrink: 0 },
  tabBarRight: { display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto', paddingRight: 8, flexShrink: 0 },
  dbSelect:    { background: theme.bgPanel, border: `1px solid ${theme.borderColor}`, borderRadius: 3, color: theme.textPrimary, fontSize: 11, padding: '2px 6px', cursor: 'pointer' },
  analyzeBtn:  { background: theme.bgPanel, border: `1px solid ${theme.borderColor}`, borderRadius: 3, color: theme.textPrimary, fontSize: 11, padding: '2px 8px', cursor: 'pointer', whiteSpace: 'nowrap' as const },
  editorArea:  { flex: 1, display: 'flex' as const, flexDirection: 'column' as const, overflow: 'hidden', minHeight: 0 },
  dropHint:    { position: 'absolute' as const, bottom: 6, right: 10, fontSize: 10, color: theme.textMuted, pointerEvents: 'none' as const },
}
