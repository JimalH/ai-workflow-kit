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
const KEEP_WARM_PROMPT = 'Keep-alive ping to refresh the prompt cache. Reply with "ok" only.'

const GREEN = '#4caf6e'
const AMBER = '#e2a94e'
const RED = '#e0846b'
const GREY = '#8a8f8c'
// A switch that is on: its frame and label, and a light tint inside the frame.
const ON = '#2e9d8f'
const ON_TINT = '#2e9d8f1f'
// Each switch's slot, in cells: the label, the frame's two sides and a cell of air each side.
const KEEP_WARM_W = 'Keep warm'.length + 4
const AUTO_HANDOFF_W = 'Auto-handoff'.length + 4

const pad = (n: number) => String(n).padStart(2, '0')

// ---------------------------------------------------------------------------
// Cache countdown

const cacheColor = (left: number | null, isWorking: boolean): string =>
  isWorking || left === null ? GREEN : left <= 0 ? GREY : left <= ALERT_MS ? RED : left <= WARN_MS ? AMBER : GREEN

const cacheText = (left: number | null, isWorking: boolean): string => {
  if (isWorking) return '…'
  if (left === null) return '—'
  if (left <= 0) return 'expired'
  // Nothing to watch yet: the hourglass alone says the cache is warm.
  if (left > SHOW_MS) return ''
  // Whole minutes only: seconds ticking beside the prompt distract.
  return `${Math.ceil(left / (60 * 1000))}m`
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
  const body = skill.replace(/^---[\s\S]*?---\s*/, '').trim()
  return body || 'Write a concise handover note (goal, current state, decisions, next steps, open questions) so a fresh conversation can continue this work. Output only the note.'
}

const noteMessage = (note: string) =>
  `[Handover note from an earlier conversation, written by the jimal-session mod. The earlier messages are no longer in context; continue from this note.]\n\n${note}`

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

