import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useQueryStore } from '@/store/queryStore'
import { useConnectionStore } from '@/store/connectionStore'
import { useEditorStore } from '@/store/editorStore'
import { useUIStore } from '@/store/uiStore'
import { aiService } from '@/services/aiService'
import { extractTables } from '@/utils/sqlTables'
import { theme } from '@/theme'
import type { QueryHistoryEntry, SavedQuery } from '@/types/query'

type TagMap = Record<string, string> // historyId → tag name

// ── localStorage helpers ──────────────────────────────────────────────────────
const TAGS_KEY    = (cid: string) => `dbai_tags_${cid}`
const loadTags    = (cid: string): TagMap => { try { return JSON.parse(localStorage.getItem(TAGS_KEY(cid)) ?? '{}') } catch { return {} } }
const persistTags = (cid: string, t: TagMap) => localStorage.setItem(TAGS_KEY(cid), JSON.stringify(t))

// ── SQL normalisation for duplicate detection / active-tab matching ──────────
const normSql = (sql: string) => sql.trim().replace(/\s+/g, ' ').toLowerCase()

// Warm gold — marks the item matching the active editor tab (distinct from purple multi-select)
const ACTIVE_TAB_CLR = '#f9e2af'

// ── TreeGroup ─────────────────────────────────────────────────────────────────
function TreeGroup({ label, count, muted, accent, defaultOpen = false, forceOpen = false, children }: {
  label: string; count: number; muted?: boolean; accent?: boolean
  defaultOpen?: boolean; forceOpen?: boolean; children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen || forceOpen)

  // Re-open if a matching item appears in this group (e.g. switching editor tabs)
  useEffect(() => {
    if (forceOpen) setOpen(true)
  }, [forceOpen])

  return (
    <div>
      <div style={gS.header} onClick={() => setOpen(v => !v)}>
        <span style={gS.arrow}>{open ? '▾' : '▸'}</span>
        <span style={{ ...gS.label, color: accent ? theme.textMuted : muted ? theme.textMuted : theme.textPrimary, fontStyle: accent ? 'italic' as const : 'normal' as const }}>{label}</span>
        <span style={gS.badge}>{count}</span>
      </div>
      {open && <div>{children}</div>}
    </div>
  )
}
const gS = {
  header: { display: 'flex' as const, alignItems: 'center', gap: 5, padding: '5px 10px', cursor: 'pointer', userSelect: 'none' as const, borderBottom: `1px solid ${theme.borderColor}`, background: theme.bgPanel },
  arrow:  { fontSize: 10, color: theme.textMuted, width: 10, flexShrink: 0 },
  label:  { flex: 1, fontSize: 12, fontWeight: 600 as const, overflow: 'hidden', whiteSpace: 'nowrap' as const, textOverflow: 'ellipsis' },
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
          <button style={iS.aiBtn} title="AI Save this query" onClick={e => { e.stopPropagation(); onAISave() }}>🤖</button>
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
  const [editName, setEditName] = useState(q.name)
  const [editDesc, setEditDesc] = useState(q.description ?? '')
  const [saving, setSaving] = useState(false)

  const startEdit = (e: React.MouseEvent) => { e.stopPropagation(); setEditName(q.name); setEditDesc(q.description ?? ''); setEditing(true) }
  const cancelEdit = (e: React.MouseEvent) => { e.stopPropagation(); setEditing(false) }
  const commitEdit = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!editName.trim()) return
    setSaving(true)
    try { await onUpdate(q.id, { name: editName.trim(), description: editDesc.trim() || undefined }); setEditing(false) }
    finally { setSaving(false) }
  }

  if (editing) {
    return (
      <div style={{ ...svS.wrap, background: theme.bgSecondary }} onClick={e => e.stopPropagation()}>
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
      style={{
        ...svS.wrap,
        background:  isActive ? `${ACTIVE_TAB_CLR}18` : hovered ? theme.bgSecondary : 'transparent',
        borderLeft:  isActive ? `2px solid ${ACTIVE_TAB_CLR}` : '2px solid transparent',
      }}
      onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      onClick={() => onOpen(q.sql_text, q.name)}>
      <div style={iS.row}>
        <span style={svS.name}>{q.name}</span>
        {hovered && (
          <>
            <button style={iS.tagBtn} title="Edit" onClick={startEdit}>✎</button>
            <button style={iS.delBtn} title="Delete" onClick={e => { e.stopPropagation(); onDelete(q.id) }}>✕</button>
          </>
        )}
      </div>
      {q.description && <div style={svS.desc}>{q.description}</div>}
      <div style={{ ...iS.sql, marginTop: 2 }}>{q.sql_text.slice(0, 80)}</div>
    </div>
  )
}
const svS = {
  wrap:      { padding: '6px 10px', paddingLeft: 8, borderBottom: `1px solid ${theme.borderColor}`, borderLeft: '2px solid transparent', cursor: 'pointer', transition: 'background 0.1s, border-left-color 0.1s' },
  name:      { flex: 1, fontSize: 13, fontWeight: 500 as const, color: theme.textPrimary, overflow: 'hidden', whiteSpace: 'nowrap' as const, textOverflow: 'ellipsis' },
  desc:      { fontSize: 11, color: theme.textMuted, marginTop: 1 },
  editInput: { width: '100%', background: theme.bgPanel, border: `1px solid ${theme.borderColor}`, borderRadius: 4, padding: '4px 7px', color: theme.textPrimary, fontSize: 12, outline: 'none', boxSizing: 'border-box' as const },
  editBtns:  { display: 'flex', gap: 6, justifyContent: 'flex-end', marginTop: 6 },
  cancelBtn: { background: 'none', border: `1px solid ${theme.borderColor}`, borderRadius: 4, padding: '3px 9px', color: theme.textMuted, cursor: 'pointer', fontSize: 11 },
  saveBtn:   { background: theme.accentColor, border: 'none', borderRadius: 4, padding: '3px 9px', color: '#fff', cursor: 'pointer', fontSize: 11 },
}

