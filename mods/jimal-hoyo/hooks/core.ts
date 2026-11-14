// State, calling hoyo, refreshing, buttons and the ticker. No drawing here.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, Timer } from 'claude-code'

import type { Busy, Model, RunView } from '../types'
import { RUN_ID, clean, explain, isValidRepo, lastMeaningfulLine, logLineOf, parseEnvelope, toRunView } from './logic'
import type { Envelope } from './logic'
import {
  ERROR_KEEP_MS, EVERY_IDLE_MS, EVERY_RUNNING_MS, FALLBACK_BACKOFF_MS, INFLIGHT_MAX_MS, LOG_PROCESS_EVERY_MS, LOG_READ_EVERY_MS, LOG_READ_MAX_BYTES, S, TIMEOUT,
} from './strings'

export const PANE = 'jimal-hoyo'
// Command time is bounded: a busy flag older than this is stale (a reload dropped its command).
const STALE_SLACK_MS = 5_000

export const EMPTY: Model = {
  isLoaded: false,
  needsRepo: false,
  today: { zzz: '', hsr: '' },
  stateRoot: '',
  active: null,
  last: null,
  logLine: '',
  error: [],
  errorAt: 0,
  notice: '',
  busy: null,
}

// Change the tag when a field of Model changes: a stored value of another tag reads as EMPTY.
// (model-2: values written before the control-character cleaning are dropped.)
const model = atom({ plugin: 'jimal-hoyo', key: 'model' } as const, EMPTY, { shape: 'model-2' })
// Bumped every second while a run is shown, so the elapsed time redraws.
const now = atom({ plugin: 'jimal-hoyo', key: 'now' } as const, 0)

// The state library reads only a source declared in the file that reads it: the pane's drawing
// reads the model and the clock through these.
export async function readModel($: EngineInterface): Promise<Model> {
  return read($, model)
}
export async function readNow($: EngineInterface): Promise<number> {
  return read($, now)
}

// ---------------------------------------------------------------------------
// Module-level handles. A reload starts a fresh environment (its old timers are
// dropped), so these start empty again; everything that must survive is in $.state.

let repoOption = ''
let ticker: Timer | undefined
let isTicking = false
let inflight: Promise<void> | undefined
let inflightAt = 0
let isActing = false
let lastRefreshAt = 0
let lastLogAt = 0
let lastLogReadAt = -Infinity
let lastLogKey = ''
let lastFallbackAt = -Infinity
let wasHidden = false
// What the last drawing said about where the pane sits: a widget is a shown pane.
let isWidget = false

export const setWidget = (v: boolean): void => {
  isWidget = v
}

// ---------------------------------------------------------------------------
// The repository folder

