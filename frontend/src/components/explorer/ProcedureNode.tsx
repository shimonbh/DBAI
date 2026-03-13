import type { ProcedureSchema } from '@/types/schema'
import { theme } from '@/theme'

interface Props {
  proc: ProcedureSchema
  nodeId: string
  expanded: boolean
  onToggle: (nodeId: string) => void
}

/** Expandable tree node for a stored procedure. Shows definition when expanded. */
export function ProcedureNode({ proc, nodeId, expanded, onToggle }: Props) {
  const preview = proc.definition?.trim().slice(0, 300) ?? '— no definition available —'

  return (
    <div>
      <div style={styles.row} onClick={() => onToggle(nodeId)}>
        <span style={styles.indent} />
        <span style={styles.arrow}>{expanded ? '▾' : '▸'}</span>
        <span style={styles.icon}>⚙</span>
        <span style={styles.name}>{proc.name}</span>
      </div>

      {expanded && (
        <div style={styles.defBox}>
          <pre style={styles.defText}>{preview}{(proc.definition?.length ?? 0) > 300 ? '\n…' : ''}</pre>
        </div>
      )}
    </div>
  )
}

const styles = {
  row:     { display: 'flex', alignItems: 'center', gap: 4, padding: '4px 12px 4px 24px', cursor: 'pointer', userSelect: 'none' as const },
  indent:  { width: 8 },
  arrow:   { fontSize: 10, color: theme.textMuted, width: 10 },
  icon:    { fontSize: 11 },
  name:    { fontSize: 12, color: theme.textPrimary, flex: 1 },
  defBox:  { margin: '2px 12px 4px 40px', background: theme.bgPanel, borderRadius: 4, padding: '6px 8px', borderLeft: `2px solid ${theme.borderColor}` },
  defText: { fontSize: 10, color: theme.textMuted, fontFamily: "'JetBrains Mono', monospace", whiteSpace: 'pre-wrap' as const, margin: 0, wordBreak: 'break-word' as const },
}
