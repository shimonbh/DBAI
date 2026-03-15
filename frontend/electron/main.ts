import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import path from 'path'
import http from 'http'
import fs from 'fs'
import { spawn, spawnSync, ChildProcess } from 'child_process'

const isDev = !app.isPackaged  // true in dev (electron .), false in built exe

// ── Python detection ───────────────────────────────────────────────────────────

/**
 * Find a Python 3.10+ executable on the system PATH.
 * Tries python3.12 → python3 → python in order.
 * Returns the command string, or null if none found.
 */
function findPython(): string | null {
  const candidates = ['python3.12', 'python3', 'python']
  for (const cmd of candidates) {
    try {
      const r = spawnSync(
        cmd,
        ['-c', 'import sys; exit(0 if sys.version_info >= (3, 10) else 1)'],
        { timeout: 4000 },
      )
      if (r.status === 0) return cmd
    } catch { /* command not found — try next */ }
  }
  return null
}

// ── Backend process (production only) ─────────────────────────────────────────

let backendProcess: ChildProcess | null = null

// Path to the backend log — written on every launch, useful for diagnosing issues
const logPath = path.join(app.getPath('userData'), 'backend.log')

function startBackend(): void {
  if (isDev) return  // dev: backend started externally by launch.py

  const py = findPython()
  if (!py) {
    dialog.showErrorBox(
      'Python 3.12 Not Found',
      'D.B.A.I requires Python 3.12 (or newer) to run the backend server.\n\n' +
      'Please install Python 3.12 from:\n  https://www.python.org/downloads/\n\n' +
      'Make sure to check "Add Python to PATH" during installation,\n' +
      'then restart D.B.A.I.',
    )
    app.quit()
    return
  }

  const serverScript = path.join(process.resourcesPath, 'backend', 'run_server.py')
  const cwd          = path.join(process.resourcesPath, 'backend')

  // Write backend stdout + stderr to a log file so startup errors are visible
  const logFd = fs.openSync(logPath, 'w')

  backendProcess = spawn(py, [serverScript], {
    cwd,
    env: { ...process.env, DBAI_HOST: '127.0.0.1', DBAI_PORT: '8000' },
    stdio: ['ignore', logFd, logFd],
    detached: false,
  })
  backendProcess.on('error', (err) => {
    fs.appendFileSync(logPath, `\n[spawn error] ${err.message}\n`)
  })
}

function waitForBackend(retries = 40, delayMs = 500): Promise<void> {
  return new Promise((resolve, reject) => {
    const attempt = (n: number) => {
      const req = http.get('http://127.0.0.1:8000/health', (res) => {
        if (res.statusCode === 200) {
          resolve()
        } else if (n > 0) {
          setTimeout(() => attempt(n - 1), delayMs)
        } else {
          reject(new Error('Backend health check failed'))
        }
      })
      req.on('error', () => {
        if (n > 0) setTimeout(() => attempt(n - 1), delayMs)
        else reject(new Error('Backend did not start in time'))
      })
      req.end()
    }
    attempt(retries)
  })
}

function stopBackend(): void {
  if (backendProcess) {
    backendProcess.kill()
    backendProcess = null
  }
}

// ── Window ────────────────────────────────────────────────────────────────────

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    title: 'D.B.A.I — Database IDE',
    backgroundColor: '#1e1e2e',
    webPreferences: {
      preload:          path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration:  false,
    },
  })

  if (isDev) {
    win.loadURL('http://localhost:15173')
    win.webContents.openDevTools()
  } else {
    win.loadFile(path.join(app.getAppPath(), 'dist', 'index.html'))
  }

  win.setMenuBarVisibility(false)
}

// ── IPC Handlers ──────────────────────────────────────────────────────────────

ipcMain.handle('dialog:openFile', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [{ name: 'SQL Files', extensions: ['sql', 'txt'] }],
  })
  if (result.canceled || !result.filePaths.length) return null
  return result.filePaths[0]
})

// ── App lifecycle ─────────────────────────────────────────────────────────────

app.whenReady().then(async () => {
  startBackend()
  if (!isDev) {
    try {
      await waitForBackend()
    } catch {
      // Backend didn't start — show the log so the user knows what went wrong
      dialog.showErrorBox(
        'Backend failed to start',
        'The Python backend did not respond in time.\n\n' +
        'Common fix — open a terminal and run:\n' +
        '  pip install -r requirements.txt\n\n' +
        `Detailed log:\n  ${logPath}`,
      )
    }
  }
  createWindow()
})

app.on('before-quit', stopBackend)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
