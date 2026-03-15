import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, path.resolve(__dirname, '..'), '')

  return {
    plugins: [react()],
    base: './',   // relative paths so Electron can load assets via file:// protocol
    resolve: {
      alias: { '@': path.resolve(__dirname, './src') },
    },
    server: {
      port: 15173,
      proxy: {
        '/api': {
          target: `http://${env.DBAI_HOST || '127.0.0.1'}:${env.DBAI_PORT || '8000'}`,
          changeOrigin: true,
        },
        '/ws': {
          target: `ws://${env.DBAI_HOST || '127.0.0.1'}:${env.DBAI_PORT || '8000'}`,
          ws: true,
        },
      },
    },
    define: {
      // Expose VITE_ prefixed env vars to the frontend
      __LEFT_PANEL_WIDTH__: env.VITE_LEFT_PANEL_WIDTH || '280',
      __EDITOR_HEIGHT_PERCENT__: env.VITE_EDITOR_HEIGHT_PERCENT || '60',
      __EDITOR_FONT_SIZE__: env.VITE_EDITOR_FONT_SIZE || '14',
      __COLOR_SCHEME__: JSON.stringify(env.VITE_COLOR_SCHEME || 'dark'),
      __ACCENT_COLOR__: JSON.stringify(env.VITE_ACCENT_COLOR || '#4f9cf9'),
      __EDITOR_THEME__: JSON.stringify(env.VITE_EDITOR_THEME || 'vs-dark'),
      __BG_PRIMARY__: JSON.stringify(env.VITE_BG_PRIMARY || '#1e1e2e'),
      __BG_SECONDARY__: JSON.stringify(env.VITE_BG_SECONDARY || '#181825'),
      __BG_PANEL__: JSON.stringify(env.VITE_BG_PANEL || '#313244'),
      __TEXT_PRIMARY__: JSON.stringify(env.VITE_TEXT_PRIMARY || '#cdd6f4'),
      __TEXT_MUTED__: JSON.stringify(env.VITE_TEXT_MUTED || '#6c7086'),
      __BORDER_COLOR__: JSON.stringify(env.VITE_BORDER_COLOR || '#45475a'),
      __AUTOCOMPLETE_DEBOUNCE_MS__: env.VITE_AUTOCOMPLETE_DEBOUNCE_MS || '400',
      __MONITOR_BUFFER_SIZE__: env.VITE_MONITOR_BUFFER_SIZE || '60',
      __QUERY_LIMIT__: env.VITE_QUERY_LIMIT || '300',
    },
  }
})
