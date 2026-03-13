import { useEffect } from 'react'
import { DBExplorer } from '@/components/explorer/DBExplorer'
import { QueryExplorer } from '@/components/query-explorer/QueryExplorer'
import { ConnectionList } from '@/components/connection/ConnectionList'
import { useConnectionStore } from '@/store/connectionStore'
import { useEditorStore } from '@/store/editorStore'
import { useQueryStore } from '@/store/queryStore'
import { useUIStore } from '@/store/uiStore'
import { theme } from '@/theme'

const _norm = (sql: string) => sql.trim().replace(/\s+/g, ' ').toLowerCase()

type PanelTab = 'connections' | 'explorer' | 'queries'

const TABS: { id: PanelTab; label: string; icon: string }[] = [
  { id: 'connections', label: 'Connections', icon: '🔌' },
  { id: 'explorer',   label: 'Explorer',    icon: '🗄' },
  { id: 'queries',    label: 'Queries',     icon: '📄' },
]

/** Left panel with horizontal tab bar + content area. */
export function LeftPanel() {
  const { leftPanel: active, setLeftPanel: setActive } = useUIStore()
  const { activeConnectionId } = useConnectionStore()
  const { tabs, activeTabId } = useEditorStore(s => ({ tabs: s.tabs, activeTabId: s.activeTabId }))
  const { history, saved } = useQueryStore()

  // Auto-switch to Queries panel when the user switches to an editor tab whose
  // SQL matches a saved or history query — works even when on Explorer/Connections
  useEffect(() => {
    if (active === 'queries') return               // already there
    const sql = (tabs.find(t => t.id === activeTabId)?.sql ?? '').trim()
    if (!sql) return
    const norm = _norm(sql)
    const hasMatch =
      saved.some(q => _norm(q.sql_text) === norm) ||
      history.some(e => _norm(e.sql_text) === norm)
    if (hasMatch) setActive('queries')
  }, [activeTabId]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div style={styles.container}>
      {/* Horizontal tab bar */}
      <div style={styles.tabBar}>
        {TABS.map(tab => {
          const isActive = active === tab.id
          return (
            <button
              key={tab.id}
              style={{
                ...styles.tab,
                ...(isActive ? styles.tabActive : styles.tabInactive),
              }}
              onClick={() => setActive(tab.id)}
            >
              <span style={styles.tabIcon}>{tab.icon}</span>
              <span style={styles.tabLabel}>{tab.label}</span>
              {isActive && <span style={styles.tabUnderline} />}
            </button>
          )
        })}
      </div>

      {/* Panel content */}
      <div style={styles.content}>
        {active === 'connections' && <ConnectionList />}
        {active === 'explorer'   && <DBExplorer />}
        {active === 'queries'    && <QueryExplorer />}
      </div>
    </div>
  )
}

const styles = {
  container:    {
    display: 'flex', flexDirection: 'column' as const, height: '100%',
    background: theme.bgSecondary, borderRight: `1px solid ${theme.borderColor}`,
  },
  tabBar:       {
    display: 'flex', flexDirection: 'row' as const, flexShrink: 0,
    borderBottom: `1px solid ${theme.borderColor}`,
    background: theme.bgSecondary,
  },
  tab:          {
    flex: 1, position: 'relative' as const,
    display: 'flex', flexDirection: 'column' as const,
    alignItems: 'center', justifyContent: 'center',
    gap: 3, padding: '8px 4px',
    border: 'none', cursor: 'pointer',
    background: 'transparent', transition: 'background 0.15s',
  },
  tabActive:    { background: theme.bgPanel, color: theme.accentColor },
  tabInactive:  { color: theme.textPrimary, opacity: 0.7 },
  tabIcon:      { fontSize: 15, lineHeight: 1 },
  tabLabel:     { fontSize: 10, fontWeight: 600, letterSpacing: 0.3, whiteSpace: 'nowrap' as const },
  tabUnderline: {
    position: 'absolute' as const, bottom: 0, left: '10%', right: '10%',
    height: 2, background: theme.accentColor, borderRadius: 2,
  },
  content:      { flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' as const },
}
