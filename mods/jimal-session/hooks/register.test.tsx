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
}

// A session in E:\AI workflow on Windows, with the fork, files and commands recorded.
async function session($: Engine, on: On, opts: { fork?: string; weekLeftMs?: number } = {}) {
  const world: World = { forks: [], writes: {}, runs: [], compacts: [], toasts: [] }
  const clock = mock.clock(on, { now: START })
  mock.env(on, { USERPROFILE: 'C:\\Users\\me' })
  on('session.start', async () => ({ cwd: 'E:\\AI workflow' }) as never)
  on('session.root', () => ({ value: 'E:\\AI workflow' }) as never)
  on('session.cwd', () => ({ value: 'E:\\AI workflow' }) as never)
  on('session.id', () => ({ value: 'abcdef1234567890' }) as never)
  on('session.turns', () => ({ value: 3 }) as never)
  on('session.usage', () => ({ value: { startedAt: START, context: {}, rateLimits: [
    { kind: 'five_hour', percentUsed: 38, resetsAt: new Date(START + 3 * 60 * MIN - 1).toISOString() },
    { kind: 'seven_day', percentUsed: 20, resetsAt: new Date(START + (opts.weekLeftMs ?? 4 * 24 * 60 * MIN - 1)).toISOString() },
  ] } }) as never)
  on('model.fork', (_$, e) => {
    world.forks.push((e as { prompt: string }).prompt)
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
    return (path in world.writes ? { value: world.writes[path] } : { value: '' }) as never
  })
  on('fs.list', () => ({ value: [] }) as never)
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

// A switch's frame colour on the desktop: grey while off, coloured while on; null when hidden.
async function frameOf($: Engine, key: string): Promise<unknown> {
  const ui = await $.ui.mount({ plugin: 'jimal-session', surface: 'desktop', ...BAND })
  const found = await ui.find({ key: `${key}-frame` })
  await ui.unmount()
  return found ? found.props.borderColor : null
}

async function slotWidth($: Engine, key: string): Promise<unknown> {
  const ui = await $.ui.mount({ plugin: 'jimal-session', surface: 'desktop', ...BAND })
  const found = await ui.find({ key: `${key}-slot` })
  await ui.unmount()
  return found?.props.width
}

async function press($: Engine, key: string) {
  const ui = await $.ui.mount({ plugin: 'jimal-session', surface: 'desktop', ...BAND })
  await ui.press({ key })
  await ui.unmount()
}

test('band: cache countdown changes colour as it runs out', async ($, on) => {
  const { clock } = await session($, on)
  expect(await texts($)).toContain('—')

  // More than half an hour left: the hourglass alone.
  await answer($)
  expect((await texts($)).some(t => /^\d+m$/.test(t))).toBe(false)

  await clock.advance(30 * MIN)
  expect(await texts($)).toContain('30m')

  await clock.advance(15 * MIN)
  expect(await texts($)).toContain('15m')

  await clock.advance(16 * MIN)
  expect(await texts($)).toContain('expired')
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

test('band: a switch is framed grey while off and coloured while on, and hides the other', async ($, on) => {
  await session($, on)
  expect(await frameOf($, 'keep-warm')).toBe('#8a8f8c')
  expect(await frameOf($, 'auto-handoff')).toBe('#8a8f8c')

  await press($, 'keep-warm')
  expect(await frameOf($, 'keep-warm')).toBe('#2e9d8f')
  expect(await frameOf($, 'auto-handoff')).toBeNull()
  // The hidden switch keeps its slot, so the shown one stays where it was.
  expect(await slotWidth($, 'auto-handoff')).toBe('Auto-handoff'.length + 4)

  await press($, 'keep-warm')
  await press($, 'auto-handoff')
  expect(await frameOf($, 'auto-handoff')).toBe('#2e9d8f')
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
  expect(shown).not.toContain('expired')
  expect(shown.some(t => /^\d+m$/.test(t))).toBe(false)
  expect(await frameOf($, 'keep-warm')).toBe('#2e9d8f')
  expect(await frameOf($, 'auto-handoff')).toBeNull()
})

test('auto-handoff: writes a note in the last minute and the next prompt uses it up', async ($, on) => {
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
  expect(await texts($)).toContain('note saved')

  // Right after the note, still in the last minute, the mod asks for the note's
  // compaction (the kit has no transcript to hand it, so its effect is tested below).
  // The file stays until the next prompt, even after the cache lapsed.
  await clock.advance(2 * MIN)
  expect(Object.keys(world.writes)).toHaveLength(1)
  await $.prompt.submit({ text: 'What next?' } as never)
  expect(world.runs.some(argv => argv.includes('del'))).toBe(true)
  expect(Object.keys(world.writes)).toHaveLength(0)
})

test('auto-handoff: a prompt in the last minute uses the note up too', async ($, on) => {
  const { clock, world } = await session($, on, { fork: '## Goal\nShip the band.' })
  await answer($)
  const ui = await $.ui.mount({ plugin: 'jimal-session', surface: 'desktop', ...BAND })
  await ui.press({ key: 'auto-handoff' })
  await ui.unmount()

  await clock.advance(59 * MIN + 2000)
  expect(Object.keys(world.writes)).toHaveLength(1)
  await $.prompt.submit({ text: 'Back in time' } as never)
  expect(Object.keys(world.writes)).toHaveLength(0)
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
