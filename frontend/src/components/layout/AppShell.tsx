import { useState, useCallback } from 'react'
import { LeftPanel } from './LeftPanel'
import { Resizer } from './Resizer'
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
  const [leftWidth, setLeftWidth] = useState(theme.leftPanelWidth)
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
              ...styles.monitorBtn,
              color: monitorOpen ? theme.accentColor : theme.textMuted,
            }}
            onClick={toggleMonitor}
            title="Toggle DB Monitor"
          >
            📊 Monitor
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
              {/* Monitor takes top 40%; editor below */}
              <div style={{ height: '40%', minHeight: 150, borderBottom: `1px solid ${theme.borderColor}` }}>
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
    </div>
  )
}

const styles = {
  root:        { display: 'flex' as const, flexDirection: 'column' as const, height: '100vh', background: theme.bgPrimary, color: theme.textPrimary, fontFamily: "'Segoe UI', system-ui, sans-serif" },
  topBar:      { display: 'flex', alignItems: 'center', gap: 14, padding: '0 16px', height: 38, background: theme.bgSecondary, borderBottom: `1px solid ${theme.borderColor}`, flexShrink: 0 },
  appName:     { fontWeight: 700, fontSize: 14, color: theme.accentColor, letterSpacing: 1 },
  topBarRight: { marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' },
  monitorBtn:  { background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, padding: '3px 8px', borderRadius: 4 },
  main:        { flex: 1, display: 'flex' as const, overflow: 'hidden', minHeight: 0 },
  rightArea:   { flex: 1, display: 'flex' as const, flexDirection: 'column' as const, overflow: 'hidden', minWidth: 0 },
}
