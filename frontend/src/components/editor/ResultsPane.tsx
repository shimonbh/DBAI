import { useEditorStore } from '@/store/editorStore'
import { theme } from '@/theme'

/** Displays query execution results in a scrollable data grid with status bar. */
export function ResultsPane({ tabId }: { tabId: string }) {
  const tab = useEditorStore(s => s.tabs.find(t => t.id === tabId))
  const result = tab?.result

  if (!result) {
    return (
      <div style={styles.empty}>Run a query to see results here. (Ctrl+Enter)</div>
    )
  }

  if (result.error) {
    return (
      <div style={styles.error}>
        <span style={styles.errorIcon}>⚠</span>
        <pre style={styles.errorText}>{result.error}</pre>
      </div>
    )
  }

  return (
    <div style={styles.container}>
      {/* Status bar */}
      <div style={styles.statusBar}>
        <span style={styles.rowCount}>
          {result.row_count.toLocaleString()} rows
        </span>
        <span style={styles.duration}>{result.duration_ms}ms</span>
      </div>

      {/* Data grid */}
      <div style={styles.tableWrap}>
        <table style={styles.table}>
          <thead>
            <tr>
              {result.columns.map(col => (
                <th key={col} style={styles.th}>{col}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {result.rows.map((row, ri) => (
              <tr key={ri} style={ri % 2 === 0 ? styles.rowEven : styles.rowOdd}>
                {row.map((cell, ci) => (
                  <td key={ci} style={styles.td}>
                    {cell === null
                      ? <span style={styles.null}>NULL</span>
                      : String(cell)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

const styles = {
  container:  { display: 'flex' as const, flexDirection: 'column' as const, height: '100%', overflow: 'hidden' },
  statusBar:  { display: 'flex', gap: 12, padding: '4px 12px', background: theme.bgSecondary, borderBottom: `1px solid ${theme.borderColor}`, alignItems: 'center' },
  rowCount:   { fontSize: 11, color: '#a6e3a1' },
  duration:   { fontSize: 11, color: theme.textMuted },
  tableWrap:  { flex: 1, overflow: 'auto' },
  table:      { width: '100%', borderCollapse: 'collapse' as const, fontSize: 12 },
  th:         { padding: '6px 10px', background: theme.bgPanel, color: theme.textMuted, fontWeight: 600, fontSize: 11, textAlign: 'left' as const, borderBottom: `1px solid ${theme.borderColor}`, whiteSpace: 'nowrap' as const, position: 'sticky' as const, top: 0 },
  rowEven:    { background: 'transparent' },
  rowOdd:     { background: 'rgba(255,255,255,0.02)' },
  td:         { padding: '4px 10px', borderBottom: `1px solid rgba(255,255,255,0.04)`, color: theme.textPrimary, whiteSpace: 'nowrap' as const, maxWidth: 400, overflow: 'hidden', textOverflow: 'ellipsis' },
  null:       { color: theme.textMuted, fontStyle: 'italic' },
  empty:      { padding: 20, color: theme.textMuted, fontSize: 12, textAlign: 'center' as const },
  error:      { padding: 16, display: 'flex' as const, gap: 8, alignItems: 'flex-start' },
  errorIcon:  { color: '#f38ba8', fontSize: 16, flexShrink: 0 },
  errorText:  { color: '#f38ba8', fontSize: 12, margin: 0, whiteSpace: 'pre-wrap' as const },
}
