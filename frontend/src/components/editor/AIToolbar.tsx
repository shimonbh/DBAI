import { useState, useEffect } from 'react'
import { useEditorStore } from '@/store/editorStore'
import { useConnectionStore } from '@/store/connectionStore'
import { theme } from '@/theme'

const HISTORY_KEY = 'dbai_ask_ai_history'
const MAX_HISTORY  = 30

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

  const { activeConnectionId } = useConnectionStore()
  const {
    isGenerating, isExecuting,
    queryLimit, setQueryLimit,
    generateTextToSQL, executeQuery, cancelQuery,
  } = useEditorStore()

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
    if (!activeConnectionId || !textInput.trim()) return
    addToHistory(textInput)
    await generateTextToSQL(activeConnectionId, textInput)
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
        <span style={styles.label}>Ask AI:</span>

        <div style={styles.inputRow}>
          <input
            style={styles.input}
            placeholder="Describe what you want to query…"
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
            disabled={isGenerating}
          />

          {history.length > 0 && (
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
          disabled={isGenerating || !textInput.trim() || !activeConnectionId}
        >
          {isGenerating ? '…' : '→ SQL'}
        </button>
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
  bar:        { display: 'flex', alignItems: 'center', gap: 10, padding: '6px 10px', background: theme.bgSecondary, borderBottom: `1px solid ${theme.borderColor}`, flexWrap: 'wrap' as const },
  comboWrap:  { position: 'relative' as const, display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 200 },
  label:      { fontSize: 11, color: theme.textMuted, whiteSpace: 'nowrap' as const },
  inputRow:   { flex: 1, display: 'flex', alignItems: 'center', position: 'relative' as const },
  input:      { flex: 1, background: theme.bgPrimary, border: `1px solid ${theme.borderColor}`, borderRadius: 4, padding: '4px 28px 4px 8px', color: theme.textPrimary, fontSize: 12, outline: 'none' },
  arrowBtn:   { position: 'absolute' as const, right: 4, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: theme.textMuted, cursor: 'pointer', fontSize: 10, padding: '0 2px', lineHeight: 1 },
  dropdown:   { position: 'absolute' as const, top: '100%', left: 0, right: 0, zIndex: 200, background: theme.bgSecondary, border: `1px solid ${theme.borderColor}`, borderRadius: 4, boxShadow: '0 4px 12px rgba(0,0,0,0.35)', maxHeight: 260, overflowY: 'auto' as const, marginTop: 2 },
  dropHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 10px', borderBottom: `1px solid ${theme.borderColor}` },
  dropLabel:  { fontSize: 10, color: theme.textMuted, letterSpacing: 0.4 },
  clearBtn:   { background: 'none', border: 'none', color: theme.textMuted, cursor: 'pointer', fontSize: 10, padding: 0 },
  dropItem:   { padding: '6px 10px', fontSize: 12, color: theme.textPrimary, cursor: 'pointer', background: 'transparent', whiteSpace: 'nowrap' as const, overflow: 'hidden', textOverflow: 'ellipsis' },
  actions:    { display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 },
  limitLabel: { display: 'flex', alignItems: 'center', gap: 4 },
  limitInput: { width: 64, background: theme.bgPrimary, border: `1px solid ${theme.borderColor}`, borderRadius: 4, padding: '3px 6px', color: theme.textPrimary, fontSize: 12, outline: 'none', textAlign: 'right' as const },
  btn:        { background: theme.bgPanel, color: theme.textPrimary, border: `1px solid ${theme.borderColor}`, borderRadius: 4, padding: '4px 10px', cursor: 'pointer', fontSize: 12 },
}
