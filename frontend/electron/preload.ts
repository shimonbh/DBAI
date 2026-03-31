import { contextBridge, ipcRenderer } from 'electron'

/**
 * Expose a minimal, safe API to the renderer process.
 * Only methods explicitly listed here are accessible from React code.
 */
contextBridge.exposeInMainWorld('electronAPI', {
  /** Open native file-open dialog. Returns selected file path or null. */
  openFile: () => ipcRenderer.invoke('dialog:openFile'),

  /** Open native folder-picker dialog. Returns selected folder path or null. */
  selectFolder: () => ipcRenderer.invoke('dialog:selectFolder'),

  /** Write a project's query tree to the filesystem under basePath.
   *  Returns { ok: true } on success or { ok: false, error: string }. */
  exportProject: (basePath: string, nodes: unknown[]) =>
    ipcRenderer.invoke('fs:exportProject', basePath, nodes),

  /** Open file picker for .sql files; returns [{name, content}] or null if cancelled. */
  importSqlFiles: () => ipcRenderer.invoke('dialog:importSqlFiles'),

  /** Recursively read all .sql files under folderPath.
   *  Returns { ok: true, nodes: ImportNode[] } or { ok: false, error: string }. */
  readFolder: (folderPath: string) => ipcRenderer.invoke('fs:readFolder', folderPath),

  /** Open a file or folder in the OS default handler (Explorer / Finder).
   *  Returns an empty string on success, or an error message. */
  openPath: (targetPath: string) => ipcRenderer.invoke('shell:openPath', targetPath),
})
