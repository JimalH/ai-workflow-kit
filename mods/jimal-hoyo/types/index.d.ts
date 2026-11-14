export type GameId = 'zzz' | 'hsr'

export type TaskView = {
  id: string
  name: string
  status: string
  reason: string
  /** A missing `verified` reads as true (runs written before the field existed). */
  verified: boolean
}

export type NeedsUser = { game: string; code: string; message: string }

export type StepView = {
  game: string
  /** pending | running | stopping | finished */
  state: string
  /** Run outcomes plus not_run; empty while the step has none. */
  outcome: string
  endedAt: string
  tasks: TaskView[]
  needsUser: NeedsUser[]
}

export type RunView = {
  runId: string
  state: string
  outcome: string
  isDryRun: boolean
  isPaused: boolean
  games: string[]
  currentGame: string
  startedAt: string
  endedAt: string
  message: string
  steps: StepView[]
  needsUser: NeedsUser[]
}

export type Busy = {
  kind: 'run' | 'stop' | 'pause' | 'resume'
  /** Time (ms since the epoch) after which the flag counts as stale, e.g. left by a reload. */
  until: number
}

export type Model = {
  /** True once a refresh has answered. */
  isLoaded: boolean
  needsRepo: boolean
  /** Outcome per game for today: '' = not run yet. */
  today: { zzz: string; hsr: string }
  stateRoot: string
  active: RunView | null
  last: RunView | null
  /** Latest upstream log line of the current game. */
  logLine: string
  /** When the error was set (ms); refreshes keep it for a while. */
  errorAt: number
  /** Lines shown in the error block. */
  error: string[]
  /** One neutral line (repo saved ...). */
  notice: string
  busy: Busy | null
}

declare module 'claude-code' {
  interface PluginState {
    'jimal-hoyo': {
      model: Shaped<Model>
      now: number
    }
  }
}
