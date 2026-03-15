import { useState, useEffect, useRef } from 'react'
import { useEditorStore } from '@/store/editorStore'
import { useConnectionStore } from '@/store/connectionStore'
import { aiService } from '@/services/aiService'
import { queryService } from '@/services/queryService'
import { theme } from '@/theme'
import type { QueryResult } from '@/types/query'

type BottomTab = 'results' | 'messages' | 'ask-ai' | 'ai-analyze'

interface ChatMessage {
  role: 'user' | 'assistant'
  text: string
  sql?: string
}

const TABS: { id: BottomTab; label: string }[] = [
  { id: 'results',    label: 'Results'    },
  { id: 'messages',   label: 'Messages'   },
  { id: 'ask-ai',     label: '🤖 Ask AI'  },
  { id: 'ai-analyze', label: '🔍 Analyze' },
]

/**
 * Bottom panel with 4 tabs:
 *  Results    — query data grid
 *  Messages   — execution status / errors
 *  Ask AI     — chat: describe → AI writes SQL
 *  AI Analyze — analysis of the active query
 */
export function ResultsPane({ tabId }: { tabId: string }) {
  const [activeTab, setActiveTab] = useState<BottomTab>('results')
  const [chat, setChat]           = useState<ChatMessage[]>([])
  const [chatInput, setChatInput] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)
  const prevResultRef = useRef<unknown>(null)

  // Compare / test-run state for AI Analyze
  const [compareResult, setCompareResult] = useState<QueryResult | null>(null)
  const [isComparing, setIsComparing]     = useState(false)

  const {
    tabs, activeTabId,
    analysisResult, isAnalyzing, setAnalysis, analyzeQuery, updateTabSql, clearResult,
  } = useEditorStore()
  const { activeConnectionId } = useConnectionStore(s => ({
    activeConnectionId: s.activeConnectionId,
  }))

  const tab    = tabs.find(t => t.id === tabId)
  const result = tab?.result

  // Auto-switch to Results/Messages when a query finishes
  useEffect(() => {
    if (result && result !== prevResultRef.current) {
      prevResultRef.current = result
      setActiveTab(result.error ? 'messages' : 'results')
    }
  }, [result])

  // Auto-switch to AI Analyze when analysis starts or completes
  useEffect(() => {
    if (isAnalyzing || analysisResult) setActiveTab('ai-analyze')
    setCompareResult(null)  // reset compare whenever analysis refreshes
  }, [isAnalyzing, analysisResult])

  // Scroll chat to bottom on new message
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chat, aiLoading])

  // ── Ask AI ────────────────────────────────────────────────────────────────
  const handleAsk = async () => {
    const q = chatInput.trim()
    if (!q || !activeConnectionId || aiLoading) return

    // Build multi-turn history from prior messages so the AI can refine answers.
    // User turns use the typed description; assistant turns use the generated SQL
    // (or error text if no SQL was returned).
    const isFollowUp = chat.length > 0
    const history = isFollowUp
      ? chat.map(msg => ({
          role: msg.role,
          content: msg.sql ?? msg.text,
        }))
      : undefined

    setChatInput('')
    setChat(prev => [...prev, { role: 'user', text: q }])
    setAiLoading(true)
    try {
      const activeTab2 = useEditorStore.getState().tabs.find(
        t => t.id === useEditorStore.getState().activeTabId
      )
      const sql = await aiService.textToSQL(activeConnectionId, q, {
        database: activeTab2?.selectedDatabase ?? undefined,
        history,
      })

      const replyText = isFollowUp ? 'Here\'s the updated query:' : 'Here\'s a query for that:'
      setChat(prev => [...prev, { role: 'assistant', text: replyText, sql }])
    } catch (e: unknown) {
      setChat(prev => [...prev, { role: 'assistant', text: `Error: ${(e as Error).message}` }])
    } finally {
      setAiLoading(false)
    }
  }

  const openInEditor = (sql: string) => {
    useEditorStore.getState().openTab(sql)
  }

  const runSQL = async (sql: string) => {
    if (!activeConnectionId) return
    useEditorStore.getState().openTab(sql)
    setTimeout(() => useEditorStore.getState().executeQuery(activeConnectionId), 50)
  }

  const applyImproved = (sql: string) => {
    updateTabSql(activeTabId, sql)
    setAnalysis(null)
  }

  // Run the improved SQL with a small limit to quickly verify correctness
  const handleTestRun = async (improvedSql: string) => {
    if (!activeConnectionId || isComparing) return
    setIsComparing(true)
    setCompareResult(null)
    try {
      const tab2   = useEditorStore.getState().tabs.find(t => t.id === tabId)
      const result = await queryService.execute(
        activeConnectionId,
        improvedSql,
        tab2?.selectedDatabase ?? undefined,
        50,   // limit to 50 rows so long queries don't block
      )
      setCompareResult(result)
    } catch (e: unknown) {
      setCompareResult({
        query_id: '', columns: [], rows: [], row_count: 0, duration_ms: 0,
        error: (e as Error).message,
      })
    } finally {
      setIsComparing(false)
    }
  }

  const hasError = !!result?.error

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={S.container}>

      {/* Tab bar */}
      <div style={S.tabBar}>
        {TABS.map(t => (
          <button
            key={t.id}
            style={activeTab === t.id ? S.tabActive : S.tab}
            onClick={() => setActiveTab(t.id)}
          >
            {t.label}
            {t.id === 'results' && result && !hasError && (
              <span style={S.badge}>{result.row_count.toLocaleString()}</span>
            )}
            {t.id === 'messages' && hasError && (
              <span style={{ ...S.badge, background: '#f38ba8', color: '#1e1e2e' }}>!</span>
            )}
            {t.id === 'ai-analyze' && (isAnalyzing || analysisResult) && (
              <span style={{ ...S.badge, background: 'var(--accent-color)', color: '#fff' }}>
                {isAnalyzing ? '…' : '✓'}
              </span>
            )}
          </button>
        ))}

        {/* Right side: status + context-aware clear button */}
        <div style={S.tabBarRight}>
          {result && (activeTab === 'results' || activeTab === 'messages') && (
            <span style={{ fontSize: 11 }}>
              {hasError
                ? <span style={{ color: '#f38ba8' }}>✗ error</span>
                : <span style={{ color: '#a6e3a1' }}>{result.row_count.toLocaleString()} rows · {result.duration_ms}ms</span>
              }
            </span>
          )}
          {/* Clear button — what it clears depends on the active tab */}
          {((activeTab === 'results' || activeTab === 'messages') && result) ||
           (activeTab === 'ask-ai' && chat.length > 0) ||
           (activeTab === 'ai-analyze' && analysisResult) ? (
            <button
              style={S.clearPaneBtn}
              title="Clear"
              onClick={() => {
                if (activeTab === 'results' || activeTab === 'messages') clearResult(tabId)
                else if (activeTab === 'ask-ai') setChat([])
                else if (activeTab === 'ai-analyze') setAnalysis(null)
              }}
            >
              ✕ Clear
            </button>
          ) : null}
        </div>
      </div>

      {/* Content area */}
      <div style={S.content}>

        {/* ── Results ─────────────────────────────────────────────────────── */}
        {activeTab === 'results' && (
          !result ? (
            <div style={S.empty}>Run a query to see results here. (Ctrl+Enter)</div>
          ) : hasError ? (
            <div style={S.errorBox}>
              <span style={S.errorIcon}>⚠</span>
              <pre style={S.errorText}>{result.error}</pre>
            </div>
          ) : (
            <div style={S.tableWrap}>
              <table style={S.table}>
                <thead>
                  <tr>
                    {result.columns.map(col => <th key={col} style={S.th}>{col}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((row, ri) => (
                    <tr key={ri} style={ri % 2 === 0 ? S.rowEven : S.rowOdd}>
                      {row.map((cell, ci) => (
                        <td key={ci} style={S.td}>
                          {cell === null
                            ? <span style={S.null}>NULL</span>
                            : String(cell)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}

        {/* ── Messages ─────────────────────────────────────────────────────── */}
        {activeTab === 'messages' && (
          <div style={{ padding: 14 }}>
            {!result ? (
              <div style={S.empty}>No messages yet.</div>
            ) : hasError ? (
              <div style={S.errorBox}>
                <span style={S.errorIcon}>⚠</span>
                <pre style={S.errorText}>{result.error}</pre>
              </div>
            ) : (
              <div style={{ color: '#a6e3a1', fontSize: 12 }}>
                ✓ Query completed — {result.row_count.toLocaleString()} rows in {result.duration_ms}ms
              </div>
            )}
          </div>
        )}

        {/* ── Ask AI ───────────────────────────────────────────────────────── */}
        {activeTab === 'ask-ai' && (
          <div style={S.chatWrap}>
            <div style={S.chatMessages}>
              {chat.length === 0 && (
                <div style={S.empty}>
                  Describe what you want to query and AI will write the SQL for you.
                </div>
              )}
              {chat.map((msg, i) => (
                <div key={i} style={msg.role === 'user' ? S.msgUser : S.msgAI}>
                  <div style={msg.role === 'user' ? S.bubbleUser : S.bubbleAI}>
                    <div style={S.msgText}>{msg.text}</div>
                    {msg.sql && (
                      <>
                        <pre style={S.sqlBlock}>{msg.sql}</pre>
                        <div style={S.sqlBtns}>
                          <button style={S.openBtn}  onClick={() => openInEditor(msg.sql!)}>Open in editor</button>
                          <button style={S.runBtn}   onClick={() => runSQL(msg.sql!)}>▶ Run</button>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              ))}
              {aiLoading && (
                <div style={S.msgAI}>
                  <div style={{ ...S.bubbleAI, color: theme.textMuted, fontStyle: 'italic', fontSize: 11 }}>
                    Generating SQL…
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            <div style={S.chatInputRow}>
              <input
                style={S.chatInput}
                placeholder="Describe what you want to query…"
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) handleAsk() }}
                disabled={aiLoading || !activeConnectionId}
              />
              <button
                style={{ ...S.sendBtn, opacity: chatInput.trim() && activeConnectionId ? 1 : 0.4 }}
                onClick={handleAsk}
                disabled={aiLoading || !chatInput.trim() || !activeConnectionId}
              >
                → SQL
              </button>
            </div>
          </div>
        )}

        {/* ── AI Analyze ───────────────────────────────────────────────────── */}
        {activeTab === 'ai-analyze' && (
          !isAnalyzing && !analysisResult ? (
            <div style={S.analyzePrompt}>
              <span style={{ fontSize: 12, color: theme.textMuted }}>
                Analyze the active query for issues and improvement suggestions.
              </span>
              <button
                style={S.analyzeBtn}
                onClick={() => activeConnectionId && analyzeQuery(activeConnectionId)}
                disabled={!activeConnectionId}
              >
                🔍 Analyze Query
              </button>
            </div>
          ) : isAnalyzing ? (
            <div style={S.empty}>Analyzing query…</div>
          ) : analysisResult ? (
            <div style={S.analysisWrap}>
              <div style={S.analysisHeader}>
                <span style={S.analysisTitle}>AI Analysis</span>
                <button style={S.closeBtn} onClick={() => setAnalysis(null)}>✕</button>
              </div>

              {analysisResult.summary && (
                <div style={S.sec}>
                  <div style={S.secTitle}>Summary</div>
                  <div style={S.secText}>{analysisResult.summary}</div>
                </div>
              )}
              {analysisResult.issues.length > 0 && (
                <div style={S.sec}>
                  <div style={S.secTitle}>Issues</div>
                  {analysisResult.issues.map((issue, i) => (
                    <div key={i} style={{ fontSize: 12, color: '#f38ba8', padding: '1px 0' }}>⚠ {issue}</div>
                  ))}
                </div>
              )}
              {analysisResult.suggestions.length > 0 && (
                <div style={S.sec}>
                  <div style={S.secTitle}>Suggestions</div>
                  {analysisResult.suggestions.map((s, i) => (
                    <div key={i} style={{ fontSize: 12, color: '#a6e3a1', padding: '1px 0' }}>💡 {s}</div>
                  ))}
                </div>
              )}
              {analysisResult.improved_sql && (
                <div style={S.sec}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                    <div style={S.secTitle}>Improved SQL</div>
                    <div style={{ display: 'flex', gap: 5 }}>
                      <button
                        style={{ ...S.testBtn, opacity: isComparing ? 0.6 : 1 }}
                        disabled={isComparing || !activeConnectionId}
                        onClick={() => handleTestRun(analysisResult.improved_sql!)}
                        title="Run the improved query with LIMIT 50 to verify it works"
                      >
                        {isComparing ? '⏳ Testing…' : '▶ Test Run'}
                      </button>
                      <button style={S.applyBtn} onClick={() => applyImproved(analysisResult.improved_sql!)}>Apply</button>
                    </div>
                  </div>
                  <pre style={S.analysisCode}>{analysisResult.improved_sql}</pre>

                  {/* ── Compare Results ──────────────────────────────── */}
                  {compareResult && (
                    <div style={S.compareBox}>
                      <div style={S.compareTitle}>Compare Results (LIMIT 50)</div>
                      <div style={S.compareRow}>
                        {/* Original */}
                        <div style={S.compareCol}>
                          <div style={S.compareLabel}>Original</div>
                          {result && !result.error ? (
                            <span style={{ color: '#a6e3a1', fontSize: 11 }}>
                              ✓ {result.row_count.toLocaleString()} rows · {result.duration_ms}ms
                            </span>
                          ) : result?.error ? (
                            <span style={{ color: '#f38ba8', fontSize: 11 }}>✗ error</span>
                          ) : (
                            <span style={{ color: theme.textMuted, fontSize: 11 }}>not run yet</span>
                          )}
                        </div>
                        {/* Improved */}
                        <div style={S.compareCol}>
                          <div style={S.compareLabel}>Improved</div>
                          {compareResult.error ? (
                            <span style={{ color: '#f38ba8', fontSize: 11 }}>✗ {compareResult.error}</span>
                          ) : (
                            <span style={{ color: '#a6e3a1', fontSize: 11 }}>
                              ✓ {compareResult.row_count.toLocaleString()} rows (capped at 50) · {compareResult.duration_ms}ms
                            </span>
                          )}
                        </div>
                      </div>
                      {/* Column match */}
                      {result && !result.error && !compareResult.error && (() => {
                        const origCols = result.columns.join(',')
                        const newCols  = compareResult.columns.join(',')
                        const match    = origCols === newCols
                        return (
                          <div style={{ fontSize: 11, marginTop: 4, color: match ? '#a6e3a1' : '#f9e2af' }}>
                            {match
                              ? `✓ Same ${result.columns.length} columns`
                              : `⚠ Column mismatch — original: [${result.columns.join(', ')}] → improved: [${compareResult.columns.join(', ')}]`}
                          </div>
                        )
                      })()}
                      {/* First rows of improved */}
                      {!compareResult.error && compareResult.rows.length > 0 && (
                        <div style={{ marginTop: 8, overflowX: 'auto' as const }}>
                          <table style={{ ...S.table, fontSize: 10 }}>
                            <thead>
                              <tr>{compareResult.columns.map(c => <th key={c} style={S.th}>{c}</th>)}</tr>
                            </thead>
                            <tbody>
                              {compareResult.rows.slice(0, 5).map((row, ri) => (
                                <tr key={ri}>
                                  {row.map((cell, ci) => (
                                    <td key={ci} style={S.td}>
                                      {cell === null ? <span style={S.null}>NULL</span> : String(cell)}
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          {compareResult.rows.length > 5 && (
                            <div style={{ fontSize: 10, color: theme.textMuted, padding: '3px 6px' }}>
                              … and {compareResult.row_count - 5} more rows (showing 5/{compareResult.row_count} returned)
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : null
        )}

      </div>
    </div>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────
const S = {
  container:     { display: 'flex' as const, flexDirection: 'column' as const, height: '100%', overflow: 'hidden' },

  // Tab bar
  tabBar:        { display: 'flex', alignItems: 'center', background: 'rgba(0,0,0,0.2)', borderBottom: '1px solid var(--border-color)', flexShrink: 0, minHeight: 32, borderRadius: '12px 12px 0 0' },
  tab:           { background: 'none', border: 'none', padding: '6px 14px', fontSize: 11, color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap' as const, borderBottom: '2px solid transparent' },
  tabActive:     { background: 'none', border: 'none', padding: '6px 14px', fontSize: 11, color: 'var(--accent-color)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap' as const, borderBottom: '2px solid var(--accent-color)', fontWeight: 600 as const },
  badge:         { fontSize: 9, padding: '1px 5px', borderRadius: 8, background: 'var(--bg-panel)', color: 'var(--text-muted)', fontWeight: 600 as const },
  statusRight:   { marginLeft: 'auto', fontSize: 11, paddingRight: 12 },  // kept for safety
  tabBarRight:   { marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8, paddingRight: 8, flexShrink: 0 },
  clearPaneBtn:  { background: 'none', border: '1px solid var(--border-color)', borderRadius: 4, padding: '2px 8px', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 10, lineHeight: 1.6, whiteSpace: 'nowrap' as const },

  // Content
  content:       { flex: 1, overflow: 'hidden', display: 'flex' as const, flexDirection: 'column' as const },

  // Results grid
  tableWrap:     { flex: 1, overflow: 'auto' },
  table:         { width: '100%', borderCollapse: 'collapse' as const, fontSize: 12 },
  th:            { padding: '6px 10px', background: 'var(--bg-panel)', color: 'var(--text-muted)', fontWeight: 600, fontSize: 11, textAlign: 'left' as const, borderBottom: '1px solid var(--border-color)', whiteSpace: 'nowrap' as const, position: 'sticky' as const, top: 0 },
  rowEven:       { background: 'transparent' },
  rowOdd:        { background: 'rgba(255,255,255,0.02)' },
  td:            { padding: '4px 10px', borderBottom: '1px solid rgba(255,255,255,0.04)', color: 'var(--text-primary)', whiteSpace: 'nowrap' as const, maxWidth: 400, overflow: 'hidden', textOverflow: 'ellipsis' },
  null:          { color: 'var(--text-muted)', fontStyle: 'italic' as const },

  // Empty / Error states
  empty:         { padding: 20, color: 'var(--text-muted)', fontSize: 12, textAlign: 'center' as const, display: 'flex' as const, flexDirection: 'column' as const, alignItems: 'center', justifyContent: 'center', gap: 10, height: '100%' },
  errorBox:      { padding: 16, display: 'flex' as const, gap: 8, alignItems: 'flex-start' },
  errorIcon:     { color: '#f38ba8', fontSize: 16, flexShrink: 0 },
  errorText:     { color: '#f38ba8', fontSize: 12, margin: 0, whiteSpace: 'pre-wrap' as const },

  // Ask AI chat
  chatWrap:      { display: 'flex' as const, flexDirection: 'column' as const, height: '100%', minHeight: 0 },
  chatMessages:  { flex: 1, overflowY: 'auto' as const, padding: '10px 12px', display: 'flex', flexDirection: 'column' as const, gap: 8 },
  msgUser:       { display: 'flex', justifyContent: 'flex-end' },
  msgAI:         { display: 'flex', justifyContent: 'flex-start' },
  bubbleUser:    { maxWidth: '75%', background: 'var(--accent-color)', color: '#fff', borderRadius: '10px 10px 2px 10px', padding: '8px 12px' },
  bubbleAI:      { maxWidth: '85%', background: 'var(--bg-panel)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', borderRadius: '10px 10px 10px 2px', padding: '8px 12px' },
  msgText:       { fontSize: 12, lineHeight: 1.4 },
  sqlBlock:      { background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 5, padding: '8px 10px', fontSize: 11, color: 'var(--text-primary)', overflow: 'auto', whiteSpace: 'pre-wrap' as const, margin: '6px 0 4px', fontFamily: "'JetBrains Mono', monospace" },
  sqlBtns:       { display: 'flex', gap: 6, marginTop: 4 },
  openBtn:       { background: 'none', border: '1px solid var(--border-color)', borderRadius: 4, padding: '3px 9px', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 11 },
  runBtn:        { background: 'var(--accent-color)', border: 'none', borderRadius: 4, padding: '3px 9px', color: '#fff', cursor: 'pointer', fontSize: 11, fontWeight: 600 as const },
  chatInputRow:  { display: 'flex', gap: 6, padding: '8px 10px', borderTop: '1px solid var(--border-color)', flexShrink: 0 },
  chatInput:     { flex: 1, background: 'var(--bg-panel)', border: '1px solid var(--border-color)', borderRadius: 5, padding: '7px 10px', color: 'var(--text-primary)', fontSize: 12, outline: 'none' },
  sendBtn:       { background: 'var(--accent-color)', border: 'none', borderRadius: 5, padding: '7px 14px', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600 as const, whiteSpace: 'nowrap' as const },

  // AI Analyze
  analyzePrompt: { display: 'flex' as const, flexDirection: 'column' as const, alignItems: 'center', justifyContent: 'center', gap: 12, height: '100%', padding: 20 },
  analyzeBtn:    { background: 'var(--accent-color)', border: 'none', borderRadius: 5, padding: '7px 16px', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600 as const },
  analysisWrap:  { overflowY: 'auto' as const, padding: '0 0 12px' },
  analysisHeader:{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px 4px', position: 'sticky' as const, top: 0, background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-color)' },
  analysisTitle: { fontSize: 12, fontWeight: 600, color: 'var(--accent-color)' },
  closeBtn:      { background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 13 },
  sec:           { padding: '8px 12px' },
  secTitle:      { fontSize: 10, color: 'var(--text-muted)', fontWeight: 600 as const, textTransform: 'uppercase' as const, letterSpacing: 0.5, marginBottom: 4 },
  secText:       { fontSize: 12, color: 'var(--text-primary)', lineHeight: 1.5 },
  analysisCode:  { background: 'var(--bg-primary)', border: '1px solid var(--border-color)', borderRadius: 4, padding: 8, fontSize: 11, color: 'var(--text-primary)', overflow: 'auto', whiteSpace: 'pre-wrap' as const, margin: 0, fontFamily: "'JetBrains Mono', monospace" },
  applyBtn:      { background: 'var(--accent-color)', color: '#fff', border: 'none', borderRadius: 3, padding: '2px 10px', cursor: 'pointer', fontSize: 11 },
  testBtn:       { background: 'none', border: '1px solid var(--border-color)', borderRadius: 3, padding: '2px 10px', cursor: 'pointer', fontSize: 11, color: 'var(--text-primary)', whiteSpace: 'nowrap' as const },

  // Compare box
  compareBox:    { marginTop: 8, background: 'var(--bg-primary)', border: '1px solid var(--border-color)', borderRadius: 6, padding: '8px 10px' },
  compareTitle:  { fontSize: 10, fontWeight: 600 as const, color: 'var(--text-muted)', textTransform: 'uppercase' as const, letterSpacing: 0.5, marginBottom: 6 },
  compareRow:    { display: 'flex' as const, gap: 16 },
  compareCol:    { flex: 1, display: 'flex' as const, flexDirection: 'column' as const, gap: 2 },
  compareLabel:  { fontSize: 10, color: 'var(--text-muted)', fontWeight: 600 as const, textTransform: 'uppercase' as const, letterSpacing: 0.3 },
}
