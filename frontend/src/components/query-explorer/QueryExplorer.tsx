import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useQueryStore } from '@/store/queryStore'
import { useConnectionStore } from '@/store/connectionStore'
import { useEditorStore } from '@/store/editorStore'
import { useUIStore } from '@/store/uiStore'
import { extractTables } from '@/utils/sqlTables'
import { theme } from '@/theme'
import type { QueryHistoryEntry, SavedQuery } from '@/types/query'
import { ProjectsSection } from './ProjectsSection'

type TagMap = Record<string, string> // historyId → tag name

// ── localStorage helpers ──────────────────────────────────────────────────────
const TAGS_KEY    = (cid: string) => `dbai_tags_${cid}`
const loadTags    = (cid: string): TagMap => { try { return JSON.parse(localStorage.getItem(TAGS_KEY(cid)) ?? '{}') } catch { return {} } }
const persistTags = (cid: string, t: TagMap) => localStorage.setItem(TAGS_KEY(cid), JSON.stringify(t))

// ── SQL normalisation for duplicate detection / active-tab matching ──────────
const normSql = (sql: string) => sql.trim().replace(/\s+/g, ' ').toLowerCase()

// Warm gold — marks the item matching the active editor tab
const ACTIVE_TAB_CLR = '#f9e2af'

// ── TreeGroup ─────────────────────────────────────────────────────────────────
function TreeGroup({ label, count, muted, accent, defaultOpen = false, forceOpen = false, level = 0, children }: {
  label: string; count: number; muted?: boolean; accent?: boolean
  defaultOpen?: boolean; forceOpen?: boolean; level?: number; children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen || forceOpen)

  useEffect(() => {
    if (forceOpen) setOpen(true)
  }, [forceOpen])

  const isInner = level > 0
  return (
    <div>
      <div
        style={{
          ...gS.header,
          paddingLeft: 10 + level * 12,
          background: isInner ? theme.bgSecondary : theme.bgPanel,
        }}
        onClick={() => setOpen(v => !v)}
      >
        <span style={gS.arrow}>{open ? '▾' : '▸'}</span>
        <span style={{
          ...gS.label,
          fontSize: isInner ? 11 : 12,
          color: accent ? theme.textMuted : muted ? theme.textMuted : theme.textPrimary,
          fontStyle: accent ? 'italic' as const : 'normal' as const,
        }}>{label}</span>
        <span style={gS.badge}>{count}</span>
      </div>
      {open && <div style={isInner ? { paddingLeft: 8 } : undefined}>{children}</div>}
    </div>
  )
}
const gS = {
  header: { display: 'flex' as const, alignItems: 'center', gap: 5, padding: '5px 10px', cursor: 'pointer', userSelect: 'none' as const, borderBottom: `1px solid ${theme.borderColor}` },
  arrow:  { fontSize: 10, color: theme.textMuted, width: 10, flexShrink: 0 },
  label:  { flex: 1, fontWeight: 600 as const, overflow: 'hidden', whiteSpace: 'nowrap' as const, textOverflow: 'ellipsis' },
  badge:  { fontSize: 10, color: theme.textMuted, background: theme.bgSecondary, borderRadius: 8, padding: '1px 6px', flexShrink: 0 },
}

