import { useEditorStore } from '@/store/editorStore'
import { theme } from '@/theme'

/**
 * Collapsible panel showing AI analysis results:
 * summary, issues list, suggestions list, and improved SQL.
 */
export function SuggestionPanel() {
  const { analysisResult, isAnalyzing, setAnalysis, updateTabSql, activeTabId } = useEditorStore()

  if (!isAnalyzing && !analysisResult) return null

  if (isAnalyzing) {
    return (
      <div style={styles.container}>
        <div style={styles.loading}>Analyzing query…</div>
      </div>
    )
  }

  if (!analysisResult) return null

  const applyImproved = () => {
    if (analysisResult.improved_sql) {
      updateTabSql(activeTabId, analysisResult.improved_sql)
      setAnalysis(null)
    }
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.title}>AI Analysis</span>
        <button style={styles.closeBtn} onClick={() => setAnalysis(null)}>✕</button>
      </div>

      {analysisResult.summary && (
        <div style={styles.section}>
          <div style={styles.sectionTitle}>Summary</div>
          <div style={styles.text}>{analysisResult.summary}</div>
        </div>
      )}

      {analysisResult.issues.length > 0 && (
        <div style={styles.section}>
          <div style={styles.sectionTitle}>Issues</div>
          {analysisResult.issues.map((issue, i) => (
            <div key={i} style={styles.issueItem}>⚠ {issue}</div>
          ))}
        </div>
      )}

      {analysisResult.suggestions.length > 0 && (
        <div style={styles.section}>
          <div style={styles.sectionTitle}>Suggestions</div>
          {analysisResult.suggestions.map((s, i) => (
            <div key={i} style={styles.suggItem}>💡 {s}</div>
          ))}
        </div>
      )}

      {analysisResult.improved_sql && (
        <div style={styles.section}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
            <div style={styles.sectionTitle}>Improved SQL</div>
            <button style={styles.applyBtn} onClick={applyImproved}>Apply</button>
          </div>
          <pre style={styles.code}>{analysisResult.improved_sql}</pre>
        </div>
      )}
    </div>
  )
}

const styles = {
  container:    { background: theme.bgSecondary, borderTop: `1px solid ${theme.borderColor}`, maxHeight: 280, overflowY: 'auto' as const, padding: '0 0 8px' },
  loading:      { padding: 12, color: theme.textMuted, fontSize: 12 },
  header:       { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px 4px', position: 'sticky' as const, top: 0, background: theme.bgSecondary },
  title:        { fontSize: 12, fontWeight: 600, color: theme.accentColor },
  closeBtn:     { background: 'none', border: 'none', color: theme.textMuted, cursor: 'pointer', fontSize: 13 },
  section:      { padding: '4px 12px 8px' },
  sectionTitle: { fontSize: 11, color: theme.textMuted, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: 0.5, marginBottom: 4 },
  text:         { fontSize: 12, color: theme.textPrimary, lineHeight: 1.5 },
  issueItem:    { fontSize: 12, color: '#f38ba8', padding: '1px 0' },
  suggItem:     { fontSize: 12, color: '#a6e3a1', padding: '1px 0' },
  code:         { background: theme.bgPrimary, border: `1px solid ${theme.borderColor}`, borderRadius: 4, padding: 8, fontSize: 11, color: theme.textPrimary, overflow: 'auto', whiteSpace: 'pre-wrap' as const, margin: 0 },
  applyBtn:     { background: theme.accentColor, color: '#fff', border: 'none', borderRadius: 3, padding: '2px 10px', cursor: 'pointer', fontSize: 11 },
}
