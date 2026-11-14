import type { NeedsUser, RunView, StepView, TaskView } from '../types'
import { LOG_MAX, REASON_MAX, S } from './strings'

type Json = Record<string, unknown>

const isObj = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v)

// Text that reaches the panel must hold no control character: the surface refuses the whole
// tree for one (an ANSI escape in an upstream log line would stop the pane from drawing at all).
// Escape sequences go first, then every other C0/C1 control but tab and newline.
// Written with \u escapes so this file holds no control character itself.
/* eslint-disable no-control-regex */
const OSC = /\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)?/g
const CSI = /\u001b\[[0-9;?]*[ -/]*[@-~]/g
const ESC_OTHER = /\u001b[ -/]*[0-~]?/g
const CONTROLS = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g
/* eslint-enable no-control-regex */
export const clean = (s: string): string =>
  s.replace(OSC, '').replace(CSI, '').replace(ESC_OTHER, '').replace(CONTROLS, '')

const str = (v: unknown): string => (typeof v === 'string' ? clean(v) : '')
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])

export const clip = (s: string, max: number): string => {
  const one = clean(s).replace(/\s+/g, ' ').trim()
  return one.length > max ? one.slice(0, Math.max(1, max - 1)) + '…' : one
}

/** The wall-clock part (HH:MM) of an ISO time, as written (local offset kept, nothing converted). */
export const hhmm = (iso: string): string => /T(\d\d:\d\d)/.exec(iso)?.[1] ?? ''

