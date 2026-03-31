import { useMemo, useState } from 'react'
import { APP_VERSION, APP_DESCRIPTION, LIBRARIES, type LibraryInfo } from '@/generated/licenses'

interface Props { onClose: () => void }

export function AboutModal({ onClose }: Props) {
  const [showDev, setShowDev] = useState(false)

  // Sort: restricted first, then unknown, then free; alpha within each group
  const sorted = useMemo(() => {
    const order = { restricted: 0, unknown: 1, free: 2 }
    return [...LIBRARIES].sort((a, b) =>
      order[a.commercial] - order[b.commercial] || a.name.localeCompare(b.name)
    )
  }, [])

  const restricted = sorted.filter(l => l.commercial === 'restricted')
  const unknown    = sorted.filter(l => l.commercial === 'unknown')
  const free       = sorted.filter(l => l.commercial === 'free')

  const statusColor = (c: LibraryInfo['commercial']) =>
    c === 'restricted' ? '#ef4444' : c === 'unknown' ? '#f59e0b' : '#22c55e'
  const statusLabel = (c: LibraryInfo['commercial']) =>
    c === 'restricted' ? '✕ Restricted' : c === 'unknown' ? '? Verify' : '✓ Free'

  const renderRow = (lib: LibraryInfo) => (
    <div key={lib.name} style={{
      ...S.row,
      background: lib.commercial === 'restricted' ? 'rgba(239,68,68,0.08)' : 'transparent',
    }}>
      <span style={{ ...S.cell, flex: '0 0 180px', fontWeight: lib.commercial === 'restricted' ? 600 as const : 400, color: lib.commercial === 'restricted' ? '#ef4444' : 'var(--text-primary)' }}>
        {lib.url
          ? <a href={lib.url} target="_blank" rel="noreferrer" style={{ color: 'inherit', textDecoration: 'none' }}>{lib.name}</a>
          : lib.name}
      </span>
      <span style={{ ...S.cell, flex: '0 0 70px', color: 'var(--text-muted)' }}>{lib.version}</span>
      <span style={{ ...S.cell, flex: '0 0 130px', color: 'var(--text-muted)', fontFamily: 'monospace', fontSize: 11 }}>{lib.license}</span>
      <span style={{ ...S.cell, flex: '0 0 100px' }}>
        <span style={{ ...S.badge, background: `${statusColor(lib.commercial)}22`, color: statusColor(lib.commercial) }}>
          {statusLabel(lib.commercial)}
        </span>
      </span>
    </div>
  )

  return (
    <div style={S.backdrop} onClick={onClose}>
      <div style={S.modal} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={S.header}>
          <div>
            <div style={S.appName}>D.B.A.I <span style={S.version}>v{APP_VERSION}</span></div>
            {APP_DESCRIPTION && <div style={S.appDesc}>{APP_DESCRIPTION}</div>}
          </div>
          <button style={S.closeBtn} onClick={onClose}>✕</button>
        </div>

        <div style={S.divider} />

        {/* Library count + filter */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
          <span style={S.sectionTitle}>Open Source Libraries ({LIBRARIES.length})</span>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
            {restricted.length > 0 && (
              <span style={{ ...S.badge, background: 'rgba(239,68,68,0.15)', color: '#ef4444' }}>
                {restricted.length} restricted
              </span>
            )}
            {unknown.length > 0 && (
              <span style={{ ...S.badge, background: 'rgba(245,158,11,0.15)', color: '#f59e0b' }}>
                {unknown.length} verify
              </span>
            )}
          </div>
        </div>

        {/* Table header */}
        <div style={{ ...S.row, background: 'var(--bg-panel)', borderRadius: '6px 6px 0 0', flexShrink: 0 }}>
          <span style={{ ...S.cell, ...S.th, flex: '0 0 180px' }}>Package</span>
          <span style={{ ...S.cell, ...S.th, flex: '0 0 70px'  }}>Version</span>
          <span style={{ ...S.cell, ...S.th, flex: '0 0 130px' }}>License</span>
          <span style={{ ...S.cell, ...S.th, flex: '0 0 100px' }}>Commercial</span>
        </div>

        {/* Scrollable table body */}
        <div style={S.tableBody}>
          {LIBRARIES.length === 0 ? (
            <div style={S.empty}>No library data yet — run <code>npm run dev</code> or <code>npm run build</code> to generate.</div>
          ) : (
            sorted.map(renderRow)
          )}
        </div>

        {/* Legend */}
        <div style={S.legend}>
          <span style={{ color: '#22c55e' }}>✓ Free</span> — commercial use OK &nbsp;·&nbsp;
          <span style={{ color: '#f59e0b' }}>? Verify</span> — check license before commercial use &nbsp;·&nbsp;
          <span style={{ color: '#ef4444' }}>✕ Restricted</span> — not free for commercial use
        </div>
      </div>
    </div>
  )
}

const S = {
  backdrop:    { position: 'fixed' as const, inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  modal:       { background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 14, padding: '20px 24px', width: 560, maxWidth: '95vw', maxHeight: '85vh', display: 'flex', flexDirection: 'column' as const, gap: 12, boxShadow: '0 16px 48px rgba(0,0,0,0.5)' },
  header:      { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexShrink: 0 },
  appName:     { fontSize: 18, fontWeight: 700 as const, color: 'var(--text-primary)', display: 'flex', alignItems: 'baseline', gap: 8 },
  version:     { fontSize: 12, fontWeight: 400, color: 'var(--text-muted)', background: 'var(--bg-panel)', padding: '2px 7px', borderRadius: 4, border: '1px solid var(--border-color)' },
  appDesc:     { fontSize: 12, color: 'var(--text-muted)', marginTop: 4 },
  closeBtn:    { background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 16, padding: '0 2px', flexShrink: 0 },
  divider:     { height: 1, background: 'var(--border-color)', flexShrink: 0 },
  sectionTitle:{ fontSize: 11, fontWeight: 700 as const, color: 'var(--text-muted)', textTransform: 'uppercase' as const, letterSpacing: 0.7, flexShrink: 0 },
  row:         { display: 'flex', alignItems: 'center', gap: 0, borderBottom: '1px solid var(--border-color)', minWidth: 0 },
  cell:        { padding: '7px 10px', fontSize: 12, overflow: 'hidden', whiteSpace: 'nowrap' as const, textOverflow: 'ellipsis' },
  th:          { fontSize: 10, fontWeight: 700 as const, color: 'var(--text-muted)', textTransform: 'uppercase' as const, letterSpacing: 0.5, padding: '6px 10px' },
  badge:       { display: 'inline-block', borderRadius: 4, padding: '2px 7px', fontSize: 11, fontWeight: 500 as const, whiteSpace: 'nowrap' as const },
  tableBody:   { flex: 1, overflowY: 'auto' as const, border: '1px solid var(--border-color)', borderRadius: '0 0 6px 6px', minHeight: 0 },
  empty:       { padding: '32px 16px', textAlign: 'center' as const, fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 },
  legend:      { fontSize: 11, color: 'var(--text-muted)', flexShrink: 0, paddingTop: 4 },
}
