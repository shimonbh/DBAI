export {}

interface ImportFolderNode {
  kind: 'file' | 'folder'
  name: string
  content?: string
  children?: ImportFolderNode[]
}

declare global {
  interface Window {
    electronAPI?: {
      openFile: () => Promise<string | null>
      selectFolder: () => Promise<string | null>
      exportProject: (basePath: string, nodes: unknown[]) => Promise<{ ok: boolean; exportedPath?: string; error?: string }>
      importSqlFiles: () => Promise<Array<{ name: string; content: string }> | null>
      readFolder: (folderPath: string) => Promise<{ ok: boolean; nodes?: ImportFolderNode[]; error?: string }>
      openPath: (targetPath: string) => Promise<string>
    }
  }
}