// ── QueryExplorer (main) ──────────────────────────────────────────────────────
export function QueryExplorer() {
  const [searchText, setSearchText] = useState('')

  // ── Normal save form ───────────────────────────────────────────────────────
  const [showSaveForm, setShowSaveForm] = useState(false)
  const [saveName, setSaveName] = useState('')
  const [saveDesc, setSaveDesc] = useState('')
  const [saving, setSaving] = useState(false)

  // ── Multi-select + AI Save ─────────────────────────────────────────────────
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [showAiSaveForm, setShowAiSaveForm] = useState(false)
  const [aiSaving, setAiSaving] = useState(false)
  const [aiSaveProgress, setAiSaveProgress] = useState('')

  // ── Tags ───────────────────────────────────────────────────────────────────
  const [tags, setTagsState] = useState<TagMap>({})

  const { activeConnectionId } = useConnectionStore()
  const { history, saved, loadHistory, loadSaved, saveQuery, updateSaved, deleteHistory, deleteSaved } = useQueryStore()
  const { openTab, tabs, activeTabId } = useEditorStore(s => ({ openTab: s.openTab, tabs: s.tabs, activeTabId: s.activeTabId }))
  const setLeftPanel = useUIStore(s => s.setLeftPanel)

  // Normalised SQL of the currently active editor tab — used to highlight the matching query in the panel
  const activeNorm = useMemo(() => {
    const sql = (tabs.find(t => t.id === activeTabId)?.sql ?? '').trim()
    return sql ? normSql(sql) : ''
  }, [tabs, activeTabId])

  const getActiveSQL = () => {
    const s = useEditorStore.getState()
    return s.tabs.find(x => x.id === s.activeTabId)?.sql ?? ''
  }

  useEffect(() => {
    if (!activeConnectionId) return
    setTagsState(loadTags(activeConnectionId))
    loadHistory(activeConnectionId)
    loadSaved(activeConnectionId)
    setSelectedIds(new Set())
  }, [activeConnectionId])

  const setTag = useCallback((id: string, tag: string) => {
    if (!activeConnectionId) return
    setTagsState(prev => {
      const next = { ...prev }
      if (tag) next[id] = tag; else delete next[id]
      persistTags(activeConnectionId, next)
      return next
    })
  }, [activeConnectionId])

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }, [])

  // ── Saved tree ─────────────────────────────────────────────────────────────
  const savedTableTree = useMemo(() => {
    const map = new Map<string, SavedQuery[]>()
    for (const q of saved) {
      const keys = extractTables(q.sql_text)
      const buckets = keys.length > 0 ? keys : ['\x00other']
      for (const k of buckets) { const b = map.get(k) ?? []; b.push(q); map.set(k, b) }
    }
    return map
  }, [saved])

  const savedTableKeys = useMemo(() => {
    const ks = [...savedTableTree.keys()].filter(k => k !== '\x00other').sort()
    if (savedTableTree.has('\x00other')) ks.push('\x00other')
    return ks
  }, [savedTableTree])

  // ── Unsaved history: history entries not already saved, deduped ────────────
  const unsavedHistory = useMemo(() => {
    const savedNorms = new Set(saved.map(q => normSql(q.sql_text)))
    const seen = new Set<string>()
    return history.filter(e => {
      const n = normSql(e.sql_text)
      if (savedNorms.has(n) || seen.has(n)) return false
      seen.add(n)
      return true
    })
  }, [history, saved])

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
    return unsavedHistory.filter(e =>
      e.sql_text.toLowerCase().includes(q) ||
      (tags[e.id] ?? '').toLowerCase().includes(q) ||
      extractTables(e.sql_text).some(t => t.includes(q))
    )
  }, [unsavedHistory, tags, searchText])

  // ── Active match: which item corresponds to the current editor tab ──────────
  const activeMatchId = useMemo(() => {
    if (!activeNorm) return null
    return (
      saved.find(q => normSql(q.sql_text) === activeNorm)?.id ??
      unsavedHistory.find(e => normSql(e.sql_text) === activeNorm)?.id ??
      null
    )
  }, [activeNorm, saved, unsavedHistory])

  // Switch to Queries panel and scroll to the matching item when the editor tab changes
  const scrollTimerRef = useRef<ReturnType<typeof setTimeout>>()
  useEffect(() => {
    if (!activeMatchId) return
    setLeftPanel('queries')
    clearTimeout(scrollTimerRef.current)
    scrollTimerRef.current = setTimeout(() => {
      document.querySelector(`[data-qid="${activeMatchId}"]`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }, 180)
    return () => clearTimeout(scrollTimerRef.current)
  }, [activeTabId]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Normal save ────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!saveName.trim()) return
    setSaving(true)
    try {
      await saveQuery({ name: saveName.trim(), description: saveDesc.trim() || undefined, sql_text: getActiveSQL(), connection_id: activeConnectionId ?? undefined })
      setSaveName(''); setSaveDesc(''); setShowSaveForm(false)
    } finally { setSaving(false) }
  }

  // ── AI Save ────────────────────────────────────────────────────────────────
  const handleAISave = async () => {
    if (!activeConnectionId || selectedIds.size === 0) return
    setAiSaving(true)
    const savedNorms = new Set(saved.map(q => normSql(q.sql_text)))
    const entries = history.filter(e => selectedIds.has(e.id))
    let done = 0; let skipped = 0
    for (const e of entries) {
      const norm = normSql(e.sql_text)
      if (savedNorms.has(norm)) { skipped++; done++; continue }
      setAiSaveProgress(`Saving ${done + 1 - skipped} / ${entries.length - skipped}…`)
      try {
        const { name, description } = await aiService.nameQuery(activeConnectionId, e.sql_text)
        await saveQuery({ name, description, sql_text: e.sql_text, connection_id: activeConnectionId })
        savedNorms.add(norm)
      } catch { /* skip failed */ }
      done++
    }
    setSelectedIds(new Set())
    setShowAiSaveForm(false)
    setAiSaving(false)
    setAiSaveProgress('')
  }

  const handleDeleteHistory = async (id: string) => {
    if (activeConnectionId) await deleteHistory(activeConnectionId, id)
  }

  // Single-item AI Save: pre-select that item then open the AI Save panel
  const handleSingleAISave = (id: string) => {
    setSelectedIds(new Set([id]))
    setShowAiSaveForm(true)
  }

  const hp = (e: QueryHistoryEntry, indent = false) => ({
    entry: e, tag: tags[e.id], selected: selectedIds.has(e.id),
    isActive: activeNorm !== '' && normSql(e.sql_text) === activeNorm,
    onOpen: (sql: string) => openTab(sql),
    onDelete: handleDeleteHistory,
    onSetTag: setTag,
    onToggleSelect: toggleSelect,
    onAISave: () => handleSingleAISave(e.id),
    indent,
  })

  const hasSel  = selectedIds.size > 0
  const canSave = activeNorm !== ''           // Only enable Save when active tab has SQL
  const isEmpty = saved.length === 0 && history.length === 0

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={S.container}>

      {/* Header */}
      <div style={S.header}>
        <span style={S.title}>Queries</span>
        {hasSel ? (
          <div style={S.aiSaveBtnGroup}>
            <button style={S.aiSaveBtn} onClick={() => setShowAiSaveForm(v => !v)} title="AI-generate names and save selected queries">
              🤖 AI Save ({selectedIds.size})
            </button>
            <button style={S.clearSelBtn} onClick={() => setSelectedIds(new Set())} title="Clear selection">✕</button>
          </div>
        ) : (
          <button
            style={{ ...S.saveBtn, opacity: canSave ? 1 : 0.3, cursor: canSave ? 'pointer' : 'default' }}
            onClick={() => canSave && setShowSaveForm(v => !v)}
            title={canSave ? 'Save current query' : 'Open a query tab to save'}
          >+ Save</button>
        )}
      </div>

      {/* Normal save form */}
      {showSaveForm && !hasSel && (
        <div style={S.saveForm}>
          <div style={S.saveFormSql}>{getActiveSQL().slice(0, 120) || '— no active query —'}</div>
          <input style={S.saveInput} placeholder="Query name *" value={saveName} autoFocus onChange={e => setSaveName(e.target.value)} />
          <input style={S.saveInput} placeholder="Description (optional)" value={saveDesc} onChange={e => setSaveDesc(e.target.value)} />
          <div style={S.saveFormBtns}>
            <button style={S.saveCancelBtn} onClick={() => setShowSaveForm(false)}>Cancel</button>
            <button style={{ ...S.saveConfirmBtn, opacity: saveName.trim() ? 1 : 0.5 }} disabled={!saveName.trim() || saving} onClick={handleSave}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      )}

      {/* AI Save form */}
      {showAiSaveForm && hasSel && (() => {
        const selectedEntries = history.filter(e => selectedIds.has(e.id))
        const savedNormsSet   = new Set(saved.map(q => normSql(q.sql_text)))
        const batchNorms = new Set<string>()
        const dupIds     = new Set<string>()
        for (const e of selectedEntries) {
          const n = normSql(e.sql_text)
          if (savedNormsSet.has(n) || batchNorms.has(n)) dupIds.add(e.id)
          else batchNorms.add(n)
        }
        const newCount = selectedEntries.length - dupIds.size
        return (
          <div style={S.aiSavePanel}>
            <div style={S.aiSavePanelTitle}>
              AI Save — {newCount} {newCount === 1 ? 'query' : 'queries'}
              {dupIds.size > 0 && <span style={S.aiSaveDupHint}> ({dupIds.size} duplicate{dupIds.size > 1 ? 's' : ''} skipped)</span>}
              <span style={S.aiSavePanelHint}>Names & descriptions will be generated automatically</span>
            </div>
            <div style={S.aiSaveList}>
              {selectedEntries.map(e => {
                const isDup = dupIds.has(e.id)
                return (
                  <div key={e.id} style={{ ...S.aiSaveRow, opacity: isDup ? 0.45 : 1 }}>
                    <div style={S.aiSaveRowHeader}>
                      <div style={S.aiSaveRowSql}>{e.sql_text.slice(0, 90)}</div>
                      {isDup && <span style={S.aiSaveDupTag}>already saved</span>}
                    </div>
                    {!isDup && (
                      <div style={S.aiSaveRowFields}>
                        <input style={S.aiSaveGrayInput} placeholder="Auto Generated" disabled />
                        <input style={S.aiSaveGrayInput} placeholder="Auto Generated" disabled />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
            <div style={S.aiSavePanelFooter}>
              {aiSaveProgress && <span style={S.aiSaveProgressTxt}>{aiSaveProgress}</span>}
              <button style={S.saveCancelBtn} onClick={() => setShowAiSaveForm(false)} disabled={aiSaving}>Cancel</button>
              <button style={{ ...S.aiSaveConfirmBtn, opacity: aiSaving || newCount === 0 ? 0.5 : 1 }} disabled={aiSaving || newCount === 0} onClick={handleAISave}>
                {aiSaving ? aiSaveProgress || 'Saving…' : `🤖 AI Save${newCount > 0 ? ` (${newCount})` : ''}`}
              </button>
            </div>
          </div>
        )
      })()}

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

        {isEmpty ? (
          <div style={S.empty}>No queries yet.</div>

        ) : isSearching ? (
          /* ── Search mode: flat results in two sections ── */
          filteredSaved.length === 0 && filteredUnsaved.length === 0
            ? <div style={S.empty}>No matching queries.</div>
            : <>
                {filteredSaved.length > 0 && (
                  <>
                    <div style={S.sectionLabel}>Saved</div>
                    {filteredSaved.map(q => (
                      <SavedItem key={q.id} q={q}
                        isActive={activeNorm !== '' && normSql(q.sql_text) === activeNorm}
                        onOpen={(sql, name) => openTab(sql, name)}
                        onUpdate={updateSaved}
                        onDelete={id => deleteSaved(id)}
                      />
                    ))}
                  </>
                )}
                {filteredUnsaved.length > 0 && (
                  <>
                    <div style={S.sectionLabel}>Unsaved</div>
                    {filteredUnsaved.map(e => <HistoryItem key={e.id} {...hp(e)} />)}
                  </>
                )}
              </>

        ) : (
          /* ── Tree mode ── */
          <>
            {/* Saved groups by table */}
            {savedTableKeys.map(k => {
              const groupItems = savedTableTree.get(k) ?? []
              const groupHasActive = activeNorm !== '' && groupItems.some(q => normSql(q.sql_text) === activeNorm)
              return (
                <TreeGroup key={k} label={k === '\x00other' ? '(other)' : k} count={groupItems.length} muted={k === '\x00other'} forceOpen={groupHasActive}>
                  {groupItems.map(q => (
                    <SavedItem key={q.id} q={q}
                      isActive={activeNorm !== '' && normSql(q.sql_text) === activeNorm}
                      onOpen={(sql, name) => openTab(sql, name)}
                      onUpdate={updateSaved}
                      onDelete={id => deleteSaved(id)}
                    />
                  ))}
                </TreeGroup>
              )
            })}

            {/* Unsaved Queries group */}
            {unsavedHistory.length > 0 && (
              <TreeGroup label="Unsaved Queries" count={unsavedHistory.length} accent
                forceOpen={activeNorm !== '' && unsavedHistory.some(e => normSql(e.sql_text) === activeNorm)}>
                {unsavedHistory.map(e => <HistoryItem key={e.id} {...hp(e, true)} />)}
              </TreeGroup>
            )}
          </>
        )}

      </div>
    </div>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────
const S = {
  container:        { display: 'flex' as const, flexDirection: 'column' as const, height: '100%' },

  // Header
  header:           { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderBottom: `1px solid ${theme.borderColor}` },
  title:            { fontSize: 12, fontWeight: 600 as const, color: theme.textMuted, textTransform: 'uppercase' as const, letterSpacing: 1 },

  // Save button
  saveBtn:          { background: 'none', border: 'none', color: theme.accentColor, cursor: 'pointer', fontSize: 12, padding: '2px 0', whiteSpace: 'nowrap' as const },

  // AI Save button group
  aiSaveBtnGroup:   { display: 'flex', alignItems: 'center', gap: 0 },
  aiSaveBtn:        { background: 'none', border: 'none', color: '#cba6f7', cursor: 'pointer', fontSize: 12, padding: '2px 6px 2px 0', whiteSpace: 'nowrap' as const, fontWeight: 500 as const },
  clearSelBtn:      { background: 'none', border: 'none', color: theme.textMuted, cursor: 'pointer', fontSize: 11, padding: '2px 0' },

  // Normal save form
  saveForm:         { borderBottom: `1px solid ${theme.borderColor}`, padding: '8px 10px', display: 'flex', flexDirection: 'column' as const, gap: 6 },
  saveFormSql:      { fontSize: 10, color: theme.textMuted, fontFamily: "'JetBrains Mono', monospace", background: theme.bgPanel, borderRadius: 3, padding: '4px 6px', overflow: 'hidden', whiteSpace: 'nowrap' as const, textOverflow: 'ellipsis' },
  saveInput:        { background: theme.bgSecondary, border: `1px solid ${theme.borderColor}`, borderRadius: 4, padding: '5px 8px', color: theme.textPrimary, fontSize: 12, outline: 'none', width: '100%', boxSizing: 'border-box' as const },
  saveFormBtns:     { display: 'flex', gap: 6, justifyContent: 'flex-end' },
  saveCancelBtn:    { background: 'none', border: `1px solid ${theme.borderColor}`, borderRadius: 4, padding: '4px 10px', color: theme.textMuted, cursor: 'pointer', fontSize: 12 },
  saveConfirmBtn:   { background: theme.accentColor, border: 'none', borderRadius: 4, padding: '4px 10px', color: '#fff', cursor: 'pointer', fontSize: 12 },

  // AI Save panel
  aiSavePanel:      { borderBottom: `1px solid ${theme.borderColor}`, background: theme.bgPanel, padding: '10px', display: 'flex', flexDirection: 'column' as const, gap: 8 },
  aiSavePanelTitle: { fontSize: 12, fontWeight: 600 as const, color: '#cba6f7', display: 'flex', flexDirection: 'column' as const, gap: 2 },
  aiSavePanelHint:  { fontSize: 10, color: theme.textMuted, fontWeight: 400 as const },
  aiSaveList:       { display: 'flex', flexDirection: 'column' as const, gap: 6, maxHeight: 180, overflowY: 'auto' as const },
  aiSaveRow:        { background: theme.bgSecondary, borderRadius: 4, padding: '6px 8px', display: 'flex', flexDirection: 'column' as const, gap: 4 },
  aiSaveRowHeader:  { display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden' },
  aiSaveRowSql:     { flex: 1, fontSize: 10, color: theme.textPrimary, fontFamily: "'JetBrains Mono', monospace", overflow: 'hidden', whiteSpace: 'nowrap' as const, textOverflow: 'ellipsis' },
  aiSaveDupTag:     { fontSize: 9, color: theme.textMuted, background: theme.bgSecondary, borderRadius: 3, padding: '1px 5px', whiteSpace: 'nowrap' as const, flexShrink: 0 },
  aiSaveDupHint:    { fontSize: 11, color: theme.textMuted, fontWeight: 400 as const },
  aiSaveRowFields:  { display: 'flex', gap: 4 },
  aiSaveGrayInput:  { flex: 1, background: theme.bgPanel, border: `1px solid ${theme.borderColor}`, borderRadius: 3, padding: '3px 6px', color: theme.textMuted, fontSize: 10, opacity: 0.5, fontStyle: 'italic' as const },
  aiSavePanelFooter:{ display: 'flex', gap: 6, alignItems: 'center', justifyContent: 'flex-end' },
  aiSaveProgressTxt:{ flex: 1, fontSize: 11, color: '#cba6f7' },
  aiSaveConfirmBtn: { background: '#cba6f7', border: 'none', borderRadius: 4, padding: '4px 12px', color: '#1e1e2e', cursor: 'pointer', fontSize: 12, fontWeight: 600 as const },

  // Search
  searchRow:        { padding: '6px 10px', borderBottom: `1px solid ${theme.borderColor}`, display: 'flex', alignItems: 'center', gap: 4 },
  searchInput:      { flex: 1, background: theme.bgSecondary, border: `1px solid ${theme.borderColor}`, borderRadius: 4, padding: '5px 8px', color: theme.textPrimary, fontSize: 11, outline: 'none' },
  clearBtn:         { background: 'none', border: 'none', color: theme.textMuted, cursor: 'pointer', fontSize: 11, padding: '0 2px' },

  // Layout
  body:             { flex: 1, overflowY: 'auto' as const },
  sectionLabel:     { padding: '5px 10px', fontSize: 10, fontWeight: 600 as const, color: theme.textMuted, textTransform: 'uppercase' as const, letterSpacing: 0.5, background: theme.bgPanel, borderBottom: `1px solid ${theme.borderColor}` },
  empty:            { padding: 16, color: theme.textMuted, fontSize: 12, textAlign: 'center' as const },
}
