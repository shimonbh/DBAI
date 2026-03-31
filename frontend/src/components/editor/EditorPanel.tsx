import { useRef, useCallback, useState } from 'react'
import { useEditorStore } from '@/store/editorStore'
import { useConnectionStore } from '@/store/connectionStore'
import { useUIStore } from '@/store/uiStore'
import { queryService } from '@/services/queryService'
import { MonacoEditor } from './MonacoEditor'
import { ResultsPane } from './ResultsPane'

// ── Context-menu item with hover highlight ────────────────────────────────────
function CtxItem({ label, disabled, onClick }: {
  label: string; disabled?: boolean; onClick: () => void
}) {
  const [hov, setHov] = useState(false)
  return (
    <div
      style={{
        padding: '6px 14px', fontSize: 12,
        cursor: disabled ? 'default' : 'pointer',
        color: disabled ? 'var(--text-muted)' : 'var(--text-primary)',
        background: !disabled && hov ? 'rgba(255,255,255,0.07)' : 'transparent',
        userSelect: 'none' as const,
      }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      onClick={disabled ? undefined : onClick}
    >
      {label}
    </div>
  )
}

/**
 * Right panel: two rounded cards on a dark mat, separated by a draggable handle.
 *   ┌─ Editor card (tab bar + Monaco) ──────────────────────┐
 *   └────────────────────────────────────────────────────────┘
 *   ═══ drag handle ════════════════════════════════════════
 *   ┌─ Results card (Results / Messages / Ask AI / Analyze) ┐
 *   └────────────────────────────────────────────────────────┘
 */
export function EditorPanel() {
  const {
    tabs, activeTabId, setActiveTab, openTab, closeTab,
    moveTab, closeTabsToRight, closeOtherTabs,
    updateTabSql, isExecuting,
  } = useEditorStore()
  const { activeConnectionId, connectedIds } = useConnectionStore()
  const openSavePanel = useUIStore(s => s.openSavePanel)
  const dropRef = useRef<HTMLDivElement>(null)

  const [saveHover, setSaveHover] = useState(false)

  // Height of the editor card in pixels; results card takes the remainder
  const [editorHeight, setEditorHeight] = useState(300)

  // ── Right-click context menu ───────────────────────────────────────────────
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; tabId: string } | null>(null)
  const closeCtxMenu = () => setCtxMenu(null)

  const handleTabContextMenu = (e: React.MouseEvent, tabId: string) => {
    e.preventDefault()
    setCtxMenu({ x: e.clientX, y: e.clientY, tabId })
  }

  // ── Tab drag-to-reorder ────────────────────────────────────────────────────
  const [dragSrcIdx, setDragSrcIdx]   = useState<number | null>(null)
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null)

  const handleTabDragStart = (e: React.DragEvent, idx: number) => {
    setDragSrcIdx(idx)
    e.dataTransfer.effectAllowed = 'copyMove'
    // Used by the tab bar to reorder tabs
    e.dataTransfer.setData('application/tab-reorder', String(idx))
    // Used by ProjectsSection to create a saved query from this tab's SQL
    const tab = tabs[idx]
    e.dataTransfer.setData('application/dbai-tab-sql', JSON.stringify({ sql: tab.sql, title: tab.title }))
  }
  const handleTabDragOver = (e: React.DragEvent, idx: number) => {
    if (dragSrcIdx === null || dragSrcIdx === idx) return
    if (!e.dataTransfer.types.includes('application/tab-reorder')) return
    e.preventDefault()
    e.stopPropagation()
    setDragOverIdx(idx)
  }
  const handleTabDrop = (e: React.DragEvent, toIdx: number) => {
    if (!e.dataTransfer.types.includes('application/tab-reorder')) return
    e.preventDefault()
    e.stopPropagation()
    if (dragSrcIdx !== null && dragSrcIdx !== toIdx) moveTab(dragSrcIdx, toIdx)
    setDragSrcIdx(null)
    setDragOverIdx(null)
  }
  const handleTabDragEnd = () => {
    setDragSrcIdx(null)
    setDragOverIdx(null)
  }

  const activeTab = tabs.find(t => t.id === activeTabId)

  // Ctrl+Enter → execute or cancel query
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      const store = useEditorStore.getState()
      if (store.isExecuting) {
        store.cancelQuery()
      } else if (activeConnectionId) {
        store.executeQuery(activeConnectionId)
      }
    }
  }, [activeConnectionId])

  // Drag-and-drop .sql import
  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (!file || !file.name.endsWith('.sql')) return
    const result = await queryService.importFile(file)
    result.statements.forEach((sql, i) =>
      openTab(sql, `${file.name.replace('.sql', '')} #${i + 1}`)
    )
  }, [openTab])

  // Vertical drag handle between editor and results cards
  const handleDividerDrag = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    const startY = e.clientY
    const startH = editorHeight
    const containerH = dropRef.current?.clientHeight ?? 900
    const DIVIDER = 8
    const MIN_RESULTS = 80

    const onMove = (ev: MouseEvent) => {
      const maxH = containerH - DIVIDER - MIN_RESULTS
      const next = Math.max(100, Math.min(maxH, startH + (ev.clientY - startY)))
      setEditorHeight(next)
    }
    const onUp = () => {
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }

    document.body.style.cursor = 'row-resize'
    document.body.style.userSelect = 'none'
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [editorHeight])

  return (
    <div
      style={S.container}
      ref={dropRef}
      onKeyDown={handleKeyDown}
      onDragOver={e => e.preventDefault()}
      onDrop={handleDrop}
    >
      {/* ── Editor card ───────────────────────────────────────────────────── */}
      <div style={{ ...S.card, height: editorHeight }}>

        {/* Tab bar — scrollable tabs + fixed-right controls */}
        <div style={S.tabBar}>

          {/* Scrollable tab strip */}
          <div style={S.tabScroll}>
            {tabs.map((tab, i) => (
              <div
                key={tab.id}
                draggable
                onDragStart={e => handleTabDragStart(e, i)}
                onDragOver={e => handleTabDragOver(e, i)}
                onDrop={e => handleTabDrop(e, i)}
                onDragEnd={handleTabDragEnd}
                onContextMenu={e => handleTabContextMenu(e, tab.id)}
                style={{
                  ...S.tab,
                  ...(tab.id === activeTabId ? S.tabActive : {}),
                  opacity: dragSrcIdx === i ? 0.4 : 1,
                  boxShadow: dragOverIdx === i && dragSrcIdx !== i
                    ? 'inset 2px 0 0 var(--accent-color)'
                    : undefined,
                }}
                onClick={() => setActiveTab(tab.id)}
              >
                <span style={S.tabTitle}>{tab.title}{tab.isDirty ? ' •' : ''}</span>
                {tabs.length > 1 && (
                  <button style={S.tabClose} onClick={e => { e.stopPropagation(); closeTab(tab.id) }}>×</button>
                )}
              </div>
            ))}
          </div>

          {/* Floating 💾 Save button — visible when active tab has unsaved changes */}
          {activeTab?.isDirty && (
            <button
              style={{
                ...S.saveTabBtn,
                opacity: saveHover ? 1 : 0.55,
              }}
              onMouseEnter={() => setSaveHover(true)}
              onMouseLeave={() => setSaveHover(false)}
              onClick={openSavePanel}
              title="Save query (unsaved changes)"
            >
              💾
            </button>
          )}

          {/* Fixed-right controls — always visible regardless of tab count */}
          <div style={S.tabBarRight}>
            <button style={S.newTabBtn} onClick={() => openTab()} title="New tab">+</button>
            <div style={S.tabBarDivider} />
            {isExecuting ? (
              <button
                style={S.stopBtn}
                onClick={() => useEditorStore.getState().cancelQuery()}
                title="Cancel running query"
              >
                ■ Stop
              </button>
            ) : (
              <button
                style={S.runBtn}
                onClick={() => {
                  const connId = activeTab?.connectionId ?? activeConnectionId ?? [...connectedIds][0]
                  if (connId) useEditorStore.getState().executeQuery(connId)
                }}
                disabled={connectedIds.size === 0}
                title="Run query (Ctrl+Enter)"
              >
                ▶ Run
              </button>
            )}
          </div>
        </div>

        {/* Monaco editor fills the card */}
        {activeTab && (
          <div style={S.monacoWrap}>
            <MonacoEditor
              tabId={activeTab.id}
              sql={activeTab.sql}
              onChange={sql => updateTabSql(activeTab.id, sql)}
            />
          </div>
        )}
      </div>

      {/* ── Drag handle ──────────────────────────────────────────────────── */}
      <div style={S.divider} onMouseDown={handleDividerDrag} title="Drag to resize">
        <div style={S.dividerGrip} />
      </div>

      {/* ── Results card ─────────────────────────────────────────────────── */}
      {activeTab && (
        <div style={{ ...S.card, flex: 1 }}>
          <ResultsPane tabId={activeTab.id} />
        </div>
      )}

      {/* Drop hint */}
      <div style={S.dropHint}>Drop .sql file to import</div>

      {/* ── Tab right-click context menu ─────────────────────────────────── */}
      {ctxMenu && (() => {
        const tabIdx = tabs.findIndex(t => t.id === ctxMenu.tabId)
        const isOnly = tabs.length === 1
        const isLast = tabIdx === tabs.length - 1

        return (
          <>
            {/* Full-screen backdrop — click outside menu to close */}
            <div style={S.ctxOverlay} onClick={closeCtxMenu} />
            <div style={{ ...S.ctxMenu, left: ctxMenu.x, top: ctxMenu.y }}>
              <CtxItem
                label="Close"
                disabled={isOnly}
                onClick={() => { closeTab(ctxMenu.tabId); closeCtxMenu() }}
              />
              <CtxItem
                label="Close Others"
                disabled={isOnly}
                onClick={() => { closeOtherTabs(ctxMenu.tabId); closeCtxMenu() }}
              />
              <CtxItem
                label="Close to the Right"
                disabled={isLast}
                onClick={() => { closeTabsToRight(ctxMenu.tabId); closeCtxMenu() }}
              />
            </div>
          </>
        )
      })()}
    </div>
  )
}

