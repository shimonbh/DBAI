import { useState, useCallback } from 'react'
import { LeftPanel } from './LeftPanel'
import { Resizer } from './Resizer'
import { SettingsModal } from './SettingsModal'
import { EditorPanel } from '@/components/editor/EditorPanel'
import { MonitorPanel } from '@/components/monitor/MonitorPanel'
import { ConnectionBadge } from '@/components/connection/ConnectionBadge'
import { useMonitorStore } from '@/store/monitorStore'
import { theme } from '@/theme'

/**
 * Top-level shell layout:
 *   TopBar
 *   ┌─────────────┬───┬──────────────────────────┐
 *   │  Left Panel │ ║ │   Editor / Monitor        │
 *   └─────────────┴───┴──────────────────────────┘
 */
export function AppShell() {
  const [leftWidth, setLeftWidth]       = useState(theme.leftPanelWidth)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const { isOpen: monitorOpen, toggleMonitor } = useMonitorStore()

  const handleResize = useCallback((delta: number) => {
    setLeftWidth(w => Math.max(180, Math.min(500, w + delta)))
  }, [])

  return (
    <div style={styles.root}>
      {/* Top bar */}
      <div style={styles.topBar}>
        <span style={styles.appName}>D.B.A.I</span>
        <ConnectionBadge />
        <div style={styles.topBarRight}>
          <button
            style={{
              ...styles.iconBtn,
              color: monitorOpen ? 'var(--accent-color)' : 'var(--text-muted)',
            }}
            onClick={toggleMonitor}
            title="Toggle DB Monitor"
          >
            📊 Monitor
          </button>
          <button
            style={styles.iconBtn}
            onClick={() => setSettingsOpen(v => !v)}
            title="Settings"
          >
            ⚙️
          </button>
        </div>
      </div>

      {/* Main content */}
      <div style={styles.main}>
        {/* Left panel */}
        <div style={{ width: leftWidth, minWidth: 180, overflow: 'hidden', flexShrink: 0 }}>
          <LeftPanel />
        </div>

        <Resizer onResize={handleResize} />

        {/* Right: editor + optional monitor */}
        <div style={styles.rightArea}>
          {monitorOpen ? (
            <>
              <div style={{ height: '40%', minHeight: 150, borderBottom: `1px solid var(--border-color)` }}>
                <MonitorPanel />
              </div>
              <div style={{ flex: 1, overflow: 'hidden' }}>
                <EditorPanel />
              </div>
            </>
          ) : (
            <EditorPanel />
          )}
        </div>
      </div>

      {/* Settings modal */}
      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
    </div>
  )
}

const styles = {
  root:        { display: 'flex' as const, flexDirection: 'column' as const, height: '100vh', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontFamily: "'Segoe UI', system-ui, sans-serif" },
  topBar:      { display: 'flex', alignItems: 'center', gap: 14, padding: '0 16px', height: 38, background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-color)', flexShrink: 0 },
  appName:     { fontWeight: 700, fontSize: 14, color: 'var(--accent-color)', letterSpacing: 1 },
  topBarRight: { marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' },
  iconBtn:     { background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, padding: '3px 8px', borderRadius: 4, color: 'var(--text-muted)' },
  main:        { flex: 1, display: 'flex' as const, overflow: 'hidden', minHeight: 0, background: 'var(--bg-secondary)' },
  rightArea:   { flex: 1, display: 'flex' as const, flexDirection: 'column' as const, overflow: 'hidden', minWidth: 0 },
}
