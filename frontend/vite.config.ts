import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import fs from 'fs'

function genLicensesPlugin() {
  const ROOT = path.resolve(__dirname)
  const OUT  = path.join(ROOT, 'src', 'generated', 'licenses.ts')

  const FREE_COMMERCIAL = new Set([
    'MIT', 'BSD-2-Clause', 'BSD-3-Clause', 'ISC', 'Apache-2.0', '0BSD',
    'CC0-1.0', 'Unlicense', 'WTFPL', 'BlueOak-1.0.0',
    'LGPL-2.0', 'LGPL-2.1', 'LGPL-2.1-only', 'LGPL-2.1-or-later',
    'LGPL-3.0', 'LGPL-3.0-only', 'LGPL-3.0-or-later',
  ])
  const RESTRICTED = new Set([
    'GPL-2.0', 'GPL-2.0-only', 'GPL-2.0-or-later',
    'GPL-3.0', 'GPL-3.0-only', 'GPL-3.0-or-later',
    'AGPL-3.0', 'AGPL-3.0-only', 'AGPL-3.0-or-later',
    'SSPL-1.0', 'CC-BY-NC-4.0', 'CC-BY-NC-SA-4.0',
  ])

  function classifyLicense(lic: string): 'free' | 'restricted' | 'unknown' {
    if (!lic || lic === 'UNLICENSED' || lic === 'SEE LICENSE IN LICENSE') return 'unknown'
    const first = lic.replace(/^\(/, '').split(/\s+(?:OR|AND)\s+/)[0].replace(/\)$/, '').trim()
    if (FREE_COMMERCIAL.has(first)) return 'free'
    if (RESTRICTED.has(first)) return 'restricted'
    return 'unknown'
  }

  function getUrl(pkg: Record<string, unknown>): string {
    const repo = pkg.repository as string | { url?: string } | undefined
    if (typeof repo === 'string') return repo.replace('git+', '').replace(/\.git$/, '').replace('git://', 'https://')
    if (repo?.url) return (repo.url as string).replace('git+', '').replace(/\.git$/, '').replace('git://', 'https://')
    return (pkg.homepage as string) || ''
  }

  function generate() {
    try {
      const appPkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'))
      const allDeps: Record<string, string> = { ...appPkg.dependencies ?? {}, ...appPkg.devDependencies ?? {} }
      const libs: Array<{ name: string; version: string; license: string; url: string; commercial: string }> = []
      for (const name of Object.keys(allDeps)) {
        try {
          const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'node_modules', name, 'package.json'), 'utf8'))
          const licRaw: string = typeof pkg.license === 'string' ? pkg.license : (pkg.license?.type ?? 'UNKNOWN')
          libs.push({ name, version: pkg.version ?? '?', license: licRaw, url: getUrl(pkg), commercial: classifyLicense(licRaw) })
        } catch { /* not installed */ }
      }
      libs.sort((a, b) => a.name.localeCompare(b.name))
      const content = `// AUTO-GENERATED — do not edit. Regenerated on every vite build/dev start.\nexport interface LibraryInfo {\n  name: string; version: string; license: string; url: string\n  commercial: 'free' | 'restricted' | 'unknown'\n}\nexport const APP_VERSION = ${JSON.stringify(appPkg.version)}\nexport const APP_DESCRIPTION = ${JSON.stringify(appPkg.description ?? '')}\nexport const LIBRARIES: LibraryInfo[] = ${JSON.stringify(libs, null, 2)}\n`
      fs.mkdirSync(path.join(ROOT, 'src', 'generated'), { recursive: true })
      fs.writeFileSync(OUT, content, 'utf8')
      console.log(`[gen-licenses] ${libs.length} packages written`)
    } catch (e) {
      console.warn('[gen-licenses] failed:', e)
    }
  }

  return { name: 'gen-licenses', buildStart: generate, configureServer: generate }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, path.resolve(__dirname, '..'), '')

  return {
    plugins: [genLicensesPlugin(), react()],
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
