import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, SessionMessage } from 'claude-code'

import type { Check, Handoff, PromptSwitches, RateWindow, Segment } from '../types'

const expiresAt = atom({ plugin: 'jimal-session', key: 'expiresAt' } as const, null as number | null)
const isBusy = atom({ plugin: 'jimal-session', key: 'isBusy' } as const, false)
const now = atom({ plugin: 'jimal-session', key: 'now' } as const, 0)
const keepWarm = atom({ plugin: 'jimal-session', key: 'keepWarm' } as const, false)
const autoHandoff = atom({ plugin: 'jimal-session', key: 'autoHandoff' } as const, false)
const rateLimits = atom({ plugin: 'jimal-session', key: 'rateLimits' } as const, [] as RateWindow[])
const handoff = atom({ plugin: 'jimal-session', key: 'handoff' } as const, { status: 'idle' } as Handoff)
// The band asks once whether to turn Claude Code's idle compaction off (see decideIdle).
const idleAsk = atom({ plugin: 'jimal-session', key: 'idleAsk' } as const, false)
// The prompt switches (Fix English, its two sub-options, Shape prompt), kept in the store.
const promptSwitches = atom({ plugin: 'jimal-session', key: 'promptSwitches' } as const, { fixEnglish: false, inReply: true, inPane: true, shapePrompt: false } as PromptSwitches)
// What a prompt feature is doing right now, counted in seconds; '' when idle.
const promptStatus = atom({ plugin: 'jimal-session', key: 'promptStatus' } as const, '')
// Fix English's check of the draft as typed (and the prompt as sent); null before any.
const check = atom({ plugin: 'jimal-session', key: 'check' } as const, null as Check | null)
// When Keep warm turns itself off, in ms since the epoch; null while off.
const keepWarmUntil = atom({ plugin: 'jimal-session', key: 'keepWarmUntil' } as const, null as number | null)
// The Details boxes are unfolded under the band's row.
const isDetailsOpen = atom({ plugin: 'jimal-session', key: 'isDetailsOpen' } as const, false)

// Claude Code writes the main thread's prompt cache with a 1-hour lifetime on a subscription.
const CACHE_TTL_MS = 60 * 60 * 1000
// Keep warm refreshes, and auto-handoff writes its note, this long before the cache lapses:
// a refresh 59 minutes after the last request.
const LAST_MINUTE_MS = 60 * 1000
// The countdown shows only in the cache's last half hour.
const SHOW_MS = 30 * 60 * 1000
const WARN_MS = 20 * 60 * 1000
const ALERT_MS = 10 * 60 * 1000
// Handover notes are deleted once used, or after this long.
const NOTE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000
// The instructions a compaction carries when this mod asks for it, so its own hook answers it.
const COMPACT_MARK = 'jimal-session: handover note'
// /handoff-now applies its note this long after the command ends.
const APPLY_DELAY_MS = 1000
// `Handoff all` leaves a request file (its text: the time); every session on this machine,
// this one too, answers one newer than its start within this long, once its turn is over.
const REQUEST_FILE = 'handoff-all.request'
const REQUEST_MAX_AGE_MS = 10 * 60 * 1000
const REQUEST_POLL_MS = 5000
const KEEP_WARM_PROMPT = 'Keep-alive ping to refresh the prompt cache. Reply with "ok" only.'
// Keep warm runs this long at most, then turns itself off; a ping that finds the cache cold
// (fewer cached tokens read than this) turns it off too: each ping would pay for the whole context.
const KEEP_WARM_MAX_MS = 3 * 60 * 60 * 1000
const KEEP_WARM_MIN_CACHED = 1000

const GREEN = '#4caf6e'
const AMBER = '#e2a94e'
const RED = '#e0846b'
const GREY = '#8a8f8c'
// A plain button's slot, in cells: its label and a little air.
const HANDOFF_ALL_W = 'Handoff all'.length + 2
const DETAILS_W = 'Details ▾'.length + 2
// The middle of the row (what runs now, or the switches on), in cells.
const MIDDLE_W = 36
const MIN_MIDDLE_W = 8
// A Details box, in cells, border included.
const BOX_W = 30

const pad = (n: number) => String(n).padStart(2, '0')

// ---------------------------------------------------------------------------
// Cache countdown

const cacheColor = (left: number | null, isWorking: boolean): string =>
  isWorking ? GREEN : left === null || left <= 0 ? GREY : left <= ALERT_MS ? RED : left <= WARN_MS ? AMBER : GREEN

// `cache cold` before the first answer, `cache warm`, `cache warm 24m` in its last half hour, `cache expired`; a turn keeps it warm.
const cacheText = (left: number | null, isWorking: boolean): string => {
  if (isWorking) return 'cache warm'
  // No answer yet in this conversation: nothing is cached.
  if (left === null) return 'cache cold'
  if (left <= 0) return 'cache expired'
  // Nothing to watch yet: the minutes show only in the last half hour.
  if (left > SHOW_MS) return 'cache warm'
  // Whole minutes only: seconds ticking beside the prompt distract.
  return `cache warm ${Math.ceil(left / (60 * 1000))}m`
}

// ---------------------------------------------------------------------------
// Usage windows: `five_hour` shown in hours left (`3h`), `seven_day` in days left
// (`4d`), or in hours once less than a day is left.

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS

const windowOf = (list: RateWindow[], kind: string) => list.find(w => w.kind === kind)

const timeLeft = (w: RateWindow | undefined, at: number, inDays: boolean): string => {
  const reset = w?.resetsAt ? Date.parse(w.resetsAt) : NaN
  if (!Number.isFinite(reset)) return '—'
  const ms = Math.max(0, reset - at)
  return inDays && ms >= DAY_MS ? `${Math.ceil(ms / DAY_MS)}d` : `${Math.ceil(ms / HOUR_MS)}h`
}

const percentLeft = (w: RateWindow | undefined): string =>
  w ? `${Math.max(0, Math.round(100 - w.percentUsed))}%` : '—%'

const usageColor = (w: RateWindow | undefined): string | undefined =>
  !w ? undefined : w.percentUsed >= 90 ? RED : w.percentUsed >= 75 ? AMBER : undefined

// ---------------------------------------------------------------------------
// Handover notes: ~/.claude/handoffs/<project-key>/<YYYYMMDD-HHMMSS>-<session>.md