// ── HistoryItem ───────────────────────────────────────────────────────────────
function HistoryItem({ entry, tag, selected, isActive, onOpen, onDelete, onSetTag, onToggleSelect, onAISave, indent }: {
  entry: QueryHistoryEntry
  tag: string | undefined
  selected: boolean
  isActive?: boolean
  onOpen: (sql: string) => void
  onDelete: (id: string) => void
  onSetTag: (id: string, tag: string) => void
  onToggleSelect: (id: string) => void
  onAISave?: () => void
  indent?: boolean
}) {
  const [hovered, setHovered] = useState(false)
  const [editingTag, setEditingTag] = useState(false)
  const [tagInput, setTagInput] = useState('')

  const startEdit = (e: React.MouseEvent) => { e.stopPropagation(); setTagInput(tag ?? ''); setEditingTag(true) }
  const commitTag = () => { onSetTag(entry.id, tagInput.trim()); setEditingTag(false) }
  const handleClick = (e: React.MouseEvent) => {
    if (editingTag) return
    if (e.ctrlKey || e.metaKey) { e.preventDefault(); onToggleSelect(entry.id) }
    else onOpen(entry.sql_text)
  }

  return (
    <div
      data-qid={entry.id}
      style={{
        ...iS.wrap,
        paddingLeft: indent ? 22 : 10,
        background: selected  ? `${theme.accentColor}1a`
                  : isActive  ? `${ACTIVE_TAB_CLR}18`
                  : hovered   ? theme.bgSecondary
                  : 'transparent',
        borderLeft: selected  ? `2px solid ${theme.accentColor}`
                  : isActive  ? `2px solid ${ACTIVE_TAB_CLR}`
                  : '2px solid transparent',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={handleClick}
    >
      <div style={iS.row}>
        {tag && !editingTag && (
          <span style={iS.tagBadge} title="Click to edit tag" onClick={startEdit}>#{tag}</span>
        )}
        {editingTag ? (
          <input autoFocus style={iS.tagInput} value={tagInput} placeholder="tag name…"
            onClick={e => e.stopPropagation()}
            onChange={e => setTagInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') commitTag(); if (e.key === 'Escape') setEditingTag(false) }}
            onBlur={commitTag}
          />
        ) : (
          <span style={iS.sql}>{entry.sql_text.slice(0, 100)}</span>
        )}
        {hovered && !editingTag && (
          <button style={iS.tagBtn} title="Tag this query" onClick={startEdit}>🏷</button>
        )}
        {hovered && !editingTag && onAISave && (
          <button style={iS.aiBtn} title="Save this query" onClick={e => { e.stopPropagation(); onAISave() }}>🤖</button>
        )}
        {hovered && (
          <button style={iS.delBtn} title="Remove from history" onClick={e => { e.stopPropagation(); onDelete(entry.id) }}>✕</button>
        )}
      </div>
      <div style={iS.meta}>
        <span style={{ color: entry.had_error ? '#f38ba8' : '#a6e3a1' }}>
          {entry.had_error ? '✗ error' : `✓ ${entry.row_count ?? 0} rows`}
        </span>
        {entry.duration_ms != null && <span>{entry.duration_ms}ms</span>}
        <span>{new Date(entry.executed_at).toLocaleTimeString()}</span>
        {selected && <span style={iS.selectedHint}>✓ selected</span>}
      </div>
    </div>
  )
}
const iS = {
  wrap:         { padding: '6px 10px', borderBottom: `1px solid ${theme.borderColor}`, cursor: 'pointer', transition: 'background 0.1s' },
  row:          { display: 'flex' as const, alignItems: 'center', gap: 4, overflow: 'hidden' },
  sql:          { flex: 1, fontSize: 11, color: theme.textPrimary, fontFamily: "'JetBrains Mono', monospace", whiteSpace: 'nowrap' as const, overflow: 'hidden', textOverflow: 'ellipsis' },
  tagBadge:     { fontSize: 10, padding: '1px 6px', background: theme.bgPanel, borderRadius: 3, color: theme.accentColor, cursor: 'pointer', flexShrink: 0, whiteSpace: 'nowrap' as const },
  tagInput:     { fontSize: 11, width: 90, background: theme.bgSecondary, border: `1px solid ${theme.accentColor}`, borderRadius: 3, padding: '1px 5px', color: theme.textPrimary, outline: 'none' },
  tagBtn:       { background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, padding: '0 2px', flexShrink: 0, opacity: 0.6 },
  aiBtn:        { background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, padding: '0 2px', flexShrink: 0, opacity: 0.7 },
  delBtn:       { background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: '#f38ba8', padding: '0 2px', flexShrink: 0 },
  meta:         { display: 'flex' as const, gap: 8, fontSize: 10, color: theme.textMuted, marginTop: 2 },
  selectedHint: { color: theme.accentColor, marginLeft: 'auto' },
}

// ── SavedItem ─────────────────────────────────────────────────────────────────
function SavedItem({ q, isActive, onOpen, onUpdate, onDelete }: {
  q: SavedQuery
  isActive?: boolean
  onOpen: (sql: string, name: string) => void
  onUpdate: (id: string, data: Partial<SavedQuery>) => Promise<void>
  onDelete: (id: string) => void
}) {
  const [hovered, setHovered] = useState(false)
  const [editing, setEditing] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [editName, setEditName] = useState(q.name)
  const [editDesc, setEditDesc] = useState(q.description ?? '')
  const [saving, setSaving] = useState(false)

  const hasDesc = !!q.description

  const startEdit = (e: React.MouseEvent) => { e.stopPropagation(); setEditName(q.name); setEditDesc(q.description ?? ''); setEditing(true) }
  const cancelEdit = (e: React.MouseEvent) => { e.stopPropagation(); setEditing(false) }
  const commitEdit = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!editName.trim()) return
    setSaving(true)
    try {
      await onUpdate(q.id, {
        name: editName.trim(),
        description: editDesc.trim() || undefined,
        sql_text: q.sql_text,
        tags: q.tags,
      })
      setEditing(false)
    }
    finally { setSaving(false) }
  }

  if (editing) {
    return (
      <div style={{ ...svS.card, background: theme.bgSecondary }} onClick={e => e.stopPropagation()}>
        <input autoFocus style={{ ...svS.editInput, marginBottom: 5 }} value={editName} placeholder="Query name *"
          onChange={e => setEditName(e.target.value)} onKeyDown={e => e.key === 'Escape' && setEditing(false)} />
        <input style={svS.editInput} value={editDesc} placeholder="Description (optional)"
          onChange={e => setEditDesc(e.target.value)} onKeyDown={e => e.key === 'Escape' && setEditing(false)} />
        <div style={svS.editBtns}>
          <button style={svS.cancelBtn} onClick={cancelEdit}>Cancel</button>
          <button style={{ ...svS.saveBtn, opacity: editName.trim() ? 1 : 0.5 }} disabled={!editName.trim() || saving} onClick={commitEdit}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div
      data-qid={q.id}
      draggable
      onDragStart={e => {
        e.dataTransfer.effectAllowed = 'copy'
        e.dataTransfer.setData('application/dbai-query-id', q.id)
      }}
      style={{
        ...svS.card,
        background:   isActive ? `${ACTIVE_TAB_CLR}18` : hovered ? theme.bgPanel : theme.bgSecondary,
        borderColor:  isActive ? ACTIVE_TAB_CLR : hovered ? theme.accentColor : theme.borderColor,
        boxShadow:    hovered || isActive ? '0 2px 8px rgba(0,0,0,0.25)' : 'none',
        cursor: 'grab',
      }}
      onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      onClick={() => hasDesc ? setExpanded(v => !v) : onOpen(q.sql_text, q.name)}
      onDoubleClick={() => onOpen(q.sql_text, q.name)}
    >
      <div style={iS.row}>
        <span style={svS.expandArrow}>{hasDesc ? (expanded ? '▾' : '▸') : ' '}</span>
        <span style={svS.name}>{q.name}</span>
        {hovered && (
          <>
            <button style={svS.openBtn} title="Open in editor" onClick={e => { e.stopPropagation(); onOpen(q.sql_text, q.name) }}>→</button>
            <button style={iS.tagBtn} title="Edit" onClick={startEdit}>✎</button>
            <button style={iS.delBtn} title="Delete" onClick={e => { e.stopPropagation(); onDelete(q.id) }}>✕</button>
          </>
        )}
      </div>
      {expanded && q.description && <div style={svS.desc}>{q.description}</div>}
    </div>
  )
}
const svS = {
  card:      { margin: '2px 6px', padding: '7px 10px', borderRadius: 8, border: `1px solid ${theme.borderColor}`, cursor: 'pointer', transition: 'background 0.15s, border-color 0.15s, box-shadow 0.15s', background: theme.bgSecondary },
  name:      { flex: 1, fontSize: 12, fontWeight: 600 as const, color: theme.textPrimary, overflow: 'hidden', whiteSpace: 'nowrap' as const, textOverflow: 'ellipsis' },
  expandArrow: { fontSize: 10, color: theme.textMuted, width: 10, flexShrink: 0, userSelect: 'none' as const },
  openBtn:     { background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: theme.accentColor, padding: '0 2px', flexShrink: 0, fontWeight: 600 as const },
  desc:      { fontSize: 11, color: theme.textMuted, marginTop: 5, lineHeight: 1.4, paddingLeft: 14 },
  editInput: { width: '100%', background: theme.bgPanel, border: `1px solid ${theme.borderColor}`, borderRadius: 4, padding: '4px 7px', color: theme.textPrimary, fontSize: 12, outline: 'none', boxSizing: 'border-box' as const },
  editBtns:  { display: 'flex', gap: 6, justifyContent: 'flex-end', marginTop: 6 },
  cancelBtn: { background: 'none', border: `1px solid ${theme.borderColor}`, borderRadius: 4, padding: '3px 9px', color: theme.textMuted, cursor: 'pointer', fontSize: 11 },
  saveBtn:   { background: theme.accentColor, border: 'none', borderRadius: 4, padding: '3px 9px', color: '#fff', cursor: 'pointer', fontSize: 11 },
}

// ── SectionBlock ──────────────────────────────────────────────────────────────
// Top-level collapsible section header used inside the Workspace panel
function SectionBlock({ label, badge, defaultOpen = true, children }: {
  label: string; badge?: number; defaultOpen?: boolean; children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div>
      <div style={sbS.header} onClick={() => setOpen(v => !v)}>
        <span style={sbS.arrow}>{open ? '▾' : '▸'}</span>
        <span style={sbS.label}>{label}</span>
        {badge !== undefined && <span style={sbS.badge}>{badge}</span>}
      </div>
      {open && <div style={{ paddingLeft: 10 }}>{children}</div>}
    </div>
  )
}
const sbS = {
  header: { display: 'flex' as const, alignItems: 'center', gap: 5, padding: '7px 12px',
    cursor: 'pointer', userSelect: 'none' as const, background: theme.bgPanel,
    borderBottom: `1px solid ${theme.borderColor}`,
    position: 'sticky' as const, top: 0, zIndex: 3 },
  arrow:  { fontSize: 10, color: theme.accentColor, width: 10, flexShrink: 0 },
  label:  { flex: 1, fontSize: 11, fontWeight: 700 as const, color: theme.textPrimary,
    textTransform: 'uppercase' as const, letterSpacing: 0.8 },
  badge:  { fontSize: 10, color: theme.textMuted, background: theme.bgSecondary,
    borderRadius: 8, padding: '1px 6px', flexShrink: 0 },
}

// Tracks the last query ID that triggered a force-open — persists across panel remounts
// so we don't re-open tree groups the user has manually collapsed.
let _lastForceOpenedId: string | null = null

// ── QueryExplorer (main) ──────────────────────────────────────────────────────
export function QueryExplorer() {
  const [searchText, setSearchText] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [tags, setTagsState] = useState<TagMap>({})
  const [activeQueryId, setActiveQueryId] = useState<string | null>(null)

  const { connectedIds, activeConnectionId, profiles } = useConnectionStore(s => ({
    connectedIds: s.connectedIds,
    activeConnectionId: s.activeConnectionId,
    profiles: s.profiles,
  }))
  const { historyByConn, saved, loadHistory, loadSaved, updateSaved, deleteHistory, deleteSaved } = useQueryStore()
  const { openTab, tabs, activeTabId } = useEditorStore(s => ({ openTab: s.openTab, tabs: s.tabs, activeTabId: s.activeTabId }))
  const { setLeftPanel, openSavePanel, pendingScrollToId, clearPendingScroll } = useUIStore(s => ({
    setLeftPanel:       s.setLeftPanel,
    openSavePanel:      s.openSavePanel,
    pendingScrollToId:  s.pendingScrollToId,
    clearPendingScroll: s.clearPendingScroll,
  }))

  const activeNorm = useMemo(() => {
    const sql = (tabs.find(t => t.id === activeTabId)?.sql ?? '').trim()
    return sql ? normSql(sql) : ''
  }, [tabs, activeTabId])

  // Stable key for connectedIds set to avoid effect thrashing
  const connectedIdsKey = [...connectedIds].sort().join(',')

  useEffect(() => {
    const ids = [...connectedIds]
    if (!ids.length) return

    // Load history for every connected connection
    ids.forEach(cid => loadHistory(cid))
    // Load all saved queries (no filter — groups by connection_id in render)
    loadSaved()

    // Merge tags from all connected connections
    const merged: TagMap = {}
    ids.forEach(cid => Object.assign(merged, loadTags(cid)))
    setTagsState(merged)

    setSelectedIds(new Set())
  }, [connectedIdsKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // Flat history across all connected connections
  const allHistory = useMemo(() => {
    return [...connectedIds].flatMap(cid => historyByConn[cid] ?? [])
  }, [connectedIds, historyByConn])

  const setTag = useCallback((id: string, tag: string) => {
    // Find which connection owns this history entry
    const connId = [...connectedIds].find(cid =>
      (historyByConn[cid] ?? []).some(e => e.id === id)
    ) ?? activeConnectionId
    if (!connId) return
    setTagsState(prev => {
      const next = { ...prev }
      if (tag) next[id] = tag; else delete next[id]
      const connTags = { ...loadTags(connId) }
      if (tag) connTags[id] = tag; else delete connTags[id]
      persistTags(connId, connTags)
      return next
    })
  }, [connectedIds, historyByConn, activeConnectionId])

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }, [])

  // Build table-level map for saved queries within a connection.
  // Each query appears under every table it references.
  const buildTableTree = (queries: SavedQuery[]) => {
    const map = new Map<string, SavedQuery[]>()
    for (const q of queries) {
      const keys = extractTables(q.sql_text)
      const buckets = keys.length > 0 ? keys : ['\x00other']
      for (const bucket of buckets) {
        const b = map.get(bucket) ?? []
        b.push(q)
        map.set(bucket, b)
      }
    }
    const ks = [...map.keys()].filter(k => k !== '\x00other').sort()
    if (map.has('\x00other')) ks.push('\x00other')
    return { map, keys: ks }
  }

  // Unsaved history per connection: entries not already saved, deduped
  const getUnsavedForConn = (connId: string) => {
    const connHistory = historyByConn[connId] ?? []
    const connSaved = saved.filter(q => q.connection_id === connId)
    const savedNorms = new Set(connSaved.map(q => normSql(q.sql_text)))
    const seen = new Set<string>()
    return connHistory.filter(e => {
      if (e.had_error) return false
      const n = normSql(e.sql_text)
      if (savedNorms.has(n) || seen.has(n)) return false
      seen.add(n)
      return true
    })
  }

  // ── Search filters ─────────────────────────────────────────────────────────
  const isSearching = searchText.trim().length > 0

  const filteredSaved = useMemo(() => {
    const q = searchText.toLowerCase().trim()
    if (!q) return []
    return saved.filter(s =>
      s.name.toLowerCase().includes(q) ||
      (s.description ?? '').toLowerCase().includes(q) ||
      s.sql_text.toLowerCase().includes(q)
    )
  }, [saved, searchText])

  const filteredUnsaved = useMemo(() => {
    const q = searchText.toLowerCase().trim()
    if (!q) return []
    return allHistory.filter(e =>
      !e.had_error &&
      (e.sql_text.toLowerCase().includes(q) ||
       (tags[e.id] ?? '').toLowerCase().includes(q) ||
       extractTables(e.sql_text).some(t => t.includes(q)))
    )
  }, [allHistory, tags, searchText])

  // ── Active match — sync activeQueryId when active tab changes ──────────────
  const scrollTimerRef = useRef<ReturnType<typeof setTimeout>>()
  useEffect(() => {
    const matchId = activeNorm
      ? saved.find(q => normSql(q.sql_text) === activeNorm)?.id ?? null
      : null
    setActiveQueryId(matchId)
    // Stamp the force-open tracker so panel re-mounts with this same query don't re-open groups
    if (matchId) _lastForceOpenedId = matchId
    if (!matchId) return
    setLeftPanel('queries')
    clearTimeout(scrollTimerRef.current)
    scrollTimerRef.current = setTimeout(() => {
      document.querySelector(`[data-qid="${matchId}"]`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }, 180)
    return () => clearTimeout(scrollTimerRef.current)
  }, [activeTabId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!pendingScrollToId) return
    setActiveQueryId(pendingScrollToId)
    _lastForceOpenedId = pendingScrollToId
    setLeftPanel('queries')
    clearTimeout(scrollTimerRef.current)
    scrollTimerRef.current = setTimeout(() => {
      document.querySelector(`[data-qid="${pendingScrollToId}"]`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      clearPendingScroll()
    }, 200)
    return () => clearTimeout(scrollTimerRef.current)
  }, [pendingScrollToId]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleDeleteHistory = async (entryId: string, connId: string) => {
    await deleteHistory(connId, entryId)
  }

  const handleItemSave = (sql: string) => {
    openTab(sql)
    openSavePanel()
  }

  const hasSel  = selectedIds.size > 0
  const isEmpty = saved.length === 0 && allHistory.length === 0

  const connIds = [...connectedIds]

  const hp = (e: QueryHistoryEntry, connId: string, indent = false) => ({
    entry: e, tag: tags[e.id], selected: selectedIds.has(e.id),
    isActive: activeNorm !== '' && normSql(e.sql_text) === activeNorm,
    onOpen: (sql: string) => openTab(sql, undefined, true),
    onDelete: (id: string) => handleDeleteHistory(id, connId),
    onSetTag: setTag,
    onToggleSelect: toggleSelect,
    onAISave: () => handleItemSave(e.sql_text),
    indent,
  })

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={S.container}>

      {/* Header */}
      <div style={S.header}>
        <span style={S.title}>Workspace</span>
        <div style={S.headerBtns}>
          {hasSel && (
            <button style={S.clearSelBtn} onClick={() => setSelectedIds(new Set())} title="Clear selection">
              ✕ {selectedIds.size}
            </button>
          )}
          <button style={S.saveBtn} onClick={openSavePanel} title="Save current query">
            💾 Save
          </button>
        </div>
      </div>

      {/* Search bar */}
      <div style={S.searchRow}>
        <input
          style={S.searchInput}
          placeholder="Search queries, tables, tags… (Ctrl+click to select)"
          value={searchText}
          onChange={e => setSearchText(e.target.value)}
        />
        {searchText && <button style={S.clearBtn} onClick={() => setSearchText('')}>✕</button>}
      </div>

      {/* Body */}
      <div style={S.body}>

        {/* ── Query Library section ── */}
        <SectionBlock label="Query Library" badge={saved.length}>

          {isEmpty ? (
            <div style={S.empty}>No queries yet.</div>

          ) : isSearching ? (
            filteredSaved.length === 0 && filteredUnsaved.length === 0
              ? <div style={S.empty}>No matching queries.</div>
              : <>
                  {filteredSaved.length > 0 && (
                    <>
                      <div style={S.sectionLabel}>Saved</div>
                      {filteredSaved.map(q => (
                        <SavedItem key={q.id} q={q}
                          isActive={q.id === activeQueryId}
                          onOpen={(sql, name) => { setActiveQueryId(q.id); openTab(sql, name, true) }}
                          onUpdate={updateSaved}
                          onDelete={id => deleteSaved(id)}
                        />
                      ))}
                    </>
                  )}
                  {filteredUnsaved.length > 0 && (
                    <>
                      <div style={S.sectionLabel}>Unsaved</div>
                      {filteredUnsaved.map(e => <HistoryItem key={e.id} {...hp(e, e.connection_id)} />)}
                    </>
                  )}
                </>

          ) : (
            <>
              {connIds.map(connId => {
                const profile     = profiles.find(p => p.id === connId)
                const connName    = profile?.name ?? connId
                const connSaved   = saved.filter(q => q.connection_id === connId)
                const connUnsaved = getUnsavedForConn(connId)
                const total       = connSaved.length + connUnsaved.length
                const hasActive   = !!activeQueryId && (
                  connSaved.some(q => q.id === activeQueryId) ||
                  connUnsaved.some(e => normSql(e.sql_text) === activeNorm)
                )
                const { map: tableMap, keys: tableKeys } = buildTableTree(connSaved)

                // Only force-open the FIRST table group when this is a freshly-activated query.
                const isNewForceOpen = activeQueryId !== null && activeQueryId !== _lastForceOpenedId
                const firstActiveTableKey = isNewForceOpen
                  ? tableKeys.find(k => (tableMap.get(k) ?? []).some(q => q.id === activeQueryId)) ?? null
                  : null

                return (
                  <TreeGroup key={connId} label={connName} count={total} forceOpen={hasActive} defaultOpen>
                    {tableKeys.map(tKey => {
                      const tableItems     = tableMap.get(tKey) ?? []
                      const tableHasActive = tKey === firstActiveTableKey
                      return (
                        <TreeGroup key={tKey} label={tKey === '\x00other' ? '(other)' : tKey}
                          count={tableItems.length} muted={tKey === '\x00other'}
                          forceOpen={tableHasActive} level={1}>
                          {tableItems.map(q => (
                            <SavedItem key={q.id} q={q}
                              isActive={q.id === activeQueryId}
                              onOpen={(sql, name) => { setActiveQueryId(q.id); openTab(sql, name, true) }}
                              onUpdate={updateSaved}
                              onDelete={id => deleteSaved(id)}
                            />
                          ))}
                        </TreeGroup>
                      )
                    })}
                    {connUnsaved.length > 0 && (
                      <TreeGroup label="Unsaved" count={connUnsaved.length} accent level={1}
                        forceOpen={connUnsaved.some(e => normSql(e.sql_text) === activeNorm)}>
                        {connUnsaved.map(e => <HistoryItem key={e.id} {...hp(e, connId, true)} />)}
                      </TreeGroup>
                    )}
                  </TreeGroup>
                )
              })}
            </>
          )}

        </SectionBlock>

        {/* ── Projects section ── */}
        <ProjectsSection
          saved={saved}
          onOpen={(sql, name) => openTab(sql, name, true)}
        />

      </div>
    </div>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────
const S = {
  container:    { display: 'flex' as const, flexDirection: 'column' as const, height: '100%' },
  header:       { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderBottom: `1px solid ${theme.borderColor}` },
  title:        { fontSize: 12, fontWeight: 600 as const, color: theme.textMuted, textTransform: 'uppercase' as const, letterSpacing: 1 },
  headerBtns:   { display: 'flex', alignItems: 'center', gap: 6 },
  saveBtn:      { background: 'none', border: 'none', color: theme.accentColor, cursor: 'pointer', fontSize: 12, padding: '2px 0', whiteSpace: 'nowrap' as const },
  clearSelBtn:  { background: 'none', border: 'none', color: theme.textMuted, cursor: 'pointer', fontSize: 11, padding: '2px 0' },
  searchRow:    { padding: '6px 10px', borderBottom: `1px solid ${theme.borderColor}`, display: 'flex', alignItems: 'center', gap: 4 },
  searchInput:  { flex: 1, background: theme.bgSecondary, border: `1px solid ${theme.borderColor}`, borderRadius: 4, padding: '5px 8px', color: theme.textPrimary, fontSize: 11, outline: 'none' },
  clearBtn:     { background: 'none', border: 'none', color: theme.textMuted, cursor: 'pointer', fontSize: 11, padding: '0 2px' },
  body:         { flex: 1, overflowY: 'auto' as const },
  sectionLabel: { padding: '5px 10px', fontSize: 10, fontWeight: 600 as const, color: theme.textMuted, textTransform: 'uppercase' as const, letterSpacing: 0.5, background: theme.bgPanel, borderBottom: `1px solid ${theme.borderColor}` },
  empty:        { padding: 16, color: theme.textMuted, fontSize: 12, textAlign: 'center' as const },
}
