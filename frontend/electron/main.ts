import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import path from 'path'

const isDev = process.env.NODE_ENV !== 'production'

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    title: 'D.B.A.I — Database IDE',
    backgroundColor: '#1e1e2e',
    webPreferences: {
      preload:         path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration:  false,
    },
  })

  if (isDev) {
    win.loadURL('http://localhost:15173')
    // DevTools closed by default — press F12 inside the app to open manually
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  win.setMenuBarVisibility(false)
}

// ── IPC Handlers ──────────────────────────────────────────────────────────────

/** Open native file dialog for .sql file selection */
ipcMain.handle('dialog:openFile', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [{ name: 'SQL Files', extensions: ['sql', 'txt'] }],
  })
  if (result.canceled || !result.filePaths.length) return null
  return result.filePaths[0]
})

// ── App lifecycle ─────────────────────────────────────────────────────────────

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
