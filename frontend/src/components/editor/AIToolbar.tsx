import { useState, useEffect } from 'react'
import { useEditorStore } from '@/store/editorStore'
import { useConnectionStore } from '@/store/connectionStore'
import { theme } from '@/theme'

const HISTORY_KEY = 'dbai_ask_ai_history'
const MAX_HISTORY  = 30
const MODE_KEY     = 'dbai_ai_mode'

type AIMode = 'ask' | 'plan' | 'write' | 'analyze'

const MODES: { id: AIMode; label: string; placeholder: string; btnLabel: string; title: string }[] = [
  { id: 'ask',     label: 'Ask',     placeholder: 'Ask a question about your data or schema…',    btnLabel: '→ Ask',     title: 'Conversational — answers questions, explains concepts, may include SQL' },
  { id: 'plan',    label: 'Plan',    placeholder: 'Describe what you need — AI will plan then write SQL…', btnLabel: '→ Plan',    title: 'Think-first — outlines the approach, then produces SQL' },
  { id: 'write',   label: 'Write',   placeholder: 'Describe what you want to query…',              btnLabel: '→ SQL',     title: 'Direct SQL generation from your description (default)' },
  { id: 'analyze', label: 'Analyze', placeholder: 'Analyzes the current SQL in the editor…',      btnLabel: '→ Analyze', title: 'Analyzes the SQL in the editor for issues and improvements' },
]

function loadHistory(): string[] {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]') } catch { return [] }
}

function saveHistory(history: string[]) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history))
}

/**
 * Toolbar row above the editor:
 * - Text-to-SQL combo input (with persisted request history dropdown)
 * - Limit input (max rows returned)
 * - Run / Stop toggle button (F5 / Ctrl+Enter)
 */
