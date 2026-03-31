import { useEffect } from 'react'
import { DBExplorer } from '@/components/explorer/DBExplorer'
import { QueryExplorer } from '@/components/query-explorer/QueryExplorer'
import { ConnectionList } from '@/components/connection/ConnectionList'
import { SavePanel } from './SavePanel'
import { useConnectionStore } from '@/store/connectionStore'
import { useEditorStore } from '@/store/editorStore'
import { useQueryStore } from '@/store/queryStore'
import { useUIStore } from '@/store/uiStore'

const _norm = (sql: string) => sql.trim().replace(/\s+/g, ' ').toLowerCase()

type PanelTab = 'connections' | 'explorer' | 'queries'

const TABS: { id: PanelTab; label: string; icon: string }[] = [
  { id: 'connections', label: 'Connections', icon: '🔌' },
  { id: 'explorer',   label: 'Explorer',    icon: '🗄'  },
  { id: 'queries',    label: 'Workspace',   icon: '📄'  },
]

/** Left panel: pill segmented nav + rounded card content + optional SavePanel. */
export function LeftPanel() {
  const { leftPanel: active, setLeftPanel: setActive, savePanelOpen } = useUIStore()
  const { activeConnectionId } = useConnectionStore()
  const { tabs, activeTabId } = useEditorStore(s => ({ tabs: s.tabs, activeTabId: s.activeTabId }))
  const { historyByConn, saved } = useQueryStore()

  // Auto-switch to Queries when the active editor tab matches a saved/history query
  useEffect(() => {
    if (active === 'queries') return
    const sql = (tabs.find(t => t.id === activeTabId)?.sql ?? '').trim()
    if (!sql) return
    const norm = _norm(sql)
    const allHistory = Object.values(historyByConn).flat()
    const hasMatch =
      saved.some(q => _norm(q.sql_text) === norm) ||
      allHistory.some(e => _norm(e.sql_text) === norm)
    if (hasMatch) setActive('queries')
  }, [activeTabId]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div style={S.container}>

      {/* ── Segmented pill nav ── */}
      <div style={S.pill}>
        {TABS.map(tab => {
          const isActive = active === tab.id
          return (
            <button
              key={tab.id}
              style={{ ...S.pillBtn, ...(isActive ? S.pillActive : S.pillInactive) }}
              onClick={() => setActive(tab.id)}
              title={tab.label}
            >
              <span style={S.pillIcon}>{tab.icon}</span>
              <span style={S.pillLabel}>{tab.label}</span>
            </button>
          )
        })}
      </div>

      {/* ── Rounded content card ── */}
      <div style={S.card}>
        {active === 'connections' && <ConnectionList />}
        {active === 'explorer'   && <DBExplorer />}
        {active === 'queries'    && <QueryExplorer />}
      </div>

      {/* ── Save panel at the bottom ── */}
      {savePanelOpen && (
        <div style={S.saveCard}>
          <SavePanel />
        </div>
      )}

    </div>
  )
}

const S = {
  // Outer container is the "dark mat" behind the cards
  container: {
    display: 'flex' as const,
    flexDirection: 'column' as const,
    height: '100%',
    boxSizing: 'border-box' as const,
    background: 'var(--bg-secondary)',
    padding: '8px 0 8px 8px',
    gap: '6px',
  },

  // Pill segmented control
  pill: {
    display: 'flex',
    flexShrink: 0,
    background: 'rgba(0,0,0,0.3)',
    borderRadius: 10,
    padding: 4,
    gap: 3,
    border: '1px solid var(--border-color)',
  },
  pillBtn: {
    flex: 1,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    gap: 5, padding: '6px 4px',
    border: 'none', borderRadius: 7, cursor: 'pointer',
    fontSize: 11, fontWeight: 600 as const, letterSpacing: 0.2,
    transition: 'background 0.15s, color 0.15s',
    whiteSpace: 'nowrap' as const,
  },
  // Active: accent-colored pill — clearly visible
  pillActive: {
    background: 'var(--accent-color)',
    color: '#fff',
    boxShadow: '0 2px 6px rgba(0,0,0,0.35)',
  },
  pillInactive: {
    background: 'transparent',
    color: 'var(--text-muted)',
  },
  pillIcon:  { fontSize: 13 },
  pillLabel: { fontSize: 10 },

  // Main card: rounded corners + shadow to pop off the dark mat
  card: {
    flex: 1,
    minHeight: 0,
    overflow: 'hidden',
    display: 'flex' as const,
    flexDirection: 'column' as const,
    background: 'var(--bg-panel)',
    borderRadius: 12,
    border: '1px solid var(--border-color)',
    boxShadow: '0 4px 20px rgba(0,0,0,0.35)',
  },

  // Save panel also rendered as a card
  saveCard: {
    flexShrink: 0,
    overflow: 'hidden',
    borderRadius: 12,
    border: '1px solid var(--border-color)',
    boxShadow: '0 4px 20px rgba(0,0,0,0.35)',
  },
}
