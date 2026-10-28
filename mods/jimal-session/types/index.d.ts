export type RateWindow = {
  kind: string
  percentUsed: number
  resetsAt?: string
}

export type HandoffStatus = 'idle' | 'writing' | 'saved' | 'unapplied' | 'failed'

export type Handoff = {
  status: HandoffStatus
  /** The note this session saved and has not used yet. */
  path?: string
  /** The cache deadline the note was written for: one note per deadline. */
  forExpiresAt?: number
  /** The note already replaced the old context (compaction), or was tried. */
  isApplied?: boolean
}

declare module 'claude-code' {
  interface PluginState {
    'jimal-session': {
      /** When the main thread's prompt cache lapses, in ms since the epoch; null before the first answer. */
      expiresAt: number | null
      isBusy: boolean
      /** The per-second tick that redraws the countdown. */
      now: number
      keepWarm: boolean
      autoHandoff: boolean
      rateLimits: RateWindow[]
      handoff: Handoff
    }
  }
}
