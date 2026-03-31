import { useState, useCallback, useRef, useEffect } from 'react'
import { LeftPanel } from './LeftPanel'
import { Resizer } from './Resizer'
import { SettingsModal } from './SettingsModal'
import { AiHeaderModal } from './AiHeaderModal'
import { AboutModal } from './AboutModal'
import { EditorPanel } from '@/components/editor/EditorPanel'
import { MonitorPanel } from '@/components/monitor/MonitorPanel'
import { ConnectionBadge } from '@/components/connection/ConnectionBadge'
import { useMonitorStore } from '@/store/monitorStore'
import { theme } from '@/theme'

function GearMenuItem({ label, onClick }: { label: string; onClick: () => void }) {
  const [hov, setHov] = useState(false)
  return (
    <div
      style={{ padding: '8px 16px', fontSize: 13, cursor: 'pointer', userSelect: 'none' as const,
        color: 'var(--text-primary)',
        background: hov ? 'var(--bg-primary)' : 'transparent',
        transition: 'background 0.1s' }}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      onClick={onClick}
    >{label}</div>
  )
}

export function AppShell() {
  const [leftWidth, setLeftWidth] = useState(theme.leftPanelWidth)
  const [menuOpen,      setMenuOpen]      = useState(false)
  const [settingsOpen,  setSettingsOpen]  = useState(false)
  const [aiHeaderOpen,  setAiHeaderOpen]  = useState(false)
  const [aboutOpen,     setAboutOpen]     = useState(false)
  const { isOpen: monitorOpen, toggleMonitor } = useMonitorStore()
  const gearBtnRef = useRef<HTMLButtonElement>(null)

  const handleResize = useCallback((delta: number) => {
    setLeftWidth(w => Math.max(160, Math.min(520, w + delta)))
  }, [])

  // Close gear menu when clicking outside
  useEffect(() => {
    if (!menuOpen) return
    const handler = (e: MouseEvent) => {
      if (!(e.target as Element)?.closest?.('[data-gear-menu]')) setMenuOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [menuOpen])

  const gearRect = gearBtnRef.current?.getBoundingClientRect()

  return (
    <div style={styles.root}>
      {/* Top bar */}
      <div style={styles.topBar}>
        <span style={styles.appName}>D.B.A.I</span>
        <ConnectionBadge />
        <div style={styles.topBarRight}>
          <button
            style={{ ...styles.iconBtn, color: monitorOpen ? 'var(--accent-color)' : 'var(--text-muted)' }}
            onClick={toggleMonitor} title="Toggle DB Monitor"
          >📊 Monitor</button>
          <button
            ref={gearBtnRef}
            data-gear-menu
            style={{ ...styles.iconBtn, color: menuOpen ? 'var(--accent-color)' : 'var(--text-muted)' }}
            onClick={() => setMenuOpen(v => !v)}
            title="Menu"
          >⚙️</button>
        </div>
      </div>

      {/* Gear dropdown */}
      {menuOpen && gearRect && (
        <div data-gear-menu style={{
          position: 'fixed',
          top: gearRect.bottom + 4,
          right: window.innerWidth - gearRect.right,
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border-color)',
          borderRadius: 10,
          boxShadow: '0 8px 28px rgba(0,0,0,0.45)',
          zIndex: 3000,
          minWidth: 200,
          overflow: 'hidden',
          padding: '4px 0',
        }}>
          <GearMenuItem label="⚙️  Settings" onClick={() => { setSettingsOpen(true); setMenuOpen(false) }} />
          <GearMenuItem label="🤖  AI Query Header" onClick={() => { setAiHeaderOpen(true); setMenuOpen(false) }} />
          <div style={{ height: 1, background: 'var(--border-color)', margin: '3px 0' }} />
          <GearMenuItem label="ℹ️  About" onClick={() => { setAboutOpen(true); setMenuOpen(false) }} />
        </div>
      )}

      {/* Main content */}
      <div style={styles.main}>
        <div style={{ width: leftWidth, minWidth: 160, overflow: 'hidden', flexShrink: 0 }}>
          <LeftPanel />
        </div>
        <Resizer onResize={handleResize} />
        <div style={styles.rightArea}>
          {monitorOpen ? (
            <>
              <div style={{ height: '40%', minHeight: 150, borderBottom: `1px solid var(--border-color)` }}>
                <MonitorPanel />
              </div>
              <div style={{ flex: 1, overflow: 'hidden' }}>
                <EditorPanel />
              </div>
            </>
          ) : (
            <EditorPanel />
          )}
        </div>
      </div>

      {settingsOpen  && <SettingsModal  onClose={() => setSettingsOpen(false)}  />}
      {aiHeaderOpen  && <AiHeaderModal  onClose={() => setAiHeaderOpen(false)}  />}
      {aboutOpen     && <AboutModal     onClose={() => setAboutOpen(false)}     />}
    </div>
  )
}

const styles = {
  root:        { display: 'flex' as const, flexDirection: 'column' as const, height: '100vh', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontFamily: "'Segoe UI', system-ui, sans-serif" },
  topBar:      { display: 'flex', alignItems: 'center', gap: 14, padding: '0 16px', height: 38, background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-color)', flexShrink: 0 },
  appName:     { fontWeight: 700, fontSize: 14, color: 'var(--accent-color)', letterSpacing: 1 },
  topBarRight: { marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' },
  iconBtn:     { background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, padding: '3px 8px', borderRadius: 4, color: 'var(--text-muted)' },
  main:        { flex: 1, display: 'flex' as const, overflow: 'hidden', minHeight: 0, background: 'var(--bg-secondary)' },
  rightArea:   { flex: 1, display: 'flex' as const, flexDirection: 'column' as const, overflow: 'hidden', minWidth: 0 },
}
