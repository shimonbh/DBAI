import { create } from 'zustand'

export type LeftPanelTab = 'connections' | 'explorer' | 'queries'

const DARK_KEY        = 'dbai_dark_mode'
const loadDark        = () => localStorage.getItem(DARK_KEY) !== 'false'  // default true
const persistDark     = (v: boolean) => localStorage.setItem(DARK_KEY, String(v))

const HEADER_KEY      = 'dbai_ai_header'
const HEADER_USER_KEY = 'dbai_ai_header_user'
const loadHeaderEnabled = () => localStorage.getItem(HEADER_KEY) === 'true'
const loadHeaderUser    = () => localStorage.getItem(HEADER_USER_KEY) ?? ''

interface UIState {
  // Left panel tab
  leftPanel:       LeftPanelTab
  setLeftPanel:    (tab: LeftPanelTab) => void

  // Dark / light mode
  isDark:          boolean
  toggleDark:      () => void

  // Save panel (bottom of left panel)
  savePanelOpen:   boolean
  openSavePanel:   () => void
  closeSavePanel:  () => void

  // AI query header
  aiHeaderEnabled: boolean
  toggleAiHeader:  () => void
  aiHeaderUser:    string
  setAiHeaderUser: (name: string) => void

  // After saving a query, request the tree to scroll to it
  pendingScrollToId:  string | null
  setPendingScroll:   (id: string) => void
  clearPendingScroll: () => void
}

export const useUIStore = create<UIState>((set) => ({
  leftPanel:      'connections',
  setLeftPanel:   (tab) => set({ leftPanel: tab }),

  isDark:         loadDark(),
  toggleDark:     () => set((s) => {
    const next = !s.isDark
    persistDark(next)
    return { isDark: next }
  }),

  savePanelOpen:  false,
  openSavePanel:  () => set({ savePanelOpen: true }),
  closeSavePanel: () => set({ savePanelOpen: false }),

  aiHeaderEnabled: loadHeaderEnabled(),
  toggleAiHeader:  () => set((s) => {
    const next = !s.aiHeaderEnabled
    localStorage.setItem(HEADER_KEY, String(next))
    return { aiHeaderEnabled: next }
  }),
  aiHeaderUser:    loadHeaderUser(),
  setAiHeaderUser: (name) => {
    localStorage.setItem(HEADER_USER_KEY, name)
    set({ aiHeaderUser: name })
  },

  pendingScrollToId:  null,
  setPendingScroll:   (id) => set({ pendingScrollToId: id }),
  clearPendingScroll: ()   => set({ pendingScrollToId: null }),
}))
