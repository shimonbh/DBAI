import { useEffect } from 'react'
import { useMonitorStore } from '@/store/monitorStore'
import { useConnectionStore } from '@/store/connectionStore'
import { useMonitor } from '@/hooks/useMonitor'
import { MetricsGauges } from './MetricsGauges'
import { SlowQueryHeatmap } from './SlowQueryHeatmap'
import { theme } from '@/theme'

/** Live DB monitor panel with metrics gauges and slow query heat map. */
export function MonitorPanel() {
  const { activeConnectionId } = useConnectionStore()
  const { snapshots, wsConnected, toggleMonitor } = useMonitorStore()

  // Connect WebSocket when this panel is visible
  useMonitor(activeConnectionId)

  const latest = snapshots[snapshots.length - 1]

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.title}>DB Monitor</span>
        <div style={styles.headerRight}>
          <span style={{ ...styles.wsDot, background: wsConnected ? '#a6e3a1' : '#f38ba8' }} />
          <span style={styles.wsLabel}>{wsConnected ? 'Live' : 'Disconnected'}</span>
          <button style={styles.closeBtn} onClick={toggleMonitor}>✕</button>
        </div>
      </div>

      {!activeConnectionId ? (
        <div style={styles.empty}>Connect to a database to see live metrics.</div>
      ) : (
        <div style={styles.body}>
          {/* Gauges row */}
          <MetricsGauges snapshot={latest ?? null} snapshots={snapshots} />
          {/* Slow query heat map */}
          <SlowQueryHeatmap snapshots={snapshots} />
        </div>
      )}
    </div>
  )
}

const styles = {
  container: { display: 'flex' as const, flexDirection: 'column' as const, height: '100%', background: theme.bgSecondary },
  header:    { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 14px', borderBottom: `1px solid ${theme.borderColor}` },
  title:     { fontSize: 12, fontWeight: 600, color: theme.textPrimary },
  headerRight:{ display: 'flex', alignItems: 'center', gap: 6 },
  wsDot:     { width: 8, height: 8, borderRadius: '50%', display: 'inline-block' },
  wsLabel:   { fontSize: 11, color: theme.textMuted },
  closeBtn:  { background: 'none', border: 'none', color: theme.textMuted, cursor: 'pointer', fontSize: 14 },
  body:      { flex: 1, overflowY: 'auto' as const, padding: 12, display: 'flex' as const, flexDirection: 'column' as const, gap: 16 },
  empty:     { padding: 20, color: theme.textMuted, fontSize: 12, textAlign: 'center' as const },
}
