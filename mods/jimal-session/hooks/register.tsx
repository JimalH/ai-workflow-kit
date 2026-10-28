import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, SessionMessage } from 'claude-code'

import type { Handoff, RateWindow } from '../types'

const expiresAt = atom({ plugin: 'jimal-session', key: 'expiresAt' } as const, null as number | null)
const isBusy = atom({ plugin: 'jimal-session', key: 'isBusy' } as const, false)
const now = atom({ plugin: 'jimal-session', key: 'now' } as const, 0)
const keepWarm = atom({ plugin: 'jimal-session', key: 'keepWarm' } as const, false)
const autoHandoff = atom({ plugin: 'jimal-session', key: 'autoHandoff' } as const, false)
const rateLimits = atom({ plugin: 'jimal-session', key: 'rateLimits' } as const, [] as RateWindow[])
const handoff = atom({ plugin: 'jimal-session', key: 'handoff' } as const, { status: 'idle' } as Handoff)

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
const KEEP_WARM_PROMPT = 'Keep-alive ping to refresh the prompt cache. Reply with "ok" only.'

const GREEN = '#4caf6e'
const AMBER = '#e2a94e'
const RED = '#e0846b'
const GREY = '#8a8f8c'
// Each switch's slot, in cells: its dot, a gap, the label and a little air.
const KEEP_WARM_W = 'Keep warm'.length + 4
const AUTO_HANDOFF_W = 'Auto-handoff'.length + 4

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
  const path = `${await notesDir($)}/${stamp(await $.clock.now())}-${(await $.session.id()).slice(0, 8)}.md`
  await $.fs.write(path, r.text.trim() + '\n')
  // A note this session wrote before is superseded.
  const prev = (await read($, handoff)).path
  if (prev && prev !== path) await deleteFile($, prev)
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

const tick = async ($: EngineInterface): Promise<void> => {
  const at = await $.clock.now()
  await update($, now, () => at)
  const deadline = await read($, expiresAt)
  if (deadline === null || (await read($, isBusy)) || isWarming) return
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

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    const { rateLimits: limits } = await $.session.usage().catch(() => ({ rateLimits: [] as RateWindow[] }))
    await keepLimits($, limits)
    await pruneNotes($).catch(() => undefined)
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
    const ho = await read($, handoff)

    // This session's note stands in for the old context once applied (writeHandoff): the
    // first prompt after it uses it up. One that was not applied is kept for a new
    // conversation in this project, and this session goes on with its own context.
    if (ho.path) {
      if (ho.isApplied) await deleteFile($, ho.path)
      await update($, handoff, () => ({ status: 'idle' }))
      return next(e)
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
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const drawn = await Promise.resolve(next(e)).catch(() => null)
    const below = drawn && typeof drawn === 'object' && (drawn as { type?: string }).type !== 'engine' ? drawn : null

    const { Box, Text, Button } = $.ui.resolve(e)
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
    const color = cacheColor(left, isWorking)

    // A switch: a dot, green while on and grey while off, and its name as a plain (frameless)
    // button, dim while off (the dot sits outside: a coloured mark inside a button is not
    // drawn). A hidden switch takes no room, so the figures get it; Auto-handoff sits at the
    // right end and never moves.
    const toggle = (key: string, label: string, width: number, isOn: boolean, isShown: boolean, onPress: () => unknown) =>
      isShown ? (
        <Box key={`${key}-slot`} minWidth={width} flexShrink={0} flexDirection="row" alignItems="center" justifyContent="flex-end">
          <Text color={isOn ? GREEN : GREY}>●</Text>
          <Button key={key} label={label} plain dimColor={!isOn} onPress={onPress} />
        </Box>
      ) : null

    const note =
      ho.status === 'writing' ? 'writing note…' : ho.status === 'saved' ? 'note saved' : ho.status === 'unapplied' ? 'note not applied' : ho.status === 'failed' ? 'note failed' : ''

    const cache = cacheText(left, isWorking)
    const sessionText = `${timeLeft(session, at, false)} ${percentLeft(session)}`
    const weekText = `${timeLeft(week, at, true)} ${percentLeft(week)}`

    // The switches keep the right end, and the room the shown ones leave goes to the figures;
    // when it is short, the figures give way one at a time: the note, then the week, then the 5-hour window, then the
    // cache line shrinks to its minutes (in cells: dot, texts, bars and gaps, padding).
    const switchesW = (isAuto ? 0 : KEEP_WARM_W) + (isWarm ? 0 : AUTO_HANDOFF_W) + (isAuto || isWarm ? 0 : 2)
    const room = e.props.bodyColumns - (switchesW + 4)
    const width = (parts: string[]) => parts.reduce((w, p) => w + p.length + 3, 0)
    const cacheShort = cache.replace(/^cache (warm )?/, '') || cache
    const plan = [
      { note: true, week: true, session: true, cache },
      { note: false, week: true, session: true, cache },
      { note: false, week: false, session: true, cache },
      { note: false, week: false, session: false, cache },
      { note: false, week: false, session: false, cache: cacheShort },
    ]
    const shown =
      plan.find(p =>
        width([`● ${p.cache}`, ...(p.session && session ? [sessionText] : []), ...(p.week && week ? [weekText] : []), ...(p.note && note && !isWarm ? [note] : [])]) <= room,
      ) ?? plan[plan.length - 1]!
    const shownNote = shown.note && note && !isWarm ? note : ''
    // A window with no reading yet is left out, rather than shown as dashes.
    const showSession = shown.session && session !== undefined
    const showWeek = shown.week && week !== undefined

    // One line of plain figures between bars: `● cache warm 24m | 1h 95% · 13h 18%`; past
    // the estimate, the line is cut at its end rather than move the switches.
    const figures = (
      <Box key="figures" flexDirection="row" alignItems="center" columnGap={2} flexShrink={1} minWidth={0} overflow="hidden">
        <Box flexDirection="row" columnGap={1} flexShrink={0}>
          <Text color={color}>●</Text>
          <Text color={color}>{shown.cache}</Text>
        </Box>
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
        {shownNote ? <Text dimColor>|</Text> : null}
        {shownNote ? <Text dimColor wrap="truncate-end">{shownNote}</Text> : null}
      </Box>
    )
    // The two switches exclude each other: while one is on, the other is hidden.
    const switches = (
      <Box key="switches" flexDirection="row" alignItems="center" columnGap={2} flexShrink={0}>
        {toggle('keep-warm', 'Keep warm', KEEP_WARM_W, isWarm, !isAuto, () => update($, keepWarm, v => !v))}
        {toggle('auto-handoff', 'Auto-handoff', AUTO_HANDOFF_W, isAuto, !isWarm, () => update($, autoHandoff, v => !v))}
      </Box>
    )

    // One row always: the figures from the left, the switches at the right end.
    return (
      <Box flexDirection="column">
        <Box flexDirection="row" flexWrap="nowrap" alignItems="center" columnGap={2} overflow="hidden" paddingX={1}>
          {figures}
          <Box flexGrow={1} flexShrink={1} />
          {switches}
        </Box>
        {below}
      </Box>
    )
  })
}
