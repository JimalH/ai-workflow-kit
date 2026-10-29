import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

const START = Date.parse('2026-10-28T10:00:00Z')
const MIN = 60 * 1000
const BAND = { component: 'AbovePrompt', props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 120 } as never } as const

type World = {
  forks: string[]
  writes: Record<string, string>
  runs: string[][]
  compacts: string[]
  toasts: string[]
  store: Record<string, unknown>
}

// A session in E:\AI workflow on Windows, with the fork, files and commands recorded.
async function session(
  $: Engine,
  on: On,
  opts: { fork?: string; forkReason?: string; skill?: string; weekLeftMs?: number; noUsage?: boolean; settings?: Record<string, unknown>; store?: Record<string, unknown>; files?: Record<string, string> } = {},
) {
  const world: World = { forks: [], writes: { ...opts.files }, runs: [], compacts: [], toasts: [], store: { ...opts.store } }
  const clock = mock.clock(on, { now: START })
  mock.env(on, { USERPROFILE: 'C:\\Users\\me' })
  on('session.start', async () => ({ cwd: 'E:\\AI workflow' }) as never)
  on('session.root', () => ({ value: 'E:\\AI workflow' }) as never)
  on('session.cwd', () => ({ value: 'E:\\AI workflow' }) as never)
  on('session.id', () => ({ value: 'abcdef1234567890' }) as never)
  on('session.turns', () => ({ value: 3 }) as never)
  on('session.usage', () => ({ value: { startedAt: START, context: {}, rateLimits: opts.noUsage ? [] : [
    { kind: 'five_hour', percentUsed: 38, resetsAt: new Date(START + 3 * 60 * MIN - 1).toISOString() },
    { kind: 'seven_day', percentUsed: 20, resetsAt: new Date(START + (opts.weekLeftMs ?? 4 * 24 * 60 * MIN - 1)).toISOString() },
  ] } }) as never)
  on('model.fork', (_$, e) => {
    world.forks.push((e as { prompt: string }).prompt)
    if (opts.forkReason) return { value: { isAnswered: false, reason: opts.forkReason } } as never
    return { value: { isAnswered: true, text: opts.fork ?? 'ok', usage: null } } as never
  })
  on('fs.write', (_$, e) => {
    const { path, text } = e as { path: string; text: string }
    // The host may hand paths with either separator.
    world.writes[path.replace(/\\/g, '/')] = text
    return { value: undefined } as never
  })
  on('fs.read', (_$, e) => {
    const path = (e as { path: string }).path.replace(/\\/g, '/')
    if (opts.skill && path.endsWith('/skills/handoff/SKILL.md')) return { value: opts.skill } as never
    return (path in world.writes ? { value: world.writes[path] } : { value: '' }) as never
  })
  // The files written so far, as the directory's listing.
  on('fs.list', (_$, e) => {
    const dir = (e as { path: string }).path.replace(/\\/g, '/').replace(/\/$/, '')
    const entries = Object.keys(world.writes)
      .filter(p => p.startsWith(`${dir}/`) && !p.slice(dir.length + 1).includes('/'))
      .map(p => ({ kind: 'file', name: p.slice(dir.length + 1), mtimeMs: START }))
    return { value: entries } as never
  })
  on('settings.read', () => ({ value: opts.settings ?? {} }) as never)
  on('store.get', (_$, e) => ({ value: world.store[(e as { key: string }).key] }) as never)
  on('store.set', (_$, e) => {
    const { key, value } = e as { key: string; value: unknown }
    world.store[key] = value
    return { value: undefined } as never
  })
  on('process.run', (_$, e) => {
    const argv = (e as { argv: string[] }).argv
    world.runs.push(argv)
    const target = argv[argv.length - 1]?.replace(/\\/g, '/')
    if (target) delete world.writes[target]
    return { value: { exitCode: 0, stdout: '', stderr: '' } } as never
  })
  on('session.compact', (_$, e) => {
    world.compacts.push(String((e as { instructions?: string }).instructions))
    return { skip: 'test: no model compaction here' } as never
  })
  on('turn.complete', async () => ({ text: '' }) as never)
  on('session.measure', () => ({ changed: ['context'] }) as never)
  on('prompt.submit', (_$, e) => ({ text: (e as { text: string }).text }) as never)
  on('ui.toast', (_$, e) => {
    world.toasts.push(String((e as { text: string }).text))
    return { value: undefined } as never
  })
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return (<Text>below</Text>) as never
  })

  await $.session.start({ source: 'startup', cwd: 'E:\\AI workflow', surface: 'desktop', isInteractive: true } as never)
  return { clock, world }
}

