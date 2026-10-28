export type FileNode = {
  id: string
  parent: string
  name: string
  kind: 'dir' | 'file' | 'link'
  hidden: boolean
  mtime: number
  size: number
  loaded: boolean
}

export type Branch = {
  head: string
  upstream: string
  ahead: number
  behind: number
}

export type Activity = {
  id: number
  kind: string
  label: string
  state: 'running' | 'done' | 'failed'
  detail: string
  at: number
  tone: string
  nerd: string
  plain: string
}

export type FileTree = {
  root: string
  nodes: FileNode[]
  expanded: string[]
  cursor: string
  selected: string
  query: string
  showHidden: boolean
  column: 'date' | 'size' | 'loc'
  dirSizes: Record<string, number>
  git: Record<string, string>
  diff: Record<string, [number, number]>
  ignored: string[]
  untrackedDirs: string[]
  top: string
  prefix: string
  branch: Branch | null
  counts: Record<string, [number, number, number]>
  flash: string[]
  flashDim: string[]
  flashOn: boolean
  flashTones: Record<string, string>
  scroll: number | null
  preview: string
  previewTop: number
  split: boolean
}

export type Theme = {
  fg: string
  accent: string
  muted: string
  urgent: string
  selection: string
  bg: string
}

export type MarkStatus = 'planned' | 'editing' | 'done'

export type Marks = {
  /** Absolute paths, as the tree's node ids, with what Claude does to each in the current task. */
  files: Record<string, MarkStatus>
  /** A task (the session's task list) is running. */
  isActive: boolean
  /** When the held marks clear, in ms since the epoch; null while a task runs. */
  clearAt: number | null
}

declare module 'claude-code' {
  interface PluginState {
    'jimal-filetree': {
      tree: FileTree
      theme: Theme
      activity: Activity[]
      marks: Marks
      /** Lines Claude added and removed per file this session, for a folder git does not count. */
      lines: Record<string, [number, number]>
    }
  }
}
