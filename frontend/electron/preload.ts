import { contextBridge, ipcRenderer } from 'electron'

/**
 * Expose a minimal, safe API to the renderer process.
 * Only methods explicitly listed here are accessible from React code.
 */
contextBridge.exposeInMainWorld('electronAPI', {
  /** Open native file dialog. Returns the selected file path or null. */
  openFile: () => ipcRenderer.invoke('dialog:openFile'),
})