const answer = ($: Engine) => ($.turn.complete as (e: unknown) => Promise<unknown>)({ reason: 'answer', answer: 'done' })

async function texts($: Engine): Promise<string[]> {
  const ui = await $.ui.mount({ plugin: 'jimal-session', surface: 'desktop', ...BAND })
  const found = await ui.findAll({ type: 'Text' })
  const buttons = await ui.findAll({ type: 'Button' })
  await ui.unmount()
  return [...found.map(t => t.text), ...buttons.map(b => String(b.props.label))]
}

// A switch's state as drawn on the desktop, by its dot; null when hidden.
async function frameOf($: Engine, key: string): Promise<unknown> {
  const ui = await $.ui.mount({ plugin: 'jimal-session', surface: 'desktop', ...BAND })
  const slot = await ui.find({ key: `${key}-slot` })
  await ui.unmount()
  // The dot leads the slot: green on, grey off; a hidden switch draws no slot.
  const dot = (slot?.children ?? []).find((c): c is { type: string; props: Record<string, unknown> } => typeof c === 'object' && c !== null && (c as { type?: string }).type === 'Text')
  return slot ? (dot?.props.color === '#4caf6e' ? 'on' : 'off') : null
}

async function slotWidth($: Engine, key: string): Promise<unknown> {
  const ui = await $.ui.mount({ plugin: 'jimal-session', surface: 'desktop', ...BAND })
  const found = await ui.find({ key: `${key}-slot` })
  await ui.unmount()
  return found?.props.minWidth
}

async function press($: Engine, key: string) {
  const ui = await $.ui.mount({ plugin: 'jimal-session', surface: 'desktop', ...BAND })
  await ui.press({ key })
  await ui.unmount()
}

test('band: cache countdown changes colour as it runs out', async ($, on) => {
  const { clock } = await session($, on)
  expect(await texts($)).toContain('cache cold')

  // More than half an hour left: warm, no minutes.
  await answer($)
  expect(await texts($)).toContain('cache warm')

  await clock.advance(30 * MIN)
  expect(await texts($)).toContain('cache warm 30m')

  await clock.advance(15 * MIN)
  expect(await texts($)).toContain('cache warm 15m')

  await clock.advance(16 * MIN)
  expect(await texts($)).toContain('cache expired')
})

test('band: session hours and week days left with the usage left', async ($, on) => {
  await session($, on)
  const shown = await texts($)
  expect(shown).toContain('3h')
  expect(shown).toContain('62%')
  expect(shown).toContain('4d')
  expect(shown).toContain('80%')
})

test('band: the week shows hours once less than a day is left', async ($, on) => {
  await session($, on, { weekLeftMs: 19 * 60 * MIN - 1 })
  expect(await texts($)).toContain('19h')
})

test('band: a switch has a grey dot while off and a green one while on, and hides the other', async ($, on) => {
  await session($, on)
  expect(await frameOf($, 'keep-warm')).toBe('off')
  expect(await frameOf($, 'auto-handoff')).toBe('off')

  await press($, 'keep-warm')
  expect(await frameOf($, 'keep-warm')).toBe('on')
  expect(await frameOf($, 'auto-handoff')).toBeNull()
  // The hidden switch takes no room.
  expect(await slotWidth($, 'auto-handoff')).toBeUndefined()

  await press($, 'keep-warm')
  await press($, 'auto-handoff')
  expect(await frameOf($, 'auto-handoff')).toBe('on')
  expect(await frameOf($, 'keep-warm')).toBeNull()
})