// Not cleaned of control characters: a folder that holds one must be refused (isValidRepo),
// not quietly turned into another folder.
export const cleanPath = (p: string): string => p.trim().replace(/^["']|["']$/g, '').replace(/[\\/]+$/, '')

export const setRepoOption = (v: unknown): void => {
  repoOption = typeof v === 'string' ? cleanPath(v) : ''
}

/** The folder in use, or '' with `invalid` set when what is configured has the wrong form. */
async function getRepo($: EngineInterface): Promise<{ repo: string; invalid: string }> {
  const stored = await $.store.get('repo').catch(() => undefined)
  const raw = repoOption || (typeof stored === 'string' ? cleanPath(stored) : '')
  if (!raw) return { repo: '', invalid: '' }
  return isValidRepo(raw) ? { repo: raw, invalid: '' } : { repo: '', invalid: raw }
}

export async function currentRepo($: EngineInterface): Promise<string> {
  return (await getRepo($)).repo
}

// ---------------------------------------------------------------------------
// Writing the model: every string that came from outside is cleaned on its way in.

const cleanPatch = (p: Partial<Model>): Partial<Model> => ({
  ...p,
  ...(p.error ? { error: p.error.map(clean) } : {}),
  ...(p.notice !== undefined ? { notice: clean(p.notice) } : {}),
  ...(p.logLine !== undefined ? { logLine: clean(p.logLine) } : {}),
})

export async function set($: EngineInterface, patch: Partial<Model>): Promise<void> {
  await update($, model, m => ({ ...m, ...cleanPatch(patch) }))
}

export async function setError($: EngineInterface, lines: string[]): Promise<void> {
  const at = await $.clock.now().catch(() => 0)
  await set($, { error: lines, errorAt: at })
}

// ---------------------------------------------------------------------------
// Calling hoyo

type Reply =
  | { kind: 'env'; env: Envelope }
  | { kind: 'error'; lines: string[] }
  | { kind: 'norepo'; invalid: string }

async function hoyo($: EngineInterface, verb: string[], timeoutMs: number): Promise<Reply> {
  const { repo, invalid } = await getRepo($)
  if (!repo) return { kind: 'norepo', invalid }
  const argv = ['pwsh', '-NoProfile', '-File', `${repo}\\hoyo.ps1`, ...verb, '--json']
  let out: { exitCode: number; stdout: string; stderr: string }
  try {
    out = await $.process.run(argv, { timeoutMs })
  } catch (err) {
    return { kind: 'error', lines: [S.spawnFailed(clean(err instanceof Error ? err.message : String(err)))] }
  }
  const env = parseEnvelope(out.stdout)
  if (!env) {
    // pwsh's own errors carry ANSI colour: cleaned before they are shown.
    const detail = clean(out.stderr || out.stdout).trim().split(/\r?\n/)[0] ?? ''
    return { kind: 'error', lines: [S.unreadable(out.exitCode), ...(detail ? [detail.slice(0, 200)] : [])] }
  }
  return { kind: 'env', env }
}

// The error lines of a reply that did not succeed; undefined for a good one.
const failure = (r: Reply): string[] | undefined =>
  r.kind === 'error' ? r.lines : r.kind === 'env' && !r.env.ok ? explain(r.env) : undefined

// ---------------------------------------------------------------------------
// Refreshing

async function readRunFile($: EngineInterface, root: string, runId: string): Promise<RunView | null> {
  if (!root || !RUN_ID.test(runId)) return null
  try {
    const text = await $.fs.read(`${root}\\runs\\${runId}\\status.json`)
    return typeof text === 'string' ? toRunView(JSON.parse(text)) : null
  } catch {
    return null
  }
}

// The run's document from disk, else from `hoyo result`.
async function loadRun($: EngineInterface, root: string, runId: string): Promise<RunView | null> {
  const disk = await readRunFile($, root, runId)
  if (disk) return disk
  // The disk failed: the process fallback starts its back-off now.
  lastFallbackAt = await $.clock.now().catch(() => 0)
  const r = await hoyo($, ['result', runId], TIMEOUT.read)
  return r.kind === 'env' && r.env.ok ? toRunView(r.env.data) : null
}

// The latest line of the current game's upstream log: stat first (a file that has not
// changed is not read again), read at most every 6 s; only a file that cannot be read
// (over 4 MiB) falls back to `hoyo logs`, and that at most every 20 s.
async function refreshLog($: EngineInterface, root: string, run: RunView): Promise<void> {
  if (!run.currentGame || !/^[a-z0-9_]+$/.test(run.currentGame) || !RUN_ID.test(run.runId) || !root) return
  const path = `${root}\\runs\\${run.runId}\\${run.currentGame}\\upstream.log`
  const now0 = await $.clock.now()
  if (now0 - lastLogReadAt < LOG_READ_EVERY_MS) return
  try {
    const st = await $.fs.stat(path)
    const key = `${path}|${st.size}|${st.mtimeMs}`
    if (key === lastLogKey) {
      lastLogReadAt = now0
      return
    }
    if (st.size <= LOG_READ_MAX_BYTES) {
      const text = await $.fs.read(path)
      if (typeof text === 'string') {
        lastLogKey = key
        lastLogReadAt = now0
        await set($, { logLine: lastMeaningfulLine(text) })
        return
      }
    }
  } catch (err) {
    // A missing file (the game has only just started) shows nothing; any other failure falls through to hoyo.
    if (err instanceof Error && /ENOENT|no such|not found|cannot find/i.test(err.message)) return
  }
  const at = await $.clock.now()
  if (at - lastLogAt < LOG_PROCESS_EVERY_MS) return
  lastLogAt = at
  const r = await hoyo($, ['logs', run.runId, '--source', run.currentGame, '--tail', '30'], TIMEOUT.read)
  if (r.kind === 'env' && r.env.ok) await set($, { logLine: logLineOf(r.env.data) })
}

async function fullRefresh($: EngineInterface): Promise<void> {
  const r = await hoyo($, ['status', '--no-verify'], TIMEOUT.read)
  const before = await read($, model)
  const at = await $.clock.now().catch(() => 0)
  if (r.kind === 'norepo') {
    // The error and notice stay: they may be about the folder that was just refused.
    await set($, { ...EMPTY, isLoaded: true, needsRepo: true, error: before.error, errorAt: before.errorAt, notice: before.notice })
    if (r.invalid) await setError($, [S.repoInvalid(r.invalid)])
    return
  }
  const bad = failure(r)
  if (bad || r.kind !== 'env') {
    await set($, { isLoaded: true, needsRepo: false })
    await setError($, bad ?? [])
    return
  }
  const d = r.env.data
  const obj = (v: unknown): Record<string, unknown> | null =>
    typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null
  const text = (v: unknown): string => (typeof v === 'string' ? v : '')
  const todayOf = (g: string): string => clean(text(obj(obj(d.today)?.[g])?.outcome))
  const root = clean(text(d.state_root))
  const activeId = text(obj(d.active_run)?.run_id)
  const lastId = text(obj(d.last_run)?.run_id)
  const active = activeId ? await loadRun($, root, activeId) : null
  const last = !active && lastId ? await loadRun($, root, lastId) : null
  const keepError = at - before.errorAt < ERROR_KEEP_MS
  await set($, {
    isLoaded: true,
    needsRepo: false,
    error: keepError ? before.error : [],
    errorAt: keepError ? before.errorAt : 0,
    today: { zzz: todayOf('zzz'), hsr: todayOf('hsr') },
    stateRoot: root,
    active,
    last,
    logLine: active && active.currentGame === before.active?.currentGame ? before.logLine : '',
  })
  if (active) await refreshLog($, root, active)
}

// A running run is followed from its status.json on disk; a process starts only
// when the file is unreadable (then at most every 15 s) or the run has ended
// (today's results changed). Reading the file never clears an error.
async function doRefresh($: EngineInterface, isFull: boolean): Promise<void> {
  const m = await read($, model)
  if (!isFull && m.active && m.stateRoot) {
    const doc = await readRunFile($, m.stateRoot, m.active.runId)
    if (doc && doc.state !== 'finished') {
      await set($, { active: doc, ...(doc.currentGame !== m.active.currentGame ? { logLine: '' } : {}) })
      await refreshLog($, m.stateRoot, doc)
      return
    }
    if (!doc) {
      const at = await $.clock.now()
      if (at - lastFallbackAt < FALLBACK_BACKOFF_MS) return
      lastFallbackAt = at
    }
  }
  await fullRefresh($)
}

// A full refresh asked while another is in flight waits for it, then runs a fresh one:
// the older result may predate the command that asked.
export async function refresh($: EngineInterface, isFull = false): Promise<void> {
  const at = await $.clock.now().catch(() => 0)
  if (inflight && at - inflightAt > INFLIGHT_MAX_MS) inflight = undefined
  if (inflight) {
    if (!isFull) return inflight
    const old = inflight
    // The wait is bounded by what is left of the 120 s the old refresh is allowed
    // (a timer, not a sleep: a sleep would be charged to this dispatch's budget).
    let timer: Timer | undefined
    const patience = new Promise<void>(resolve => {
      timer = $.clock.after(Math.max(0, INFLIGHT_MAX_MS - (at - inflightAt)), () => resolve())
    })
    await Promise.race([old.catch(() => undefined), patience])
    timer?.cancel()
    if (inflight === old) inflight = undefined // given up on
    if (inflight && inflight !== old) return inflight
  }
  let me: Promise<void> | undefined
  me = (async () => {
    try {
      await doRefresh($, isFull)
    } catch (err) {
      await setError($, [S.spawnFailed(clean(err instanceof Error ? err.message : String(err)))]).catch(() => undefined)
    } finally {
      lastRefreshAt = await $.clock.now().catch(() => 0)
      if (inflight === me) inflight = undefined
    }
  })()
  inflight = me
  inflightAt = at
  return me
}

export const resetRefreshClock = (): void => {
  lastRefreshAt = 0
}

// ---------------------------------------------------------------------------
// Buttons

export const isBusy = (b: Busy | null, at: number): boolean => b !== null && b.until > at

type ActionKind = Busy['kind']

export async function act($: EngineInterface, kind: ActionKind, verb: string[], timeoutMs: number): Promise<void> {
  if (isActing) return
  isActing = true
  let errLines: string[] = []
  try {
    const at = await $.clock.now()
    if (isBusy((await read($, model)).busy, at)) return
    // A new action is the user's: the old error goes.
    await set($, { busy: { kind, until: at + timeoutMs + STALE_SLACK_MS }, error: [], errorAt: 0, notice: '' })
    const r = await hoyo($, verb, timeoutMs)
    if (r.kind === 'norepo') await set($, { needsRepo: true })
    else errLines = failure(r) ?? []
  } catch (err) {
    errLines = [S.spawnFailed(clean(err instanceof Error ? err.message : String(err)))]
  } finally {
    isActing = false
    await set($, { busy: null }).catch(() => undefined)
    // The command's own error is shown first, time-stamped so the refresh that follows
    // (which may have to wait for one in flight) keeps it for a while.
    if (errLines.length > 0) await setError($, errLines).catch(() => undefined)
    await refresh($, true)
  }
}

export function startRun($: EngineInterface, game: 'all' | 'zzz' | 'hsr'): Promise<void> {
  return act($, 'run', ['run', game, '--detach'], TIMEOUT.run)
}

// ---------------------------------------------------------------------------
// The ticker: alive only while the pane is placed; busy only while it is shown.

export function stopTicker(): void {
  ticker?.cancel()
  ticker = undefined
}

async function tick($: EngineInterface, me: Timer): Promise<void> {
  if (isTicking) return
  isTicking = true
  try {
    const pane = (await $.ui.panes()).find(p => p.id === PANE)
    if (!pane || !pane.isPlaced) {
      // Only this tick's own timer is cancelled: a newer one (the pane opened again) stays.
      me.cancel()
      if (ticker === me) ticker = undefined
      return
    }
    // Covered by another tab: nothing is read and no process starts; shown again, refresh at once.
    if (!pane.isShown && !isWidget) {
      wasHidden = true
      return
    }
    if (wasHidden) {
      wasHidden = false
      lastRefreshAt = 0
    }
    const at = await $.clock.now()
    const m = await read($, model)
    const isRunning = m.active !== null
    if (isRunning) await update($, now, () => at)
    const every = isRunning ? EVERY_RUNNING_MS : EVERY_IDLE_MS
    // Not awaited: the elapsed time keeps ticking while a refresh runs.
    // (refresh() itself returns a refresh still in flight, and gives up one that is too old.)
    if (at - lastRefreshAt >= every) void refresh($)
  } catch {
    // A failed tick is tried again at the next second.
  } finally {
    isTicking = false
  }
}

// One ticker per module environment, however many times the pane opens or draws.
export function ensureTicker($: EngineInterface): void {
  if (ticker) return
  let me: Timer | undefined
  me = $.clock.every(1000, () => {
    if (me) void tick($, me)
  })
  ticker = me
  void tick($, me)
}
