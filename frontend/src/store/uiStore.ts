import { create } from 'zustand'

export type LeftPanelTab = 'connections' | 'explorer' | 'queries'

interface UIState {
  leftPanel: LeftPanelTab
  setLeftPanel: (tab: LeftPanelTab) => void
}

export const useUIStore = create<UIState>((set) => ({
  leftPanel: 'connections',
  setLeftPanel: (tab) => set({ leftPanel: tab }),
}))