const homeDir = async ($: EngineInterface): Promise<string> =>
  ((await $.env.get('USERPROFILE')) || (await $.env.get('HOME')) || '').replace(/[\\/]+$/, '')

const isWindows = (home: string) => /^[A-Za-z]:[\\/]/.test(home)

// The project's root path with every character that is not a letter or digit
// replaced by '-', as ~/.claude/projects names its folders: E:\AI workflow → E--AI-workflow.
const projectKey = async ($: EngineInterface): Promise<string> => {
  const root = await $.session.root().catch(() => $.session.cwd())
  return root.replace(/[^A-Za-z0-9]/g, '-')
}

const notesDir = async ($: EngineInterface): Promise<string> =>
  `${await homeDir($)}/.claude/handoffs/${await projectKey($)}`

const stamp = (at: number): string => {
  const d = new Date(at)
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
}

// The plugin API reads and writes files but cannot delete one: the host's own command does.
const deleteFile = async ($: EngineInterface, path: string): Promise<void> => {
  const home = await homeDir($)
  const argv = isWindows(home) ? ['cmd', '/c', 'del', '/f', '/q', path.replace(/\//g, '\\')] : ['rm', '-f', path]
  await $.process.run(argv, { timeoutMs: 10_000 }).catch(() => undefined)
}

const requestPath = async ($: EngineInterface): Promise<string> => `${await homeDir($)}/.claude/handoffs/${REQUEST_FILE}`

// Claude Code's own idle compaction fires at 90% of the cache's life (about 54 minutes after
// the last turn), before this mod's last minute, and on return its summary replaces whatever
// is there, the handover note included. Its documented switch is this key in settings.json.
const settingsPath = async ($: EngineInterface): Promise<string> => `${await homeDir($)}/.claude/settings.json`

const turnOffIdleCompaction = async ($: EngineInterface): Promise<string | null> => {
  const path = await settingsPath($)
  const text = await $.fs.read(path).catch(() => '')
  let json: unknown
  try {
    json = text.trim() ? JSON.parse(text) : {}
  } catch {
    return `${path} is not valid JSON`
  }
  if (typeof json !== 'object' || json === null || Array.isArray(json)) return `${path} is not a JSON object`
  await $.fs.write(path, JSON.stringify({ ...(json as Record<string, unknown>), idleCompaction: false }, null, 2) + '\n')
  return null
}

type Note = { path: string; mtimeMs: number }

const listNotes = async ($: EngineInterface): Promise<Note[]> => {
  const dir = await notesDir($)
  const entries = await $.fs.list(dir).catch(() => [])
  return entries
    .filter(f => f.kind === 'file' && f.name.endsWith('.md'))
    .map(f => ({ path: `${dir}/${f.name}`, mtimeMs: f.mtimeMs }))
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
}

const pruneNotes = async ($: EngineInterface): Promise<void> => {
  const at = await $.clock.now()
  for (const n of await listNotes($)) {
    if (at - n.mtimeMs > NOTE_MAX_AGE_MS) await deleteFile($, n.path)
  }
}

const readNote = async ($: EngineInterface, path: string): Promise<string | null> => {
  const text = await $.fs.read(path).catch(() => null)
  return text && text.trim() ? text.trim() : null
}

// The handoff skill's body (without its frontmatter) is the note's prompt.
const handoffPrompt = async ($: EngineInterface): Promise<string> => {
  const skill = await $.fs.read(`${$.plugin.root}/skills/handoff/SKILL.md`).catch(() => '')
  const body = skill
    .replace(/^---[\s\S]*?---\s*/, '')
    // The skill's own saving step is for a run by hand: the fork has no tools, and this mod saves the note.
    .replace(/\n+When invoked by hand[\s\S]*$/, '')
    .trim()
  return body || 'Write a concise handover note (goal, current state, decisions, next steps, open questions) so a fresh conversation can continue this work. Output only the note.'
}

// The note is written in the user's language; what this mod says around it follows the note,
// so a handed-over conversation does not drift back to English.
const isChinese = (text: string) => /[一-鿿]/.test(text)
const say = (note: string, en: string, zh: string) => (isChinese(note) ? zh : en)

const noteMessage = (note: string) =>
  say(
    note,
    '[Handover note from an earlier conversation, written by the jimal-session mod. The earlier messages are no longer in context; continue from this note, and reply in the language it is written in.]',
    '[这是之前对话的交接笔记，由 jimal-session 写入。之前的消息已不在上下文中，请从这份笔记继续，并用中文回复。]',
  ) + `\n\n${note}`

const noteAck = (note: string) => say(note, 'Understood. I will continue from this handover note.', '好的，我会按这份交接笔记继续。')

const appliedToast = (note: string, applied: { isApplied: true } | { isApplied: false; reason: string }) =>
  applied.isApplied
    ? say(note, 'Old context replaced by the handover note.', '旧的上下文已换成交接笔记。')
    : say(note, `Handover note saved, but not applied: ${applied.reason}`, `交接笔记已保存，但没有生效：${applied.reason}`)

// ---------------------------------------------------------------------------
// The last minute: keep warm refreshes the cache, else auto-handoff writes a note.

let isWarming = false


const warm = async ($: EngineInterface): Promise<void> => {
  isWarming = true
  try {
    const r = await $.model.fork({ prompt: KEEP_WARM_PROMPT })
    if (r.isAnswered) {
      const at = await $.clock.now()
      await update($, expiresAt, () => at + CACHE_TTL_MS)
      if (r.usage.cache_read_input_tokens < KEEP_WARM_MIN_CACHED) {
        await update($, keepWarm, () => false)
        await update($, keepWarmUntil, () => null)
        $.ui.toast('Keep warm off: the cache was already cold, so the ping paid for the whole context.')
      }
    } else if (r.reason !== 'nothing-to-fork') {
      $.ui.toast(`Keep warm failed: ${r.reason}`)
    }
  } finally {
    isWarming = false
  }
}

// Writes a handover note with a forked request and saves it; the reason when it fails.
const writeNote = async ($: EngineInterface, deadline: number): Promise<{ path: string; text: string } | { reason: string }> => {
  await update($, handoff, prev => ({ ...prev, status: 'writing', forExpiresAt: deadline }))
  const r = await $.model.fork({ prompt: await handoffPrompt($) })
  if (!r.isAnswered || !r.text.trim()) {
    await update($, handoff, prev => ({ ...prev, status: 'failed' }))
    return {
      reason: r.isAnswered
        ? 'the note came back empty'
        : r.reason === 'nothing-to-fork'
          ? 'nothing to write it from yet (a resumed conversation needs one message first)'
          : `the note could not be written (${r.reason})`,
    }
  }
  const sid = (await $.session.id()).slice(0, 8)
  const path = `${await notesDir($)}/${stamp(await $.clock.now())}-${sid}.md`
  await $.fs.write(path, r.text.trim() + '\n')
  // A note this session wrote before is superseded: every file carrying this session's id,
  // not only the one remembered here, since a plugin reload forgets it.
  for (const n of await listNotes($)) {
    if (n.path !== path && n.path.endsWith(`-${sid}.md`)) await deleteFile($, n.path)
  }
  await update($, handoff, () => ({ status: 'saved', path, forExpiresAt: deadline }))
  return { path, text: r.text.trim() }
}

// The note replaces the old context, as a compaction this mod answers itself: no model
// request, the old messages stay on screen. A refusal is said, never swallowed: the note
// then stays unapplied (kept for a new conversation) and the band says so.
// A headless or SDK session (the desktop app is one) refuses $.session.compact: there a
// compaction runs as the /compact command, which this mod's session.compact hook answers.
const isSdkRefusal = (reason: string) => /headless|SDK/.test(reason)

// The /compact command shows its arguments in the chat, so it carries this short mark alone
// and the note waits here for the session.compact hook: the handoff stays quiet.
const COMPACT_ARG = 'jimal-session handoff'
let pendingNote: string | null = null

const applyNote = async ($: EngineInterface, text: string): Promise<{ isApplied: true } | { isApplied: false; reason: string }> => {
  const instructions = `${COMPACT_MARK}\n${text}`
  let reason = ''
  try {
    const compacted = await $.session.compact({ instructions })
    if ('messages' in compacted && compacted.messages) {
      await update($, handoff, prev => ({ ...prev, isApplied: true }))
      return { isApplied: true }
    }
    reason = 'skip' in compacted && compacted.skip ? compacted.skip : 'the compaction returned nothing'
  } catch (err) {
    reason = String((err as Error)?.message ?? err)
  }
  if (isSdkRefusal(reason)) {
    pendingNote = text
    try {
      const ran = await $.command.run({ command: 'compact', args: COMPACT_ARG })
      // The hook below marks the note applied when it answers this compaction.
      if ((await read($, handoff)).isApplied) return { isApplied: true }
      reason = `${reason}; /compact ran but did not reach this mod's answer${ran.text ? `: ${ran.text}` : ''}`
    } catch (err) {
      reason = `${reason}; /compact failed: ${String((err as Error)?.message ?? err)}`
    } finally {
      pendingNote = null
    }
  }
  await update($, handoff, prev => ({ ...prev, status: 'unapplied' }))
  $.ui.log(`jimal-session: the handover note was not applied: ${reason}`, { to: 'debug' })
  return { isApplied: false, reason }
}

// In the cache's last minute: write the note, then let it replace the old context at once.
// The file stays until the next prompt, so a new conversation can still start from it.
const writeHandoff = async ($: EngineInterface, deadline: number): Promise<void> => {
  const note = await writeNote($, deadline)
  if ('reason' in note) {
    $.ui.toast(`Auto-handoff: ${note.reason}.`)
    return
  }
  const applied = await applyNote($, note.text)
  $.ui.toast(appliedToast(note.text, applied))
}

// `Handoff all`: one press, and every open session writes its own note.
let startedAt = 0
let handledRequestAt = 0
let requestCheckedAt = 0

const requestHandoffAll = async ($: EngineInterface): Promise<void> => {
  const at = await $.clock.now()
  await $.fs.write(await requestPath($), `${at}\n`)
  $.ui.toast('Handoff requested: every open session writes its note once its turn is over.')
}

// A request newer than this session's start, not yet answered and not stale: write the note
// and let it replace the context, as the auto-handoff does. A note applied and not yet used
// by a prompt is still current, so such a session does not write another.
const answerRequest = async ($: EngineInterface, at: number): Promise<void> => {
  if (at - requestCheckedAt < REQUEST_POLL_MS) return
  requestCheckedAt = at
  const askedAt = Number((await $.fs.read(await requestPath($)).catch(() => '')).trim())
  if (!Number.isFinite(askedAt) || askedAt <= handledRequestAt || askedAt < startedAt || at - askedAt > REQUEST_MAX_AGE_MS) return
  handledRequestAt = askedAt
  const ho = await read($, handoff)
  if (ho.status === 'writing' || (ho.path && ho.isApplied)) return
  await writeHandoff($, (await read($, expiresAt)) ?? at)
}

const tick = async ($: EngineInterface): Promise<void> => {
  const at = await $.clock.now()
  await update($, now, () => at)
  const until = await read($, keepWarmUntil)
  if (until !== null && at >= until) {
    await update($, keepWarm, () => false)
    await update($, keepWarmUntil, () => null)
    $.ui.toast(`Keep warm off: its ${Math.round(KEEP_WARM_MAX_MS / HOUR_MS)} hours are up.`)
  }
  const deadline = await read($, expiresAt)
  if (deadline === null || (await read($, isBusy)) || isWarming) return
  await answerRequest($, at)
  const left = deadline - at
  if (left <= 0 || left > LAST_MINUTE_MS) return

  if (await read($, keepWarm)) {
    await warm($)
    return
  }
  const ho = await read($, handoff)
  if ((await read($, autoHandoff)) && ho.forExpiresAt !== deadline) await writeHandoff($, deadline)
}

// ---------------------------------------------------------------------------
// Usage windows: an empty reading (before the first answer, a reload, or a measure of
// something else) never wipes the last one; with none yet, the band shows no usage.

const keepLimits = async ($: EngineInterface, limits: readonly RateWindow[]): Promise<void> => {
  if (limits.length === 0) return
  await update($, rateLimits, () => limits.map(w => ({ kind: w.kind, percentUsed: w.percentUsed, resetsAt: w.resetsAt })))
}

// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Prompt features (from jimal-prompt).
//
// Fix English: an English prompt is proofread by a small model while the submission waits
// (a second or two, counted in the band); what changed is marked word by word and shown in
// the reply's first lines (`In reply`: the marks ride beside the prompt as context, for a
// remote screen that shows the transcript alone) and in a coloured `Prompt check` pane
// (`In pane`), each on its own switch under Fix English.
//
// Shape prompt: the prompt is restructured by the small model (goal, context, constraints,
// deliverable, done when) while the submission waits, and the structured version goes to
// the main model as the prompt, the original wording beside it as context. A shaped prompt
// is not proofread again: the shaping corrects it.
// ---------------------------------------------------------------------------

const PROMPT_STORE_KEY = 'prompt'
const DETAILS_STORE_KEY = 'details'
const PANE = 'jimal-session-check'
const SMALL_MODEL = 'haiku'
// An English prompt shorter than this is sent as it is: a word or two has nothing to fix.
const MIN_WORDS = 4
// A prompt shorter than this (characters) is not worth shaping.
const MIN_SHAPE_CHARS = 6
// A draft is checked this long after the last keystroke.
const CHECK_DEBOUNCE_MS = 900
// A prompt ending in this is shaped even with Shape prompt off; the mark is dropped.
const SHAPE_MARK = /\s*\+\+\s*$/

// English: Latin letters, no CJK script, and at least MIN_WORDS words.
const isEnglish = (text: string) =>
  !/[぀-ヿ㐀-鿿가-힯]/.test(text) && /[A-Za-z]/.test(text) && text.trim().split(/\s+/).length >= MIN_WORDS

const FIX_SYSTEM = [
  'You are a copy editor. Correct the spelling, grammar and punctuation of the text you are given.',
  'Keep its meaning, wording, tone, line breaks, code, file paths, quoted strings and formatting.',
  'Change nothing that is already correct. Do not answer it, expand it or comment on it.',
  'Reply with the corrected text only.',
].join(' ')

const SHAPE_SYSTEM = [
  'You restructure a prompt written for an AI coding assistant so it is clear, ordered and complete.',
  'Keep every requirement, fact, file name, piece of code and constraint the writer gave; add nothing they did not say; do not answer the prompt.',
  'Correct spelling and grammar as you go.',
  'If the text is not a task (a greeting, an aside, "wait", "let me look", a yes or no, a question for the assistant), reply with the text exactly as given, unchanged; never explain, apologise or ask for more.',
  'Write in the language of the original; for a Chinese prompt use the headings 目标 / 背景 / 约束 / 产出 / 完成标准.',
  'Reply with the restructured prompt only, no preamble, in this shape, leaving out a section with nothing in it:',
  '',
  'Goal: one sentence.',
  'Context: what is known (files, state, what was tried).',
  'Constraints: must / must not.',
  'Deliverable: what to produce and in what form.',
  'Done when: how the result is checked.',
].join('\n')

// Word diff: the corrected text as runs kept, removed and added, so the pane can colour them
// and the transcript can mark them. Tokens are words and the whitespace between.
const tokens = (text: string): string[] => text.split(/(\s+)/).filter(t => t !== '')

export const diffWords = (before: string, after: string): Segment[] => {
  const a = tokens(before)
  const b = tokens(after)
  const n = a.length
  const m = b.length
  // LCS table, bottom-up.
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i]![j] = a[i] === b[j] ? dp[i + 1]![j + 1]! + 1 : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!)
    }
  }
  const out: Segment[] = []
  const push = (kind: Segment['kind'], text: string) => {
    if (!text) return
    const last = out[out.length - 1]
    if (last && last.kind === kind) last.text += text
    else out.push({ kind, text })
  }
  let del: string[] = []
  let ins: string[] = []
  const flush = () => {
    const d = del.join('')
    const s = ins.join('')
    if (d.trim() || s.trim()) {
      // The whitespace a change began or ended with keeps the corrected text's spacing.
      const around = s || d
      push('same', around.match(/^\s+/)?.[0] ?? '')
      push('del', d.trim())
      if (d.trim() && s.trim()) push('same', ' ')
      push('ins', s.trim())
      push('same', around.match(/\s+$/)?.[0] ?? '')
    }
    del = []
    ins = []
  }
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      if (/^\s+$/.test(a[i]!) && (del.length || ins.length)) {
        // Whitespace between two changed words stays inside the change.
        del.push(a[i]!)
        ins.push(b[j]!)
      } else {
        flush()
        push('same', a[i]!)
      }
      i++
      j++
    } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) {
      del.push(a[i]!)
      i++
    } else {
      ins.push(b[j]!)
      j++
    }
  }
  while (i < n) del.push(a[i++]!)
  while (j < m) ins.push(b[j++]!)
  flush()
  return out
}