export function AIToolbar() {
  const [textInput, setTextInput] = useState('')
  const [history,   setHistory]   = useState<string[]>(loadHistory)
  const [showDrop,  setShowDrop]  = useState(false)
  const [filterVal, setFilterVal] = useState('')
  const [mode,      setMode]      = useState<AIMode>(
    () => (localStorage.getItem(MODE_KEY) as AIMode | null) ?? 'write'
  )

  const { activeConnectionId } = useConnectionStore()
  const {
    isGenerating, isExecuting,
    queryLimit, setQueryLimit,
    generateTextToSQL, analyzeQuery, executeQuery, cancelQuery,
  } = useEditorStore()

  const currentMode = MODES.find(m => m.id === mode) ?? MODES[2]

  const changeMode = (m: AIMode) => {
    setMode(m)
    localStorage.setItem(MODE_KEY, m)
  }

  // Close dropdown on outside click
  useEffect(() => {
    const close = () => setShowDrop(false)
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  const addToHistory = (text: string) => {
    const trimmed = text.trim()
    if (!trimmed) return
    setHistory(prev => {
      const deduped = [trimmed, ...prev.filter(h => h !== trimmed)].slice(0, MAX_HISTORY)
      saveHistory(deduped)
      return deduped
    })
  }

  const handleTextToSQL = async () => {
    if (!activeConnectionId) return
    if (mode === 'analyze') {
      await analyzeQuery(activeConnectionId)
      return
    }
    if (!textInput.trim()) return
    addToHistory(textInput)
    await generateTextToSQL(activeConnectionId, textInput, mode === 'write' ? undefined : mode)
    setTextInput('')
    setShowDrop(false)
  }

  const handleRunStop = () => {
    if (!activeConnectionId) return
    if (isExecuting) {
      cancelQuery()
    } else {
      executeQuery(activeConnectionId)
    }
  }

  const selectHistoryItem = (item: string) => {
    setTextInput(item)
    setFilterVal('')
    setShowDrop(false)
  }

  const clearHistory = (e: React.MouseEvent) => {
    e.stopPropagation()
    setHistory([])
    saveHistory([])
  }

  const filteredHistory = history.filter(h =>
    !filterVal || h.toLowerCase().includes(filterVal.toLowerCase())
  )

  return (
    <div style={styles.bar}>
      {/* Text-to-SQL combo */}
      <div style={styles.comboWrap} onMouseDown={e => e.stopPropagation()}>
        <span style={styles.label}>AI:</span>

        <div style={styles.inputRow}>
          <input
            style={{ ...styles.input, opacity: mode === 'analyze' ? 0.45 : 1 }}
            placeholder={currentMode.placeholder}
            value={textInput}
            onChange={e => {
              setTextInput(e.target.value)
              setFilterVal(e.target.value)
              setShowDrop(true)
            }}
            onFocus={() => setShowDrop(true)}
            onKeyDown={e => {
              if (e.key === 'Enter') { handleTextToSQL(); return }
              if (e.key === 'Escape') setShowDrop(false)
            }}
            disabled={isGenerating || mode === 'analyze'}
          />

          {history.length > 0 && mode !== 'analyze' && (
            <button
              style={styles.arrowBtn}
              onMouseDown={e => { e.preventDefault(); setShowDrop(v => !v); setFilterVal('') }}
              tabIndex={-1}
              title="Show history"
            >
              {showDrop ? '▲' : '▼'}
            </button>
          )}
        </div>

        {/* History dropdown */}
        {showDrop && filteredHistory.length > 0 && (
          <div style={styles.dropdown}>
            <div style={styles.dropHeader}>
              <span style={styles.dropLabel}>Recent requests</span>
              <button style={styles.clearBtn} onMouseDown={clearHistory}>Clear</button>
            </div>
            {filteredHistory.map((item, i) => (
              <div
                key={i}
                style={styles.dropItem}
                onMouseDown={() => selectHistoryItem(item)}
                onMouseEnter={e => (e.currentTarget.style.background = theme.bgPanel)}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                {item}
              </div>
            ))}
          </div>
        )}

        <button
          style={styles.btn}
          onClick={handleTextToSQL}
          disabled={
            isGenerating || !activeConnectionId ||
            (mode !== 'analyze' && !textInput.trim())
          }
        >
          {isGenerating ? '…' : currentMode.btnLabel}
        </button>
      </div>

      {/* Mode selector */}
      <div style={styles.modeGroup}>
        {MODES.map(m => (
          <button
            key={m.id}
            style={{
              ...styles.modeBtn,
              ...(mode === m.id ? styles.modeBtnActive : styles.modeBtnInactive),
            }}
            onClick={() => changeMode(m.id)}
            title={m.title}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* Right-side controls: limit + run/stop */}
      <div style={styles.actions}>
        <label style={styles.limitLabel}>
          <span style={styles.label}>Limit:</span>
          <input
            type="number"
            min={1}
            max={100000}
            step={100}
            style={styles.limitInput}
            value={queryLimit}
            onChange={e => {
              const v = parseInt(e.target.value, 10)
              if (!isNaN(v) && v > 0) setQueryLimit(v)
            }}
            title="Maximum rows returned"
          />
        </label>

        <button
          style={{
            ...styles.btn,
            background: isExecuting ? theme.stopColor : theme.accentColor,
            color: '#fff',
            minWidth: 72,
          }}
          onClick={handleRunStop}
          disabled={!activeConnectionId}
          title={isExecuting ? 'Stop query (terminates execution)' : 'Run query (F5 / Ctrl+Enter)'}
        >
          {isExecuting ? '■ Stop' : '▶ Run'}
        </button>
      </div>
    </div>
  )
}

const styles = {
  bar:            { display: 'flex', alignItems: 'center', gap: 10, padding: '6px 10px', background: theme.bgSecondary, borderBottom: `1px solid ${theme.borderColor}`, flexWrap: 'wrap' as const },
  comboWrap:      { position: 'relative' as const, display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 200 },
  label:          { fontSize: 11, color: theme.textMuted, whiteSpace: 'nowrap' as const },
  inputRow:       { flex: 1, display: 'flex', alignItems: 'center', position: 'relative' as const },
  input:          { flex: 1, background: theme.bgPrimary, border: `1px solid ${theme.borderColor}`, borderRadius: 4, padding: '4px 28px 4px 8px', color: theme.textPrimary, fontSize: 12, outline: 'none' },
  arrowBtn:       { position: 'absolute' as const, right: 4, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: theme.textMuted, cursor: 'pointer', fontSize: 10, padding: '0 2px', lineHeight: 1 },
  dropdown:       { position: 'absolute' as const, top: '100%', left: 0, right: 0, zIndex: 200, background: theme.bgSecondary, border: `1px solid ${theme.borderColor}`, borderRadius: 4, boxShadow: '0 4px 12px rgba(0,0,0,0.35)', maxHeight: 260, overflowY: 'auto' as const, marginTop: 2 },
  dropHeader:     { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 10px', borderBottom: `1px solid ${theme.borderColor}` },
  dropLabel:      { fontSize: 10, color: theme.textMuted, letterSpacing: 0.4 },
  clearBtn:       { background: 'none', border: 'none', color: theme.textMuted, cursor: 'pointer', fontSize: 10, padding: 0 },
  dropItem:       { padding: '6px 10px', fontSize: 12, color: theme.textPrimary, cursor: 'pointer', background: 'transparent', whiteSpace: 'nowrap' as const, overflow: 'hidden', textOverflow: 'ellipsis' },
  actions:        { display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 },
  limitLabel:     { display: 'flex', alignItems: 'center', gap: 4 },
  limitInput:     { width: 64, background: theme.bgPrimary, border: `1px solid ${theme.borderColor}`, borderRadius: 4, padding: '3px 6px', color: theme.textPrimary, fontSize: 12, outline: 'none', textAlign: 'right' as const },
  btn:            { background: theme.bgPanel, color: theme.textPrimary, border: `1px solid ${theme.borderColor}`, borderRadius: 4, padding: '4px 10px', cursor: 'pointer', fontSize: 12 },
  // Mode selector pill group
  modeGroup:      { display: 'flex', alignItems: 'center', gap: 2, background: 'rgba(0,0,0,0.25)', borderRadius: 6, padding: 2, border: `1px solid ${theme.borderColor}`, flexShrink: 0 },
  modeBtn:        { border: 'none', borderRadius: 4, padding: '3px 9px', cursor: 'pointer', fontSize: 11, fontWeight: 600 as const, transition: 'background 0.12s, color 0.12s' },
  modeBtnActive:  { background: theme.accentColor, color: '#fff' },
  modeBtnInactive:{ background: 'transparent', color: theme.textMuted },
}
