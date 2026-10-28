import type { MarkStatus, Marks } from '../types'

// What Claude plans to change, is changing and has changed in the current task, kept
// apart from git so a folder that is no repository shows it too.
//
// A task is the session's task list from its first item to its wrap-up: an edit while it
// runs marks the file `editing`; when a step completes, its edits turn `done`; once the
// task finishes, the marks stay HOLD_MS and then clear, or clear when the next task starts.

export const HOLD_MS = 30_000

export const MARK_COLORS: Record<MarkStatus, string> = {
  planned: '#5fa8d3',
  editing: '#f59e0b',
  done: '#4caf6e',
}

export const MARK_LABELS: Record<MarkStatus, string> = {
  planned: 'planned',
  editing: 'changing',
  done: 'changed',
}

export const emptyMarks = (): Marks => ({ files: {}, isActive: false, clearAt: null })

const RANK: Record<MarkStatus, number> = { planned: 0, editing: 1, done: 2 }

// A new task: the last one's marks go.
export const started = (): Marks => ({ files: {}, isActive: true, clearAt: null })

// Files about to change: marked `planned` unless they already show more.
export const planned = (m: Marks, paths: string[]): Marks => {
  const files = { ...m.files }
  for (const p of paths) if (!(p in files)) files[p] = 'planned'
  return { ...m, files }
}

// Files just written: `editing` while a task runs (`done` again once a later edit lands
// after its step closed is still `editing`, since the file is being changed anew).
// Outside any task an edit is `done` at once, held like a finished task's marks.
export const edited = (m: Marks, paths: string[], at: number): Marks => {
  const files = { ...m.files }
  for (const p of paths) files[p] = m.isActive ? 'editing' : 'done'
  return { ...m, files, clearAt: m.isActive ? null : at + HOLD_MS }
}

// A step completed: its edits are done.
export const stepDone = (m: Marks): Marks => {
  const files: Record<string, MarkStatus> = {}
  for (const [p, s] of Object.entries(m.files)) files[p] = s === 'editing' ? 'done' : s
  return { ...m, files }
}

// The task finished: every edit is done, and the marks are held HOLD_MS.
export const finished = (m: Marks, at: number): Marks => ({ ...stepDone(m), isActive: false, clearAt: at + HOLD_MS })

// The marks a folder carries: the most advanced status of any marked file inside it.
export const folderMarks = (m: Marks, ancestorsOf: (path: string) => string[]): Record<string, MarkStatus> => {
  const out: Record<string, MarkStatus> = {}
  for (const [p, s] of Object.entries(m.files)) {
    for (const a of ancestorsOf(p)) {
      const cur = out[a]
      if (cur === undefined || RANK[s] > RANK[cur]) out[a] = s
    }
  }
  return out
}

// Lines added and removed between two texts, for a folder git does not count: each line
// of one text matched at most once against an equal line of the other, the rest counted.
// Cheap (no alignment), and exact for the usual edit of a few lines.
const linesOf = (s: string): string[] => (s === '' ? [] : s.replace(/\r\n/g, '\n').replace(/\n$/, '').split('\n'))

export const lineDelta = (before: string, after: string): [number, number] => {
  const left = new Map<string, number>()
  for (const l of linesOf(before)) left.set(l, (left.get(l) ?? 0) + 1)
  let added = 0
  for (const l of linesOf(after)) {
    const n = left.get(l) ?? 0
    if (n > 0) left.set(l, n - 1)
    else added++
  }
  let removed = 0
  for (const n of left.values()) removed += n
  return [added, removed]
}

// Paths named in free text (a task list item, a plan): words with a slash or backslash,
// or a file name with an extension, stripped of quotes, backticks and trailing marks.
const PATH_WORD = /[`'"(]?((?:[A-Za-z]:)?[\w.\-~/\\]*?[\w\-]+\.[A-Za-z0-9]{1,8}|(?:[\w.\-~]+[\\/])+[\w.\-]+)[`'")]?(?=[\s,;:!?)]|$)/g

export const pathsIn = (text: string): string[] => {
  const out = new Set<string>()
  // A web address names no file here.
  for (const match of text.replace(/\b[a-z][\w+.-]*:\/\/\S+/gi, ' ').matchAll(PATH_WORD)) {
    const raw = (match[1] ?? '').trim().replace(/[.,;:]+$/, '')
    if (raw.length < 3 || /^\d+(\.\d+)+$/.test(raw)) continue
    out.add(raw.replace(/\\/g, '/'))
  }
  return [...out]
}
