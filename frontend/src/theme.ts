/**
 * Theme constants loaded from environment variables (set via .env / vite.config.ts).
 * All UI components import from here instead of hardcoding colors.
 */

declare const __COLOR_SCHEME__: string
declare const __ACCENT_COLOR__: string
declare const __EDITOR_THEME__: string
declare const __BG_PRIMARY__: string
declare const __BG_SECONDARY__: string
declare const __BG_PANEL__: string
declare const __TEXT_PRIMARY__: string
declare const __TEXT_MUTED__: string
declare const __BORDER_COLOR__: string
declare const __LEFT_PANEL_WIDTH__: string
declare const __EDITOR_HEIGHT_PERCENT__: string
declare const __EDITOR_FONT_SIZE__: string
declare const __AUTOCOMPLETE_DEBOUNCE_MS__: string
declare const __MONITOR_BUFFER_SIZE__: string
declare const __QUERY_LIMIT__: string

export const theme = {
  colorScheme:     __COLOR_SCHEME__     as 'dark' | 'light',
  accentColor:     __ACCENT_COLOR__,
  editorTheme:     __EDITOR_THEME__,
  bgPrimary:       __BG_PRIMARY__,
  bgSecondary:     __BG_SECONDARY__,
  bgPanel:         __BG_PANEL__,
  textPrimary:     __TEXT_PRIMARY__,
  textMuted:       __TEXT_MUTED__,
  borderColor:     __BORDER_COLOR__,
  leftPanelWidth:  Number(__LEFT_PANEL_WIDTH__),
  editorHeightPct: Number(__EDITOR_HEIGHT_PERCENT__),
  editorFontSize:  Number(__EDITOR_FONT_SIZE__),
  autocompleteDebouncMs: Number(__AUTOCOMPLETE_DEBOUNCE_MS__),
  monitorBufferSize:     Number(__MONITOR_BUFFER_SIZE__),
  queryLimit:            Number(__QUERY_LIMIT__),
  stopColor:             '#e05252',
} as const

/** CSS variables object — spread into style={{ }} or inject into :root */
export const cssVars: Record<string, string> = {
  '--bg-primary':    theme.bgPrimary,
  '--bg-secondary':  theme.bgSecondary,
  '--bg-panel':      theme.bgPanel,
  '--text-primary':  theme.textPrimary,
  '--text-muted':    theme.textMuted,
  '--border-color':  theme.borderColor,
  '--accent-color':  theme.accentColor,
}

/** Runtime color palettes for dark/light toggle */
export const DARK_COLORS = {
  bgPrimary:   '#1e1e2e',
  bgSecondary: '#181825',
  bgPanel:     '#313244',
  textPrimary: '#cdd6f4',
  textMuted:   '#6c7086',
  borderColor: '#45475a',
  accentColor: '#4f9cf9',
  editorTheme: 'vs-dark' as const,
}

export const LIGHT_COLORS = {
  bgPrimary:   '#f6f8fa',
  bgSecondary: '#ffffff',
  bgPanel:     '#eaeef2',
  textPrimary: '#1f2328',
  textMuted:   '#656d76',
  borderColor: '#d0d7de',
  accentColor: '#0969da',
  editorTheme: 'vs' as const,
}

export type ColorPalette = typeof DARK_COLORS
