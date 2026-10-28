export type Phase = 'plan' | 'design' | 'delegate' | 'review' | 'close'

export type TaskStatus = 'pending' | 'in_progress' | 'completed'

export type PlannedTask = {
  title: string
  tier: string
  after: number[]
  /** The reporter's estimate, in minutes. */
  estimateMin?: number
  /** A task list's own status (source `plan`); a `tool` flow reads its runs instead. */
  status?: TaskStatus
  startedAt?: number
  doneAt?: number
}

export type Flow = {
  title: string
  total: number
  done: number
  running: number
  phase: Phase
  isFinished: boolean
  tasks: PlannedTask[]
  /** When a finished flow leaves the band, in ms since the epoch. */
  hideAt?: number
  /** Who reports it: the progress tool (default), or the session's task list followed by the mod. */
  source?: 'tool' | 'plan'
  startedAt?: number
}

export type AgentStatus = 'running' | 'done' | 'failed'

export type AgentRun = {
  id: string
  agentId?: string
  type: string
  description: string
  model: string
  effort?: string
  status: AgentStatus
  startedAt: number
  endedAt?: number
  contextTokens: number
  contextMax: number
  tokens: number
  costUsd: number
  steps: number
  round: number
  /** Self-reported by the worker through the `step` tool. */
  stepDone?: number
  stepTotal?: number
  stepNote?: string
}

export type Panel = {
  isCompact: boolean
  isDoneCollapsed: boolean
  autoOpenedFor: string
  /** The band lists every open task, not just the first few. */
  isTasksExpanded?: boolean
  /** The band is folded to one line for the flow that started at this time (its `startedAt`). */
  collapsedFor?: number
}

declare module 'claude-code' {
  interface PluginState {
    'jimal-progress': {
      flow: Flow | null
      agents: AgentRun[]
      panel: Panel
      now: number
    }
  }
}