test('keep warm: refreshes the cache 59 minutes after the last answer', async ($, on) => {
  const { clock, world } = await session($, on)
  await answer($)
  const ui = await $.ui.mount({ plugin: 'jimal-session', surface: 'desktop', ...BAND })
  await ui.press({ key: 'keep-warm' })
  await ui.unmount()

  await clock.advance(58 * MIN)
  expect(world.forks).toHaveLength(0)
  await clock.advance(1 * MIN + 2000)
  expect(world.forks).toHaveLength(1)
  // Refreshed: a full hour again (no minutes shown above half an hour), and auto-handoff is hidden.
  const shown = await texts($)
  expect(shown).toContain('cache warm')
  expect(await frameOf($, 'keep-warm')).toBe('on')
  expect(await frameOf($, 'auto-handoff')).toBeNull()
})

test('auto-handoff: writes a note in the last minute; a compaction refused is said, and the note is kept', async ($, on) => {
  const { clock, world } = await session($, on, { fork: '## Goal\nShip the band.' })
  await answer($)
  const ui = await $.ui.mount({ plugin: 'jimal-session', surface: 'desktop', ...BAND })
  await ui.press({ key: 'auto-handoff' })
  await ui.unmount()

  await clock.advance(59 * MIN + 2000)
  const paths = Object.keys(world.writes)
  expect(paths).toHaveLength(1)
  expect(paths[0]).toMatch(/^C:\/Users\/me\/\.claude\/handoffs\/E--AI-workflow\/\d{8}-\d{6}-abcdef12\.md$/)
  expect(world.forks[0]).toContain('handover note')

  // The kit has no transcript for a compaction to read, so it refuses one: the band and a
  // toast say the note was not applied (the compaction's answer is tested below).
  expect(await texts($)).toContain('note not applied')
  expect(world.toasts.some(t => t.startsWith('Handover note saved, but not applied:'))).toBe(true)

  // Not applied, the note is not used up by the next prompt: kept for a new conversation.
  await clock.advance(2 * MIN)
  await $.prompt.submit({ text: 'What next?' } as never)
  expect(world.runs.some(argv => argv.includes('del'))).toBe(false)
  expect(Object.keys(world.writes)).toHaveLength(1)
})

test('handoff-now: writes the note on demand, then applies it once the command has ended', async ($, on) => {
  const { clock, world } = await session($, on, { fork: '## Goal\nShip the band.' })
  await answer($)
  const out = (await $.command.run({ command: 'handoff-now' } as never)) as { text: string }
  expect(Object.keys(world.writes)).toHaveLength(1)
  expect(out.text).toMatch(/^Handover note saved to .*; it replaces the old context once this command ends/)
  // Not under the command: the compaction is asked for after it.
  expect(world.toasts).toHaveLength(0)
  await clock.advance(2000)
  expect(world.toasts.some(t => t.startsWith('Handover note saved, but not applied:'))).toBe(true)
})

test('handoff-now: a resumed conversation with nothing to write from says so', async ($, on) => {
  await session($, on, { forkReason: 'nothing-to-fork' })
  const out = (await $.command.run({ command: 'handoff-now' } as never)) as { text: string }
  expect(out.text).toContain('needs one message first')
})

test('the note prompt leaves out the skill\'s saving step, which the fork cannot do', async ($, on) => {
  const { world } = await session($, on, { skill:
    '---\nname: handoff\n---\n\nWrite a handover note.\n\nRules:\n- Facts only.\n\nWhen invoked by hand (not by the jimal-session mod), also save the note with the Write tool.\n' })
  await answer($)
  await $.command.run({ command: 'handoff-now' } as never)
  expect(world.forks[0]).toContain('Facts only.')
  expect(world.forks[0]).not.toContain('Write tool')
})

