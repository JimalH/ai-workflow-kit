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

export type PromptSwitches = {
  /** An English prompt is proofread and the corrections shown. */
  fixEnglish: boolean
  /** The corrections ride beside the prompt, and the reply opens with them (under Fix English). */
  inReply: boolean
  /** The corrections open in a `Prompt check` pane, coloured (under Fix English). */
  inPane: boolean
  /** The prompt is restructured by a small model before it goes to the main one. */
  shapePrompt: boolean
}

/** One run of a word diff: text kept, removed from the original, or added by the correction. */
export type Segment = { kind: 'same' | 'del' | 'ins'; text: string }

export type Check = {
  /** The corrected prompt with its changes, in order. */
  segments: Segment[]
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
      /** The band asks once whether to turn Claude Code's idle compaction off. */
      idleAsk: boolean
      promptSwitches: PromptSwitches
      /** What a prompt feature is doing right now, counted in seconds; '' when idle. */
      promptStatus: string
      /** The last corrections Fix English found; null before any. */
      check: Check | null
      /** The Details boxes are unfolded under the band's row. */
      isDetailsOpen: boolean
      /** How far the list of switches that are on has scrolled, in cells. */
      scrollAt: number
    }
  }
}