const writeHandoff = async ($: EngineInterface, deadline: number): Promise<void> => {
  await update($, handoff, prev => ({ ...prev, status: 'writing', forExpiresAt: deadline }))
  const r = await $.model.fork({ prompt: await handoffPrompt($) })
  if (!r.isAnswered || !r.text.trim()) {
    await update($, handoff, prev => ({ ...prev, status: 'failed' }))
    return
  }
  const path = `${await notesDir($)}/${stamp(await $.clock.now())}-${(await $.session.id()).slice(0, 8)}.md`
  await $.fs.write(path, r.text.trim() + '\n')
  // A note this session wrote before is superseded.
  const prev = (await read($, handoff)).path
  if (prev && prev !== path) await deleteFile($, prev)
  await update($, handoff, () => ({ status: 'saved', path, forExpiresAt: deadline }))

  // The note replaces the old context at once, still in the cache's last minute, as a
  // compaction this mod answers itself: no model request, the old messages stay on
  // screen. The file stays until the next prompt, so a new conversation can still start from it.
  const compacted = await $.session.compact({ instructions: `${COMPACT_MARK}\n${r.text.trim()}` }).catch(() => null)
  if (compacted && 'messages' in compacted && compacted.messages) {
    await update($, handoff, prev => ({ ...prev, isApplied: true }))
    $.ui.toast('Old context replaced by the handover note.')
  }
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

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    const { rateLimits: limits } = await $.session.usage().catch(() => ({ rateLimits: [] as RateWindow[] }))
    await update($, rateLimits, () => limits.map(w => ({ kind: w.kind, percentUsed: w.percentUsed, resetsAt: w.resetsAt })))
    await pruneNotes($).catch(() => undefined)
    $.clock.every(1000, () => void tick($).catch(() => undefined))
    return started
  })

  on('session.measure', async ($, e, next) => {
    await update($, rateLimits, () => e.rateLimits.map(w => ({ kind: w.kind, percentUsed: w.percentUsed, resetsAt: w.resetsAt })))
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
    if (e.agentId !== undefined || e.instructions?.startsWith(COMPACT_MARK) !== true) return next(e)
    const note = e.instructions.slice(COMPACT_MARK.length).trim()
    const messages: SessionMessage[] = [
      { role: 'user', text: noteMessage(note), toolUses: [] },
      { role: 'assistant', text: 'Understood. I will continue from this handover note.', toolUses: [] },
    ]
    return { messages }
  }).catch(($, e, next) =>
    // Never let a failed answer fall through to a model compaction of the cold transcript.
    e.instructions?.startsWith(COMPACT_MARK) ? { skip: 'jimal-session: the handover note could not be applied' } : next(e),
  )

  on('prompt.submit', async ($, e, next) => {
    if (e.command || e.isMeta) return next(e)
    const ho = await read($, handoff)

    // This session's note already stands in for the old context (writeHandoff): the
    // first prompt after it uses it up.
    if (ho.path) {
      await deleteFile($, ho.path)
      await update($, handoff, () => ({ status: 'idle' }))
      return next(e)
    }

    // A fresh conversation in this project starts from the newest note left for it.
    if ((await $.session.turns()) === 0) {
      const [newest] = await listNotes($)
      const note = newest ? await readNote($, newest.path) : null
      if (newest && note) {
        await deleteFile($, newest.path)
        $.ui.toast('Handover note loaded into this prompt.')
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
    const isWide = e.props.bodyColumns >= 90
    const color = cacheColor(left, isWorking)

    // A switch: on the desktop a framed button, grey frame and dim label while off,
    // coloured frame, tint and label while on; in the terminal, where a frame costs
    // two rows, a ○/● mark and a dim or full label. Each sits in a slot of its own
    // fixed width, kept empty while the switch is hidden, so neither moves.
    const toggle = (key: string, label: string, width: number, isOn: boolean, isShown: boolean, onPress: () => unknown) =>
      !isShown ? (
        <Box key={`${key}-slot`} width={width} flexShrink={0} />
      ) : e.surface === 'terminal' ? (
        <Box key={`${key}-slot`} width={width} flexShrink={0}>
          <Button key={key} label={isOn ? `● ${label}` : `○ ${label}`} plain dimColor={!isOn} onPress={onPress} />
        </Box>
      ) : (
        <Box
          key={`${key}-frame`}
          width={width}
          flexShrink={0}
          justifyContent="center"
          borderStyle="round"
          borderColor={isOn ? ON : GREY}
          backgroundColor={isOn ? ON_TINT : undefined}
          paddingX={0}
          paddingY={0}
        >
          <Button key={key} label={label} plain dimColor={!isOn} onPress={onPress}>
            <Text color={isOn ? ON : undefined} bold={isOn}>{label}</Text>
          </Button>
        </Box>
      )

    const note =
      ho.status === 'writing' ? 'writing note…' : ho.status === 'saved' ? 'note saved' : ho.status === 'failed' ? 'note failed' : ''

    return (
      <Box flexDirection="column">
        <Box flexDirection="row" alignItems="center" columnGap={2} flexWrap="nowrap" overflow="hidden" paddingX={1}>
          <Box flexDirection="row" columnGap={1} flexShrink={0}>
            <Text color={color}>⧗</Text>
            {isWide ? <Text dimColor>Cache</Text> : null}
            {cacheText(left, isWorking) ? <Text bold color={color}>{cacheText(left, isWorking)}</Text> : null}
          </Box>
          {/* Session, then week: `1h 95% · 1d 18%`. */}
          <Box flexDirection="row" columnGap={1} flexShrink={0}>
            <Text bold>{timeLeft(session, at, false)}</Text>
            <Text color={usageColor(session)}>{percentLeft(session)}</Text>
            <Text dimColor>·</Text>
            <Text bold>{timeLeft(week, at, true)}</Text>
            <Text color={usageColor(week)}>{percentLeft(week)}</Text>
          </Box>
          {note && !isWarm ? <Text dimColor wrap="truncate-end">{note}</Text> : null}
          <Box flexGrow={1} flexShrink={1} />
          {/* The two switches exclude each other: while one is on, the other is hidden. */}
          {toggle('keep-warm', 'Keep warm', KEEP_WARM_W, isWarm, !isAuto, () => update($, keepWarm, v => !v))}
          {toggle('auto-handoff', 'Auto-handoff', AUTO_HANDOFF_W, isAuto, !isWarm, () => update($, autoHandoff, v => !v))}
        </Box>
        {below}
      </Box>
    )
  })
}