test('compaction: the marked one is answered with the note, any other goes on', async ($, on) => {
  const { world } = await session($, on)
  const compact = $.session.compact as unknown as (e: unknown) => Promise<{ messages?: { role: string; text: string }[]; skip?: string }>

  const marked = await compact({ trigger: 'plugin', instructions: 'jimal-session: handover note\n## Goal\nShip it.', messages: [{ role: 'user', text: 'old', toolUses: [] }] })
  expect(marked.messages?.map(m => m.role)).toEqual(['user', 'assistant'])
  expect(marked.messages?.[0]?.text).toContain('## Goal\nShip it.')
  expect(world.compacts).toHaveLength(0)

  await compact({ trigger: 'manual', instructions: 'keep the API notes', messages: [{ role: 'user', text: 'old', toolUses: [] }] })
  expect(world.compacts).toEqual(['keep the API notes'])
})

test('band: a narrow window drops the figures one by one, the switches stay', async ($, on) => {
  await session($, on)
  const shownAt = async (bodyColumns: number) => {
    const ui = await $.ui.mount({ plugin: 'jimal-session', surface: 'desktop', component: 'AbovePrompt', props: { ...BAND.props, bodyColumns } as never })
    const texts = (await ui.findAll({ type: 'Text' })).map(t => t.text)
    const switches = await ui.find({ key: 'keep-warm' })
    await ui.unmount()
    return { texts, hasSwitches: switches !== undefined }
  }
  const wide = await shownAt(140)
  expect(wide.texts).toContain('3h')
  expect(wide.texts).toContain('4d')
  expect(wide.hasSwitches).toBe(true)

  const medium = await shownAt(75)
  expect(medium.texts).toContain('3h')
  expect(medium.texts).not.toContain('4d')
  expect(medium.hasSwitches).toBe(true)

  const narrow = await shownAt(55)
  expect(narrow.texts).not.toContain('3h')
  expect(narrow.hasSwitches).toBe(true)
})

test('band: the room a hidden switch frees goes to the figures', async ($, on) => {
  await session($, on)
  const texts = async () => {
    const ui = await $.ui.mount({ plugin: 'jimal-session', surface: 'desktop', component: 'AbovePrompt', props: { ...BAND.props, bodyColumns: 75 } as never })
    const found = (await ui.findAll({ type: 'Text' })).map(t => t.text)
    await ui.unmount()
    return found
  }
  expect(await texts()).not.toContain('4d')
  await press($, 'auto-handoff')
  expect(await texts()).toContain('4d')
})

test('usage: an empty reading keeps the last one', async ($, on) => {
  await session($, on)
  expect(await texts($)).toContain('62%')
  // A measure with no windows (a reload, the first answer not in yet) leaves them as they were.
  await ($.session.measure as unknown as (e: unknown) => Promise<unknown>)({ context: {}, rateLimits: [], changed: ['context'] })
  expect(await texts($)).toContain('62%')
})

test('usage: with no reading yet, the band shows a grey cold cache and no usage', async ($, on) => {
  await session($, on, { noUsage: true })
  const ui = await $.ui.mount({ plugin: 'jimal-session', surface: 'desktop', ...BAND })
  const found = await ui.findAll({ type: 'Text' })
  await ui.unmount()
  const texts = found.map(t => t.text)
  expect(texts).toContain('cache cold')
  expect(found.find(t => t.text === 'cache cold')?.props.color).toBe('#8a8f8c')
  expect(texts.some(t => t.includes('%') || t === '—')).toBe(false)
})

test('compaction: a note in Chinese is framed and acknowledged in Chinese', async ($, on) => {
  await session($, on)
  const compact = $.session.compact as unknown as (e: unknown) => Promise<{ messages?: { role: string; text: string }[] }>
  const marked = await compact({ trigger: 'plugin', instructions: 'jimal-session: handover note\n## Goal\n检查重复。', messages: [] })
  expect(marked.messages?.[0]?.text).toContain('请从这份笔记继续，并用中文回复')
  expect(marked.messages?.[1]?.text).toBe('好的，我会按这份交接笔记继续。')
})