// The segments as Markdown: removed words struck through, added ones bold.
export const markChanges = (segments: Segment[]): string =>
  segments
    .map(s => (s.kind === 'del' ? `~~${s.text}~~` : s.kind === 'ins' ? `**${s.text}**` : s.text))
    .join('')
    .trim()

const sameWords = (x: string, y: string) => x.replace(/\s+/g, ' ').trim() === y.replace(/\s+/g, ' ').trim()

type Completion = Awaited<ReturnType<EngineInterface['model']['complete']>>

const reasonOf = (r: Completion): string =>
  r.isAnswered ? 'empty reply' : r.reason === 'api-error' ? `API error${r.status ? ` ${r.status}` : ''} (${r.error})` : r.reason

// A small-model call, counted in the band while it runs so a slow one is seen to be alive.
const counted = async <T,>($: EngineInterface, label: string, work: () => Promise<T>): Promise<T> => {
  const from = await $.clock.now()
  await update($, promptStatus, () => `${label} 0s`)
  const tick = $.clock.every(1000, () => {
    void $.clock.now().then(at => update($, promptStatus, () => `${label} ${Math.round((at - from) / 1000)}s`))
  })
  try {
    return await work()
  } finally {
    tick.cancel()
    await update($, promptStatus, () => '')
  }
}

