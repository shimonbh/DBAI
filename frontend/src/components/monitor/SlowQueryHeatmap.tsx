import type { MetricsSnapshot, SlowQueryEntry } from '@/types/monitor'
import { theme } from '@/theme'

interface Props { snapshots: MetricsSnapshot[] }

/**
 * Heat map of slow queries.
 * Each row is a unique query pattern; columns represent time slots.
 * Cell color intensity = duration.
 */
export function SlowQueryHeatmap({ snapshots }: Props) {
  // Aggregate all slow queries from the buffer
  const queryMap = new Map<string, { count: number; maxMs: number; avgMs: number; totalMs: number }>()

  for (const snapshot of snapshots) {
    for (const sq of snapshot.slow_queries) {
      const key = _normalizeSQL(sq.sql)
      const existing = queryMap.get(key)
      if (existing) {
        existing.count++
        existing.totalMs += sq.duration_ms
        existing.maxMs = Math.max(existing.maxMs, sq.duration_ms)
        existing.avgMs = existing.totalMs / existing.count
      } else {
        queryMap.set(key, { count: 1, maxMs: sq.duration_ms, avgMs: sq.duration_ms, totalMs: sq.duration_ms })
      }
    }
  }

  const rows = Array.from(queryMap.entries())
    .sort((a, b) => b[1].maxMs - a[1].maxMs)
    .slice(0, 20)

  if (!rows.length) {
    return (
      <div style={styles.empty}>
        No slow queries detected in the current monitoring window.
      </div>
    )
  }

  const maxMs = Math.max(...rows.map(([, v]) => v.maxMs), 1)

  return (
    <div>
      <div style={styles.title}>Slow Query Heat Map</div>
      <div style={styles.table}>
        <div style={styles.headerRow}>
          <div style={styles.queryCol}>Query</div>
          <div style={styles.heatCol}>Heat</div>
          <div style={styles.statCol}>Count</div>
          <div style={styles.statCol}>Avg ms</div>
          <div style={styles.statCol}>Max ms</div>
        </div>
        {rows.map(([sql, stats]) => {
          const intensity = stats.maxMs / maxMs
          const bg = _heatColor(intensity)
          return (
            <div key={sql} style={styles.row}>
              <div style={styles.queryCol} title={sql}>{sql}</div>
              <div style={styles.heatCol}>
                <div style={{ ...styles.heatBar, width: `${Math.round(intensity * 100)}%`, background: bg }} />
              </div>
              <div style={styles.statCol}>{stats.count}</div>
              <div style={styles.statCol}>{Math.round(stats.avgMs)}</div>
              <div style={{ ...styles.statCol, color: _durationColor(stats.maxMs) }}>
                {stats.maxMs}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/** Strip literals from SQL to create a canonical pattern key. */
function _normalizeSQL(sql: string): string {
  return sql
    .replace(/\s+/g, ' ')
    .replace(/'[^']*'/g, '?')
    .replace(/\b\d+\b/g, '?')
    .trim()
    .slice(0, 80)
}

function _heatColor(intensity: number): string {
  // Green → Yellow → Red based on intensity
  if (intensity < 0.4) return '#a6e3a1'
  if (intensity < 0.7) return '#f9e2af'
  return '#f38ba8'
}

function _durationColor(ms: number): string {
  if (ms < 500) return '#a6e3a1'
  if (ms < 2000) return '#f9e2af'
  return '#f38ba8'
}

const styles = {
  empty:     { color: theme.textMuted, fontSize: 11, textAlign: 'center' as const, padding: 8 },
  title:     { fontSize: 11, color: theme.textMuted, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: 0.5, marginBottom: 6 },
  table:     { border: `1px solid ${theme.borderColor}`, borderRadius: 6, overflow: 'hidden', fontSize: 11 },
  headerRow: { display: 'flex', background: theme.bgPanel, padding: '5px 8px', color: theme.textMuted, fontWeight: 600 },
  row:       { display: 'flex', padding: '4px 8px', borderTop: `1px solid ${theme.borderColor}`, alignItems: 'center' },
  queryCol:  { flex: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const, color: theme.textPrimary, fontFamily: 'monospace', paddingRight: 8 },
  heatCol:   { flex: 2, paddingRight: 8, display: 'flex', alignItems: 'center' },
  heatBar:   { height: 10, borderRadius: 3, minWidth: 2 },
  statCol:   { width: 60, textAlign: 'right' as const, color: theme.textMuted },
}
