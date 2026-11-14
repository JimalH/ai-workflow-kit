// Test helpers: a world beneath the plugin with a stubbed `$.process`, `$.fs`, panes and clock.
// Nothing here can start a real process: `process.run` is answered by the stub alone.
import { mock } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

export const REPO = 'C:\\Fake Repo\\HoYo'
export const ROOT = 'C:\\Fake State\\data'
export const RUN_A = '20260101-100000-aaaa'
export const RUN_B = '20260101-090000-bbbb'

export const PANE = {
  plugin: 'jimal-hoyo',
  component: 'Pane',
  requestId: 'jimal-hoyo',
  props: {
    title: 'x',
    isFocused: false,
    bodyColumns: 60,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 30 },
    view: {},
  },
} as const

export const envelope = (data: unknown, extra: { ok?: boolean; code?: number; error?: { code: string; message: string } } = {}) =>
  JSON.stringify({
    schema_version: 1,
    command: 'x',
    ok: extra.ok ?? true,
    exit_code: extra.code ?? 0,
    data,
    error: extra.error ?? null,
  })

export const task = (id: string, status: string, reason = '', verified?: boolean, name = id) => ({
  id,
  name,
  status,
  reason,
  evidence: ['log line with a private path'],
  ...(verified === undefined ? {} : { verified }),
})

export const step = (game: string, over: Record<string, unknown> = {}) => ({
  game,
  state: 'finished',
  outcome: 'partial',
  forced: false,
  started_at: '2026-01-01T10:00:01+00:00',
  ended_at: '2026-01-01T10:05:09+00:00',
  exit_code: 0,
  tasks: [],
  needs_user: [],
  ...over,
})

export const runDoc = (over: Record<string, unknown> = {}) => ({
  schema_version: 1,
  run_id: RUN_A,
  state: 'finished',
  outcome: 'partial',
  dry_run: false,
  games: ['zzz', 'hsr'],
  created_at: '2026-01-01T10:00:00+00:00',
  started_at: '2026-01-01T10:00:01+00:00',
  ended_at: '2026-01-01T10:20:00+00:00',
  current_game: null,
  paused: false,
  steps: [],
  needs_user: [],
  message: '',
  ...over,
})

export type Handler = (argv: readonly string[]) => { stdout: string; exitCode?: number; stderr?: string } | Promise<{ stdout: string; exitCode?: number; stderr?: string }>

export type World = {
  clock: ReturnType<typeof mock.clock>
  /** Every argv `process.run` was asked for. */
  calls: string[][]
  /** The verbs of those calls. */
  verbs: () => string[]
  files: Record<string, string>
  handlers: Record<string, Handler>
  panes: { isPlaced: boolean; isShown: boolean }
  /** Paths read through `$.fs.read`. */
  reads: string[]
  /** Paths `$.fs.stat` was asked about. */
  stats: string[]
  /** Paths that exist but cannot be read (too big). */
  unreadable: Set<string>
  /** The timeout each verb was asked with. */
  timeouts: Record<string, number | undefined>
  /** How many times the ticker asked whether the pane is up. */
  panesCalls: () => number
}

/** Sets the stubs on `on` and returns the controls. */
export function world($: Engine, on: On, init: { store?: Record<string, unknown> } = {}): World {
  const clock = mock.clock(on, { now: Date.parse('2026-01-01T10:10:00+00:00') })
  mock.store(on, init.store ?? {})
  const w: World = { clock, calls: [], verbs: () => w.calls.map(c => c[4] ?? ''), files: {}, handlers: {}, panes: { isPlaced: true, isShown: true }, reads: [], stats: [], unreadable: new Set(), timeouts: {}, panesCalls: () => panesCalls }
  let panesCalls = 0
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('command.register', () => ({ value: { command: 'hoyo' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.panes', () => (panesCalls++, {
    value: w.panes.isPlaced ? [{ id: 'jimal-hoyo', title: 'x', isShown: w.panes.isShown, isFocused: false, isPlaced: true }] : [],
  }))
  on('fs.exists', (_, e) => ({
    value: e.path === `${REPO}\\hoyo.ps1` || e.path in w.files || w.unreadable.has(e.path),
  }))
  on('fs.read', (_, e, next) => {
    w.reads.push(e.path)
    return e.path in w.files ? { value: w.files[e.path] ?? '' } : next(e)
  })
  // stat: size and a content-derived mtime, so a changed file looks changed; a big one for `unreadable`.
  on('fs.stat', (_, e) => {
    w.stats.push(e.path)
    if (w.unreadable.has(e.path)) return { value: { kind: 'file', size: 5_000_000, mtimeMs: 1, isLink: false } }
    const text = w.files[e.path]
    if (text === undefined) return { deny: 'ENOENT: no such file' } as never
    let h = 0
    for (const ch of text) h = (h * 31 + ch.charCodeAt(0)) | 0
    return { value: { kind: 'file', size: text.length, mtimeMs: h, isLink: false } }
  })
  on('process.run', async (_, e) => {
    w.calls.push([...e.argv])
    w.timeouts[e.argv[4] ?? ''] = e.init?.timeoutMs
    const verb = e.argv[4] ?? ''
    const h = w.handlers[verb]
    if (!h) throw new Error(`no stub for verb ${verb}`)
    const r = await h(e.argv)
    return { value: { exitCode: r.exitCode ?? 0, stdout: r.stdout, stderr: r.stderr ?? '' } }
  })
  return w
}

export const statusData = (over: Record<string, unknown> = {}) => ({
  version: '0.1.0',
  install: null,
  elevation: { elevated: false, task: 'missing', task_name: 'T', mode: 'uac' },
  active_run: null,
  last_run: null,
  today: { zzz: null, hsr: null },
  state_root: ROOT,
  ...over,
})

export const statusFile = (runId: string) => `${ROOT}\\runs\\${runId}\\status.json`

type Node = { type?: string; props?: Record<string, unknown>; children?: unknown[] }
const textOf = (n: unknown): string => (typeof n === 'string' ? n : ((n as Node).children ?? []).map(textOf).join(''))
const walk = (n: unknown, texts: string[], buttons: string[]): void => {
  if (typeof n === 'string' || n === null || typeof n !== 'object') return
  const node = n as Node
  if (node.type === 'Text') texts.push(textOf(node))
  else if (node.type === 'Button') buttons.push(String(node.props?.label ?? ''))
  else for (const c of node.children ?? []) walk(c, texts, buttons)
}

/** What a mounted pane shows: its Text rows (nested Texts joined) and its Button labels. */
export const shown = async (ui: { drawn: () => Promise<unknown> }) => {
  const texts: string[] = []
  const buttons: string[] = []
  walk(await ui.drawn(), texts, buttons)
  return { texts, buttons, all: texts.join('\n') }
}

/** Starts the session, runs `/hoyo`, lets the first refresh finish and mounts the pane. */
export async function openPane($: Engine, w: World, args = '') {
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run({ command: 'hoyo', args, origin: { kind: 'composer' } } as never)
  await w.clock.settle()
  return $.ui.mount({ ...PANE, surface: 'desktop' })
}

export const verbArgv = (verb: string[]) => ['pwsh', '-NoProfile', '-File', `${REPO}\\hoyo.ps1`, ...verb, '--json']

export const logFile = (runId: string, game: string) => `${ROOT}\\runs\\${runId}\\${game}\\upstream.log`