export const elapsed = (ms: number): string => {
  const s = Math.max(0, Math.floor(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export const parseTime = (iso: string): number => {
  const t = Date.parse(iso)
  return Number.isNaN(t) ? 0 : t
}

export type Envelope = {
  ok: boolean
  exitCode: number
  data: Json
  errorCode: string
  errorMessage: string
}

const envelopeOf = (text: string): Envelope | undefined => {
  try {
    const v: unknown = JSON.parse(text)
    if (!isObj(v) || typeof v.ok !== 'boolean') return undefined
    const err = isObj(v.error) ? v.error : {}
    return {
      ok: v.ok,
      exitCode: typeof v.exit_code === 'number' ? v.exit_code : v.ok ? 0 : 1,
      data: isObj(v.data) ? v.data : {},
      errorCode: str(err.code),
      errorMessage: str(err.message),
    }
  } catch {
    return undefined
  }
}

/** One JSON envelope out of stdout (the whole text, else the last line that parses), or undefined. */
export const parseEnvelope = (stdout: string): Envelope | undefined => {
  const whole = envelopeOf(stdout.trim().replace(/^\uFEFF/, ''))
  if (whole) return whole
  const lines = stdout.split(/\r?\n/)
  for (let i = lines.length - 1; i >= 0; i--) {
    const l = (lines[i] ?? '').trim()
    if (l.startsWith('{')) {
      const e = envelopeOf(l)
      if (e) return e
    }
  }
  return undefined
}

/** The lines of the error block for a failed envelope. */
export const explain = (env: Envelope): string[] => {
  const lines: string[] = []
  const hint = S.exitHints[env.exitCode]
  if (hint) lines.push(hint)
  lines.push(env.errorMessage || `exit ${env.exitCode}${env.errorCode ? ` (${env.errorCode})` : ''}`)
  return lines
}

const needsOf = (v: unknown): NeedsUser[] =>
  arr(v)
    .filter(isObj)
    .map(n => ({ game: str(n.game), code: str(n.code), message: str(n.message) }))
    .filter(n => n.message)

const taskOf = (t: Json): TaskView => ({
  id: str(t.id),
  name: str(t.name) || str(t.id),
  status: str(t.status),
  reason: str(t.reason),
  verified: t.verified !== false,
})

/** A run document (status.json, or the data of `result`) as the panel keeps it. Every string is cleaned. */
export const toRunView = (doc: unknown): RunView | null => {
  if (!isObj(doc) || !str(doc.run_id)) return null
  const steps: StepView[] = arr(doc.steps)
    .filter(isObj)
    .map(s => ({
      game: str(s.game),
      state: str(s.state),
      outcome: str(s.outcome),
      endedAt: str(s.ended_at),
      tasks: arr(s.tasks).filter(isObj).map(taskOf),
      needsUser: needsOf(s.needs_user),
    }))
  let needsUser = needsOf(doc.needs_user)
  if (needsUser.length === 0) {
    const seen = new Set<string>()
    for (const n of steps.flatMap(s => s.needsUser)) {
      const k = `${n.game}/${n.code}/${n.message}`
      if (!seen.has(k)) {
        seen.add(k)
        needsUser.push(n)
      }
    }
  }
  needsUser = needsUser.slice(0, 20)
  return {
    runId: str(doc.run_id),
    state: str(doc.state),
    outcome: str(doc.outcome),
    isDryRun: doc.dry_run === true,
    isPaused: doc.paused === true,
    games: arr(doc.games).map(str).filter(Boolean),
    currentGame: str(doc.current_game),
    startedAt: str(doc.started_at),
    endedAt: str(doc.ended_at),
    message: str(doc.message),
    steps,
    needsUser,
  }
}

export type Line = {
  kind: 'done' | 'likely' | 'skipped' | 'failed' | 'interrupted' | 'notrun'
  text: string
  /** The reason, on its own row below (skipped and failed). */
  reason?: string
}

/** The result lines of one finished game, in the grouping the panel shows. */
export const groupStep = (step: StepView): Line[] => {
  const lines: Line[] = []
  const done = step.tasks.filter(t => t.status === 'done' && t.verified).length
  if (done > 0) lines.push({ kind: 'done', text: S.doneCount(done) })
  let notRun = 0
  for (const t of step.tasks) {
    if (t.status === 'done' && !t.verified) lines.push({ kind: 'likely', text: `${S.likelyDone}　${t.name}` })
    else if (t.status === 'skipped')
      lines.push({ kind: 'skipped', text: `${S.skipped}　${t.name}`, reason: clip(t.reason, REASON_MAX) })
    else if (t.status === 'failed')
      lines.push({ kind: 'failed', text: `${S.failed}　${t.name}`, reason: clip(t.reason, REASON_MAX) })
    else if (t.status === 'not_run') {
      if (t.reason.startsWith('stopped by user')) lines.push({ kind: 'interrupted', text: `${S.interrupted}　${t.name}` })
      else if (t.reason.startsWith('disabled in')) continue
      else notRun++
    }
  }
  if (notRun > 0) lines.push({ kind: 'notrun', text: S.notExecuted(notRun) })
  return lines
}

// Only lines with an explicit level of INFO or above are shown. DEBUG lines quote what the
// screen reader (OCR) saw, which can hold an account id; a line with no level is not trusted.
// HSR:  2026-11-14 22:56:02,311 | INFO | text
const LOG_HSR = /^\d{4}-\d\d-\d\d (\d\d:\d\d:\d\d)[,.]\d+ *\| *(?:INFO|WARNING|ERROR|CRITICAL) *\| *(.*)$/
// ZZZ:  [22:53:01.164] [application_launcher.py 52] [INFO]: text
const LOG_ZZZ = /^\[(\d\d:\d\d:\d\d)(?:\.\d+)?\] \[[^\]]*\] \[(?:INFO|WARNING|ERROR|CRITICAL)\]: *(.*)$/
// The runner's own marker lines.
const LOG_RUNNER = /^\[zzz_run\] .+$/

/** The last whitelisted line of a log as "HH:MM:SS text" (runner markers as they are); '' when none. */
export const lastMeaningfulLine = (text: string, max = LOG_MAX): string => {
  const lines = text.split(/\r?\n/)
  for (let i = lines.length - 1; i >= 0 && i >= lines.length - 3000; i--) {
    const s = clean(lines[i] ?? '').trim()
    if (!s) continue
    const m = LOG_HSR.exec(s) ?? LOG_ZZZ.exec(s)
    const shown = m ? `${m[1]} ${(m[2] ?? '').trim()}` : LOG_RUNNER.test(s) ? s : ''
    if (!shown.trim() || (m && !(m[2] ?? '').trim())) continue
    return clip(shown, max)
  }
  return ''
}

export const logLineOf = (data: Json): string => lastMeaningfulLine(arr(data.lines).map(str).join('\n'))

/** A folder with a drive letter and an absolute path; no relative, UNC or `..` forms. */
export const isValidRepo = (p: string): boolean =>
  /^[A-Za-z]:\\/.test(p) && !/[\u0000-\u001f]/.test(p) && !p.split(/[\\/]+/).includes('..')

export const RUN_ID = /^[0-9]{8}-[0-9]{6}-[0-9a-f]{4}$/