test('compaction: a bare /compact with the short mark and no note waiting goes on to the engine', async ($, on) => {
  const { world } = await session($, on)
  const compact = $.session.compact as unknown as (e: unknown) => Promise<unknown>
  await compact({ trigger: 'manual', instructions: 'jimal-session handoff', messages: [{ role: 'user', text: 'old', toolUses: [] }] })
  expect(world.compacts).toEqual(['jimal-session handoff'])
})

test('idle compaction: asked once; Turn off writes the setting and keeps the answer', async ($, on) => {
  const { world } = await session($, on, { files: { 'C:/Users/me/.claude/settings.json': '{\n  "tui": "fullscreen"\n}\n' } })
  expect(await texts($)).toContain('Turn off')
  await press($, 'idle-off')
  expect(await texts($)).not.toContain('Turn off')
  expect(JSON.parse(world.writes['C:/Users/me/.claude/settings.json']!)).toEqual({ tui: 'fullscreen', idleCompaction: false })
  expect(world.store.idleCompaction).toBe('off')
  expect(world.toasts.some(t => t.startsWith('"idleCompaction": false written'))).toBe(true)
})

test('idle compaction: Keep on only keeps the answer; an answer or a setting already off means no question', async ($, on) => {
  const { world } = await session($, on)
  await press($, 'idle-keep')
  expect(await texts($)).not.toContain('Keep on')
  expect(world.store.idleCompaction).toBe('keep')
  expect(Object.keys(world.writes)).toHaveLength(0)
})

test('idle compaction: no question with the setting already off, or once answered', async ($, on) => {
  await session($, on, { settings: { idleCompaction: false }, store: {} })
  expect(await texts($)).not.toContain('Keep on')
})

test('idle compaction: no question once answered on this machine', async ($, on) => {
  await session($, on, { store: { idleCompaction: 'keep' } })
  expect(await texts($)).not.toContain('Keep on')
})

test('handoff all: one press leaves a request; this session answers it after its turn, once', async ($, on) => {
  const { clock, world } = await session($, on, { fork: '## Goal\nShip the band.' })
  await answer($)
  await press($, 'handoff-all')
  expect(world.writes['C:/Users/me/.claude/handoffs/handoff-all.request']).toBe(`${START}\n`)
  expect(world.forks).toHaveLength(0)
  await clock.advance(6000)
  expect(world.forks).toHaveLength(1)
  expect(Object.keys(world.writes).filter(p => p.endsWith('.md'))).toHaveLength(1)
  // The same request is not answered twice.
  await clock.advance(10_000)
  expect(world.forks).toHaveLength(1)
})

test('handoff all: a request older than this session is left alone', async ($, on) => {
  const { clock, world } = await session($, on, { fork: 'note', files: { 'C:/Users/me/.claude/handoffs/handoff-all.request': `${START - 1}\n` } })
  await answer($)
  await clock.advance(6000)
  expect(world.forks).toHaveLength(0)
})

test('a new note deletes every older one this session wrote, including one a plugin reload forgot', async ($, on) => {
  const dir = 'C:/Users/me/.claude/handoffs/E--AI-workflow'
  const { world } = await session($, on, {
    fork: '## Goal\nShip the band.',
    files: { [`${dir}/20261027-090000-abcdef12.md`]: '## Goal\nold', [`${dir}/20261027-100000-ffffffff.md`]: '## Goal\nanother session' },
  })
  await answer($)
  await $.command.run({ command: 'handoff-now' } as never)
  const left = Object.keys(world.writes).filter(p => p.startsWith(dir))
  expect(left).toHaveLength(2)
  expect(left).toContain(`${dir}/20261027-100000-ffffffff.md`)
  expect(left.some(p => p.endsWith('-abcdef12.md') && !p.includes('20261027-090000'))).toBe(true)
})