const CARD_BASE: React.CSSProperties = {
  overflow: 'hidden',
  display: 'flex',
  flexDirection: 'column',
  background: 'var(--bg-panel)',
  borderRadius: 12,
  border: '1px solid var(--border-color)',
  boxShadow: '0 4px 20px rgba(0,0,0,0.35)',
  minHeight: 0,
  flexShrink: 0,
}

const S = {
  // Dark outer mat
  container: {
    display: 'flex' as const,
    flexDirection: 'column' as const,
    height: '100%',
    boxSizing: 'border-box' as const,
    background: 'var(--bg-secondary)',
    padding: '8px 8px 8px 0',
    gap: 0,
    position: 'relative' as const,
  },

  card: CARD_BASE,

  // Tab bar — outer row never scrolls; only the inner tabScroll overflows
  tabBar:      { display: 'flex', alignItems: 'stretch', background: 'rgba(0,0,0,0.2)', borderBottom: '1px solid var(--border-color)', minHeight: 34, flexShrink: 0, borderRadius: '12px 12px 0 0', overflow: 'hidden' },
  tabScroll:   { display: 'flex', alignItems: 'center', flex: 1, overflowX: 'auto' as const, minWidth: 0 },
  tab:        { display: 'flex', alignItems: 'center', gap: 4, padding: '6px 12px', cursor: 'pointer', borderRight: '1px solid var(--border-color)', color: 'var(--text-muted)', fontSize: 12, whiteSpace: 'nowrap' as const, flexShrink: 0, borderTop: '2px solid transparent', userSelect: 'none' as const },
  tabActive:  { background: 'var(--bg-panel)', color: 'var(--text-primary)', borderTop: '2px solid var(--accent-color)' },
  tabTitle:   { maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis' },
  tabClose:   { background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: '0 2px' },
  // Fixed right section — always visible
  tabBarRight:  { display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0, padding: '0 8px', borderLeft: '1px solid var(--border-color)' },
  tabBarDivider:{ width: 1, height: 16, background: 'var(--border-color)', flexShrink: 0 },
  newTabBtn:    { background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 18, padding: '0 4px', flexShrink: 0 },
  saveTabBtn:   { background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, padding: '0 6px', flexShrink: 0, transition: 'opacity 0.15s' },
  runBtn:      { background: 'var(--accent-color)', border: 'none', borderRadius: 4, color: '#fff', fontSize: 11, padding: '3px 12px', cursor: 'pointer', fontWeight: 600 as const, whiteSpace: 'nowrap' as const },
  stopBtn:     { background: '#e05555', border: 'none', borderRadius: 4, color: '#fff', fontSize: 11, padding: '3px 12px', cursor: 'pointer', fontWeight: 600 as const, whiteSpace: 'nowrap' as const },
  monacoWrap: { flex: 1, minHeight: 0, overflow: 'hidden' },

  // Draggable horizontal divider between the two cards
  divider: {
    height: 8,
    flexShrink: 0,
    cursor: 'row-resize',
    display: 'flex' as const,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dividerGrip: {
    width: 36,
    height: 4,
    borderRadius: 2,
    background: 'var(--border-color)',
    opacity: 0.7,
  },

  dropHint: { position: 'absolute' as const, bottom: 14, right: 16, fontSize: 10, color: 'var(--text-muted)', pointerEvents: 'none' as const, opacity: 0.5 },

  // Right-click context menu
  ctxOverlay: { position: 'fixed' as const, inset: 0, zIndex: 9998 },
  ctxMenu:    { position: 'fixed' as const, zIndex: 9999, minWidth: 170, padding: '4px 0', background: 'var(--bg-panel)', border: '1px solid var(--border-color)', borderRadius: 7, boxShadow: '0 6px 24px rgba(0,0,0,0.55)' },
}
