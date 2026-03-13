import { useEffect } from 'react'
import { AppShell } from './components/layout/AppShell'
import { useConnectionStore } from './store/connectionStore'
import { cssVars } from './theme'

/** Root component — loads connection profiles and applies theme CSS variables. */
export default function App() {
  const loadProfiles = useConnectionStore(s => s.loadProfiles)

  // Load saved connections on startup
  useEffect(() => { loadProfiles() }, [])

  return (
    <div style={{ ...cssVars as React.CSSProperties, height: '100vh', overflow: 'hidden' }}>
      <AppShell />
    </div>
  )
}