// The corrections as segments, or null when the text was already right or the call failed.
const proofread = async ($: EngineInterface, text: string): Promise<Segment[] | null> =>
  counted($, '◷ Fix English · checking…', async () => {
    const r = await $.model.complete({ model: SMALL_MODEL, system: FIX_SYSTEM, prompt: text, maxTokens: 2048, effort: 'low' })
    if (!r.isAnswered || !r.text.trim()) {
      $.ui.toast(`Fix English: ${reasonOf(r)}; the prompt went as typed.`)
      return null
    }
    const fixed = r.text.trim()
    return sameWords(fixed, text) ? null : diffWords(text.trim(), fixed)
  })

// A shaped prompt opens with one of the headings asked for.
const isShaped = (text: string) => /^\s*(\*\*|#+\s*)?(Goal|目标)?/u.test(text) || /^\s*(\*\*|#+\s*)?目标/u.test(text)

// The restructured prompt, or null when the call failed or the text was no task.
const shapeText = async ($: EngineInterface, text: string): Promise<string | null> =>
  counted($, isChinese(text) ? '◷ Shape prompt · 整理中…' : '◷ Shape prompt · shaping…', async () => {
    const r = await $.model.complete({ model: SMALL_MODEL, system: SHAPE_SYSTEM, prompt: text, maxTokens: 2048 })
    if (r.isAnswered && r.text.trim()) {
      const shaped = r.text.trim()
      // Not shaped (the text given back, or an explanation instead): the prompt goes as typed.
      return sameWords(shaped, text) || !isShaped(shaped) ? null : shaped
    }
    $.ui.toast(isChinese(text) ? `整理失败：${reasonOf(r)}，已按原文发出。` : `Shape prompt: ${reasonOf(r)}; the prompt went as typed.`)
    return null
  })

// The draft is checked while it is typed, CHECK_DEBOUNCE_MS after the last keystroke, and
// the corrections drawn under the band's row before Enter; a check of the text as sent is
// then used at the submission, so Enter does not wait.
let checkTimer: { cancel: () => void } | null = null
let checkSeq = 0

const draftOf = (text: string) => text.replace(SHAPE_MARK, '').trim()

const scheduleCheck = async ($: EngineInterface, text: string): Promise<void> => {
  checkTimer?.cancel()
  checkTimer = null
  const sw = await read($, promptSwitches)
  const draft = draftOf(text)
  if (!sw.fixEnglish || !isEnglish(draft) || draft.startsWith('/')) {
    checkSeq += 1
    await update($, check, prev => (prev && prev.status !== 'submitted' ? null : prev))
    return
  }
  const mine = ++checkSeq
  checkTimer = $.clock.after(CHECK_DEBOUNCE_MS, () => {
    void (async () => {
      await update($, check, () => ({ segments: [], text: draft, status: 'checking' }))
      const segments = await proofread($, draft).catch(() => null)
      if (mine !== checkSeq) return
      await update($, check, () => ({ segments: segments ?? [], text: draft, status: 'ready' }))
    })().catch(() => undefined)
  })
}

const fixContext = (marked: string) =>
  [
    '[jimal-session] The prompt above was written in English and has been proofread; the corrected version follows, with each change marked (~~removed~~ **added**).',
    'Open your reply with the heading `**Prompt check**`, then the corrected version exactly as given below, then a line holding only `---`, and only then answer the prompt. Do not comment on the corrections.',
    '',
    marked,
  ].join('\n')

const shapeContext = (original: string) =>
  ['[jimal-session] The prompt above was restructured by a small model from what the person typed, which follows; where the two differ, what they typed is what they meant.', '', original].join('\n')

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    const { rateLimits: limits } = await $.session.usage().catch(() => ({ rateLimits: [] as RateWindow[] }))
    await keepLimits($, limits)
    await pruneNotes($).catch(() => undefined)
    startedAt = await $.clock.now()
    // The prompt switches and the Details fold come back from the store.
    const keptPrompt = (await $.store.get(PROMPT_STORE_KEY).catch(() => undefined)) as Partial<PromptSwitches> | undefined
    if (keptPrompt && typeof keptPrompt === 'object') {
      await update($, promptSwitches, () => ({
        fixEnglish: keptPrompt.fixEnglish === true,
        inReply: keptPrompt.inReply !== false,
        inPane: keptPrompt.inPane !== false,
        shapePrompt: keptPrompt.shapePrompt === true,
      }))
    }
    const keptDetails = await $.store.get(DETAILS_STORE_KEY).catch(() => undefined)
    await update($, isDetailsOpen, () => keptDetails === true)
    await $.command.register({ name: 'prompt-check', description: 'Open the Prompt check pane with the last corrections Fix English found' }).catch(() => undefined)
    // Asked once per machine: the answer is kept in the plugin store; a setting already off needs no question.
    const settings = (await $.settings.read().catch(() => ({}))) as Record<string, unknown>
    const choice = await $.store.get('idleCompaction').catch(() => undefined)
    await update($, idleAsk, () => settings.idleCompaction !== false && choice === undefined)
    await $.command.register({
      name: 'handoff-now',
      description: 'Write a handover note now and let it replace this conversation\'s context (old messages stay on screen); says whether it worked',
    }).catch(() => undefined)
    $.clock.every(1000, () => void tick($).catch(() => undefined))
    return started
  })

  // The auto-handoff on demand: the way to try it without waiting out the cache, and to
  // hand a long conversation over by hand. The host refuses a compaction under the command
  // that asks for it, so the note is applied from a timer once the command has ended, as
  // the auto-handoff applies it, and a toast says whether it worked.
  on('command.run', { command: 'handoff-now' }, async $ => {
    const at = await $.clock.now()
    const note = await writeNote($, (await read($, expiresAt)) ?? at)
    if ('reason' in note) return { text: `Handover note not written: ${note.reason}.` }
    $.clock.after(APPLY_DELAY_MS, () => {
      void applyNote($, note.text)
        .then(applied => $.ui.toast(appliedToast(note.text, applied)))
        .catch(() => undefined)
    })
    return {
      text: say(
        note.text,
        `Handover note saved to ${note.path}; it replaces the old context once this command ends (a toast says whether it did).`,
        `交接笔记已保存到 ${note.path}；命令结束后会替换旧的上下文（是否成功会有提示）。`,
      ),
    }
  })

  on('session.measure', async ($, e, next) => {
    await keepLimits($, e.rateLimits)
    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    if (e.agentId === undefined) await update($, isBusy, () => true)
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId === undefined) {
      const at = await $.clock.now()
      await update($, expiresAt, () => at + CACHE_TTL_MS)
      await update($, isBusy, () => false)
    }
    return result
  })

  // The compaction this mod asks for: the saved note stands in for the summary,
  // so no model request reads the cold transcript.
  on('session.compact', async ($, e, next) => {
    if (e.agentId !== undefined) return next(e)
    const isOurs = e.instructions?.startsWith(COMPACT_MARK) === true || (e.instructions?.trim() === COMPACT_ARG && pendingNote !== null)
    if (!isOurs) return next(e)
    const note = e.instructions?.trim() === COMPACT_ARG ? (pendingNote ?? '') : (e.instructions ?? '').slice(COMPACT_MARK.length).trim()
    if (!note) return { skip: 'jimal-session: the handover note was not there to apply' }
    await update($, handoff, prev => ({ ...prev, isApplied: true }))
    const messages: SessionMessage[] = [
      { role: 'user', text: noteMessage(note), toolUses: [] },
      { role: 'assistant', text: noteAck(note), toolUses: [] },
    ]
    return { messages }
  }).catch(($, e, next) =>
    // Never let a failed answer fall through to a model compaction of the cold transcript.
    e.instructions?.startsWith(COMPACT_MARK) || e.instructions?.trim() === COMPACT_ARG ? { skip: 'jimal-session: the handover note could not be applied' } : next(e),
  )

  on('prompt.submit', async ($, e, next) => {
    if (e.command || e.isMeta) return next(e)
    // Fix English and Shape prompt on the prompt as typed (see the helpers above); a note
    // loaded for a fresh conversation goes as it is.
    const withPrompt = async (p: typeof e) => {
      const e = p
      if (e.command || e.isMeta || e.origin?.kind === 'plugin') return next(e)
      const sw = await read($, promptSwitches)
      const text = e.text

      // Shaped (the switch on, or the prompt ending in `++`): the structured version is the
      // prompt, the original rides beside it.
      const isMarked = SHAPE_MARK.test(text)
      const body = isMarked ? text.replace(SHAPE_MARK, '') : text
      if ((sw.shapePrompt || isMarked) && body.trim().length >= MIN_SHAPE_CHARS) {
        const shaped = await shapeText($, body).catch(() => null)
        if (shaped) return next({ ...e, text: shaped, context: [...(e.context ?? []), shapeContext(body)] })
        return next({ ...e, text: body })
      }

      if (sw.fixEnglish && isEnglish(text) && (sw.inReply || sw.inPane)) {
        // The draft's check stands for the text as sent; another is run only when it differs.
        checkTimer?.cancel()
        checkTimer = null
        checkSeq += 1
        const live = await read($, check)
        const segments = live && live.text === draftOf(text) && live.status !== 'checking' ? live.segments : ((await proofread($, text.trim()).catch(() => null)) ?? [])
        await update($, check, () => ({ segments, text: draftOf(text), status: 'submitted' }))
        if (segments.length > 0) {
          if (sw.inPane) await $.ui.open({ id: PANE, title: 'Prompt check' }).catch(() => undefined)
          if (sw.inReply) return next({ ...e, context: [...(e.context ?? []), fixContext(markChanges(segments))] })
        }
      }
      return next(e)
    }
    const ho = await read($, handoff)

    // This session's note stands in for the old context once applied (writeHandoff): the
    // first prompt after it uses it up. One that was not applied is kept for a new
    // conversation in this project, and this session goes on with its own context.
    if (ho.path) {
      if (ho.isApplied) await deleteFile($, ho.path)
      await update($, handoff, () => ({ status: 'idle' }))
      return withPrompt(e)
    }

    // A fresh conversation in this project starts from the newest note left for it.
    if ((await $.session.turns()) === 0) {
      const [newest] = await listNotes($)
      const note = newest ? await readNote($, newest.path) : null
      if (newest && note) {
        await deleteFile($, newest.path)
        $.ui.toast(say(note, 'Handover note loaded into this prompt.', '交接笔记已载入这条消息。'))
        return next({ ...e, text: `${noteMessage(note)}\n\n---\n\n${e.text}` })
      }
    }
    return withPrompt(e)
  })

  // Fix English, while the draft is typed: a keystroke, a paste, a history recall or a fill.
  on('prompt.edit', async ($, e, next) => {
    const r = await next(e)
    // A bare cursor move changes nothing; a digit in an empty box presses a band hotkey.
    if (r.text !== e.text && !(e.text === '' && /^[0-9]$/.test(r.text))) await scheduleCheck($, r.text)
    return r
  })
  on('prompt.change', async ($, e, next) => {
    await scheduleCheck($, e.text)
    return next(e)
  })

  on('command.run', { command: 'prompt-check' }, async $ => {
    const opened = await $.ui.open({ id: PANE, title: 'Prompt check' })
    return { text: opened.isPlaced ? 'Prompt check pane opened.' : 'No surface here draws a pane.' }
  })


  // The last corrections, coloured: removed words red and struck through, added ones green.
  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const last = await read($, check)
    return (
      <Box flexDirection="column" paddingX={1}>
        {last === null ? (
          <Text dimColor>No corrections yet: turn Fix English on and send an English prompt.</Text>
        ) : (
          <Text wrap="wrap">
            {last.segments.map((s, i) =>
              s.kind === 'del' ? (
                <Text key={`s${i}`} color={RED} strikethrough>
                  {s.text}
                </Text>
              ) : s.kind === 'ins' ? (
                <Text key={`s${i}`} color={GREEN} bold>
                  {s.text}
                </Text>
              ) : (
                <Text key={`s${i}`}>{s.text}</Text>
              ),
            )}
          </Text>
        )}
      </Box>
    )
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const drawn = await Promise.resolve(next(e)).catch(() => null)
    const below = drawn && typeof drawn === 'object' && (drawn as { type?: string }).type !== 'engine' ? drawn : null

    const ui = $.ui.resolve(e)
    const { Box, Text, Button, Client } = ui
    const at = Math.max(await read($, now), await $.clock.now())
    const deadline = await read($, expiresAt)
    const left = deadline === null ? null : deadline - at
    const isWorking = e.props.isWorking || (await read($, isBusy))
    const limits = await read($, rateLimits)
    const session = windowOf(limits, 'five_hour')
    const week = windowOf(limits, 'seven_day')
    const isWarm = await read($, keepWarm)
    const isAuto = await read($, autoHandoff)
    const ho = await read($, handoff)
    const sw = await read($, promptSwitches)
    const isOpen = await read($, isDetailsOpen)
    const color = cacheColor(left, isWorking)

    const note =
      ho.status === 'writing' ? 'writing note…' : ho.status === 'saved' ? (ho.isApplied ? 'note applied' : 'note saved') : ho.status === 'unapplied' ? 'note not applied' : ho.status === 'failed' ? 'note failed' : ''
    // The middle of the row: what a feature is doing now, else the switches that are on,
    // scrolled by the tick when they do not fit.
    const working = (await read($, promptStatus)) || (note ? `◷ Handoff · ${note}` : '')
    const onList = [
      ...(isWarm ? ['Keep warm'] : []),
      ...(isAuto ? ['Auto-handoff'] : []),
      ...(sw.fixEnglish ? ['Fix English', ...(sw.inReply ? ['In reply'] : []), ...(sw.inPane ? ['In pane'] : [])] : []),
      ...(sw.shapePrompt ? ['Shape prompt'] : []),
    ]
    const listText = onList.map(n => `● ${n}`).join('  ')

    const cache = cacheText(left, isWorking)
    const sessionText = `${timeLeft(session, at, false)} ${percentLeft(session)}`
    const weekText = `${timeLeft(week, at, true)} ${percentLeft(week)}`

    // The buttons keep the right end; when the row is short, the figures give way one at a
    // time: the middle, then the week, then the 5-hour window, then the cache line shrinks to
    // its minutes (in cells: dot, texts, bars and gaps, padding).
    const buttonsW = HANDOFF_ALL_W + 2 + DETAILS_W
    const room = e.props.bodyColumns - (buttonsW + 4)
    const width = (parts: string[]) => parts.reduce((w, p) => w + p.length + 3, 0)
    const cacheShort = cache.replace(/^cache (warm )?/, '') || cache
    const middleText = working || listText
    // The middle takes what the figures leave, up to MIDDLE_W; under MIN_MIDDLE_W it is dropped.
    const middleWFor = (keepSession: boolean, keepWeek: boolean) =>
      Math.max(0, Math.min(MIDDLE_W, middleText.length, room - width([`● ${cache}`, ...(keepSession && session ? [sessionText] : []), ...(keepWeek && week ? [weekText] : [])]) - 3))
    const plan = [
      { middle: true, week: true, session: true, cache },
      { middle: true, week: false, session: true, cache },
      { middle: true, week: false, session: false, cache },
      { middle: false, week: false, session: false, cache },
      { middle: false, week: false, session: false, cache: cacheShort },
    ]
    const shown =
      plan.find(p =>
        width([`● ${p.cache}`, ...(p.session && session ? [sessionText] : []), ...(p.week && week ? [weekText] : []), ...(p.middle && middleText ? ['x'.repeat(Math.max(middleWFor(p.session, p.week), MIN_MIDDLE_W))] : [])]) <= room,
      ) ?? plan[plan.length - 1]!
    const middleW = middleWFor(shown.session, shown.week)
    const showMiddle = shown.middle && middleText !== '' && middleW >= MIN_MIDDLE_W
    // A window with no reading yet is left out, rather than shown as dashes.
    const showSession = shown.session && session !== undefined
    const showWeek = shown.week && week !== undefined

    // The middle is a surface module of its own (middle.tsx): it slides the list and sweeps a
    // light over the working line at its own pace, with no redraw of the band. One row, so
    // a narrow window never wraps it.
    const middleBox = showMiddle ? (
      <Box key="middle-slot" flexDirection="row" alignItems="center" flexGrow={1} flexShrink={1} minWidth={MIN_MIDDLE_W} height={1} overflow="hidden">
        <Client key="middle" module="./middle.tsx" props={{ list: listText, working, width: 0 }} width="100%" height={1} />
      </Box>
    ) : null

    // One line of plain figures between bars: `● cache warm 24m | 1h 95% · 13h 18% | ● Auto-handoff`;
    // past the estimate, the line is cut at its end rather than move the buttons.
    const figures = (
      <Box key="figures" flexDirection="row" alignItems="center" columnGap={2} flexGrow={1} flexShrink={1} minWidth={0} overflow="hidden">
        {/* The dot as the progress bar draws its own: a 4 px circle at x=5, the text from x=16;
            the terminal, with no Svg, keeps the glyph. */}
        {e.surface !== 'terminal' && 'Svg' in ui ? (
          <Box flexDirection="row" alignItems="center" flexShrink={0}>
            <ui.Svg source={`<svg xmlns="http://www.w3.org/2000/svg" width="16" height="14" viewBox="0 0 16 14"><circle cx="5" cy="7" r="4" fill="${color}"/></svg>`} alt="cache" width={16} height={14} />
            <Text color={color}>{shown.cache}</Text>
          </Box>
        ) : (
          <Box flexDirection="row" columnGap={1} flexShrink={0}>
            <Text color={color}>●</Text>
            <Text color={color}>{shown.cache}</Text>
          </Box>
        )}
        {showSession || showWeek ? <Text dimColor>|</Text> : null}
        {/* Session, then week: `1h 95% · 1d 18%`; a percent turns amber or red as it runs low. */}
        {showSession || showWeek ? (
          <Box flexDirection="row" columnGap={1} flexShrink={0}>
            {showSession ? <Text dimColor>{timeLeft(session, at, false)}</Text> : null}
            {showSession ? <Text color={usageColor(session)} dimColor={!usageColor(session)}>{percentLeft(session)}</Text> : null}
            {showSession && showWeek ? <Text dimColor>·</Text> : null}
            {showWeek ? <Text dimColor>{timeLeft(week, at, true)}</Text> : null}
            {showWeek ? <Text color={usageColor(week)} dimColor={!usageColor(week)}>{percentLeft(week)}</Text> : null}
          </Box>
        ) : null}
        {showMiddle ? <Text dimColor>|</Text> : null}
        {middleBox}
      </Box>
    )

    const setDetails = async (open: boolean) => {
      await update($, isDetailsOpen, () => open)
      await $.store.set(DETAILS_STORE_KEY, open).catch(() => undefined)
    }
    const buttons = (
      <Box key="buttons" flexDirection="row" alignItems="center" columnGap={2} flexShrink={0}>
        <Button key="handoff-all" label="Handoff all" plain hotkey="h" onPress={() => void requestHandoffAll($).catch(() => undefined)} />
        <Button key="details" label={`Details ${isOpen ? '▴' : '▾'}`} plain hotkey="d" onPress={() => void setDetails(!isOpen)} />
      </Box>
    )

    // Details: one bordered box a group, its switches a row each, one cell high as the band's
    // row: the name at the left, a dot and a plain `on` / `off` button at the right (the dot
    // green while on, since a button's label takes no colour). In reply and In pane hang
    // under Fix English and are dim and inert while it is off. The boxes stand in a row and
    // wrap when the row is short.
    const setPrompt = async (patch: Partial<PromptSwitches>) => {
      const value = await update($, promptSwitches, prev => ({ ...prev, ...patch }))
      await $.store.set(PROMPT_STORE_KEY, value).catch(() => undefined)
    }
    // The draft's check, under the row while Fix English is on: checking, no issues, or the
    // corrections inline (removed red and struck through, added green); dim once sent.
    const live = sw.fixEnglish ? await read($, check) : null
    const checkLine =
      live === null ? null : (
        <Box key="check" flexDirection="row" alignItems="flex-start" paddingX={1} columnGap={1}>
          <Text dimColor={live.status !== 'ready'}>Fix English:</Text>
          {live.status === 'checking' ? (
            <Text dimColor>checking…</Text>
          ) : live.segments.length === 0 ? (
            <Text color={GREEN} dimColor={live.status === 'submitted'}>no issues</Text>
          ) : (
            <Text wrap="wrap" dimColor={live.status === 'submitted'}>
              {live.segments.map((s, i) =>
                s.kind === 'del' ? (
                  <Text key={`c${i}`} color={RED} strikethrough>
                    {s.text}
                  </Text>
                ) : s.kind === 'ins' ? (
                  <Text key={`c${i}`} color={GREEN} bold>
                    {s.text}
                  </Text>
                ) : (
                  <Text key={`c${i}`}>{s.text}</Text>
                ),
              )}
            </Text>
          )}
        </Box>
      )

    const row = (key: string, label: string, isOn: boolean, onPress: () => unknown, opts: { isSub?: boolean; isInert?: boolean; hotkey?: string } = {}) => (
      <Box key={`${key}-row`} flexDirection="row" alignItems="center" justifyContent="space-between" columnGap={3} paddingLeft={opts.isSub ? 2 : 0} height={1}>
        <Text dimColor={!isOn || opts.isInert}>{label}</Text>
        <Box flexDirection="row" alignItems="center" columnGap={1} flexShrink={0}>
          <Text color={isOn && !opts.isInert ? GREEN : GREY}>●</Text>
          <Button key={key} label={isOn ? 'on' : 'off'} plain dimColor={!isOn || opts.isInert} {...(opts.hotkey && !opts.isInert ? { hotkey: opts.hotkey } : {})} onPress={() => (opts.isInert ? undefined : void onPress())} />
        </Box>
      </Box>
    )
    const box = (key: string, title: string, rows: unknown[]) => (
      <Box key={`${key}-box`} flexDirection="column" borderStyle="round" borderColor={GREY} borderDimColor paddingX={1} minWidth={BOX_W} flexShrink={0}>
        <Text bold>{title}</Text>
        {rows}
      </Box>
    )
    const details = isOpen ? (
      <Box key="details" flexDirection="row" flexWrap="wrap" alignItems="flex-start" columnGap={1} rowGap={0} paddingX={1}>
        {box('session', 'Session', [
          // Keep warm and Auto-handoff exclude each other: turning one on turns the other off.
          // Keep warm runs for KEEP_WARM_MAX_MS at most, then turns itself off (tick).
          row('keep-warm', 'Keep warm', isWarm, async () => {
            await update($, keepWarm, v => !v)
            await update($, keepWarmUntil, () => (isWarm ? null : at + KEEP_WARM_MAX_MS))
            if (!isWarm) await update($, autoHandoff, () => false)
          }, { hotkey: 'k' }),
          row('auto-handoff', 'Auto-handoff', isAuto, async () => {
            await update($, autoHandoff, v => !v)
            if (!isAuto) {
              await update($, keepWarm, () => false)
              await update($, keepWarmUntil, () => null)
            }
          }, { hotkey: 'a' }),
        ])}
        {box('prompt', 'Prompt', [
          row('fix-english', 'Fix English', sw.fixEnglish, () => setPrompt({ fixEnglish: !sw.fixEnglish }), { hotkey: 'f' }),
          row('in-reply', 'In reply', sw.inReply, () => setPrompt({ inReply: !sw.inReply }), { isSub: true, isInert: !sw.fixEnglish, hotkey: 'r' }),
          row('in-pane', 'In pane', sw.inPane, () => setPrompt({ inPane: !sw.inPane }), { isSub: true, isInert: !sw.fixEnglish, hotkey: 'p' }),
          row('shape-prompt', 'Shape prompt', sw.shapePrompt, () => setPrompt({ shapePrompt: !sw.shapePrompt }), { hotkey: 's' }),
        ])}
      </Box>
    ) : null

    // Asked once: Claude Code's idle compaction fires before the auto-handoff and overrides
    // its note on return. `Turn off` writes the setting; either answer is kept for good.
    const decideIdle = async (choice: 'keep' | 'off') => {
      await $.store.set('idleCompaction', choice).catch(() => undefined)
      await update($, idleAsk, () => false)
      if (choice !== 'off') return
      const fault = await turnOffIdleCompaction($).catch((err: unknown) => String(err))
      $.ui.toast(fault ? `idleCompaction not changed: ${fault}` : '"idleCompaction": false written to ~/.claude/settings.json (new sessions use it).')
    }
    const ask = (await read($, idleAsk)) ? (
      <Box key="idle-ask" flexDirection="row" flexWrap="nowrap" alignItems="center" columnGap={2} overflow="hidden" paddingX={1}>
        <Text color={AMBER} wrap="truncate-end">Claude Code's idle compaction (at 54m) overrides auto-handoff:</Text>
        <Button key="idle-keep" label="Keep on" plain onPress={() => void decideIdle('keep')} />
        <Button key="idle-off" label="Turn off" plain onPress={() => void decideIdle('off')} />
      </Box>
    ) : null

    // One row always: the figures from the left, the buttons at the right end; the Details
    // boxes under it while unfolded.
    return (
      <Box flexDirection="column">
        {ask}
        <Box flexDirection="row" flexWrap="nowrap" alignItems="center" columnGap={2} overflow="hidden" paddingRight={1}>
          {figures}
          {buttons}
        </Box>
        {checkLine}
        {details}
        {below}
      </Box>
    )
  })
}
