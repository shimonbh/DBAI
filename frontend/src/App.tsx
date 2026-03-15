import { useEffect } from 'react'
import { AppShell } from './components/layout/AppShell'
import { useConnectionStore } from './store/connectionStore'
import { useUIStore } from './store/uiStore'
import { DARK_COLORS, LIGHT_COLORS } from './theme'

/** Root component — loads connection profiles and applies dynamic theme CSS variables. */
export default function App() {
  const loadProfiles = useConnectionStore(s => s.loadProfiles)
  const isDark = useUIStore(s => s.isDark)

  useEffect(() => { loadProfiles() }, [])

  const c = isDark ? DARK_COLORS : LIGHT_COLORS
  const cssVars = {
    '--bg-primary':    c.bgPrimary,
    '--bg-secondary':  c.bgSecondary,
    '--bg-panel':      c.bgPanel,
    '--text-primary':  c.textPrimary,
    '--text-muted':    c.textMuted,
    '--border-color':  c.borderColor,
    '--accent-color':  c.accentColor,
  }

  return (
    <div style={{ ...cssVars as React.CSSProperties, height: '100vh', overflow: 'hidden' }}>
      <AppShell />
    </div>
  )
}
