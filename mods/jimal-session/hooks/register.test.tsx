import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'
import { diffWords, markChanges } from './register'

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
  completions: { system: string; prompt: string }[]
  opens: string[]
}

// A session in E:\AI workflow on Windows, with the fork, files and commands recorded.
async function session(
  $: Engine,
  on: On,
  opts: { fork?: string; forkReason?: string; skill?: string; weekLeftMs?: number; noUsage?: boolean; context?: Record<string, unknown>; cost?: { usd: number }; settings?: Record<string, unknown>; store?: Record<string, unknown>; files?: Record<string, string>; reply?: string | ((prompt: string) => string); fail?: boolean; delayMs?: number; coldFork?: boolean } = {},
) {
  const world: World = { forks: [], writes: { ...opts.files }, runs: [], compacts: [], toasts: [], store: { ...opts.store }, completions: [], opens: [] }
  const clock = mock.clock(on, { now: START })
  mock.env(on, { USERPROFILE: 'C:\\Users\\me' })
  on('session.start', async () => ({ cwd: 'E:\\AI workflow' }) as never)
  on('session.root', () => ({ value: 'E:\\AI workflow' }) as never)
  on('session.cwd', () => ({ value: 'E:\\AI workflow' }) as never)
  on('session.id', () => ({ value: 'abcdef1234567890' }) as never)
  on('session.turns', () => ({ value: 3 }) as never)
  on('session.usage', () => ({ value: { startedAt: START, context: opts.context ?? {}, ...(opts.cost ? { cost: opts.cost } : {}), rateLimits: opts.noUsage ? [] : [
    { kind: 'five_hour', percentUsed: 38, resetsAt: new Date(START + 3 * 60 * MIN - 1).toISOString() },
    { kind: 'seven_day', percentUsed: 20, resetsAt: new Date(START + (opts.weekLeftMs ?? 4 * 24 * 60 * MIN - 1)).toISOString() },
  ] } }) as never)
  on('model.complete', async (_$, e) => {
    const { system, prompt } = e as { system: string; prompt: string }
    world.completions.push({ system, prompt })
    // A slow model: the clock runs on while the call is out.
    if (opts.delayMs) await clock.advance(opts.delayMs)
    if (opts.fail) return { value: { isAnswered: false, reason: 'api-error', status: 529, error: 'overloaded', usage: {} } } as never
    const text = typeof opts.reply === 'function' ? opts.reply(prompt) : (opts.reply ?? prompt)
    return { value: { isAnswered: true, text, usage: {} } } as never
  })
  on('ui.open', (_$, e) => {
    world.opens.push((e as { id: string }).id)
    return { value: { isPlaced: true } } as never
  })
  on('model.fork', (_$, e) => {
    world.forks.push((e as { prompt: string }).prompt)
    if (opts.forkReason) return { value: { isAnswered: false, reason: opts.forkReason } } as never
    return { value: { isAnswered: true, text: opts.fork ?? 'ok', usage: { input_tokens: 10, output_tokens: 2, cache_read_input_tokens: opts.coldFork ? 0 : 50000, cache_creation_input_tokens: 0 } } } as never
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
  on('prompt.submit', (_$, e) => {
    const { text, context } = e as { text: string; context?: readonly string[] }
    return (context ? { text, context } : { text }) as never
  })
  on('prompt.change', (_$, e) => ({ text: (e as { text: string }).text }) as never)
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
  // On the desktop the cache dot and its text are one Svg, named by its alt.
  const svgs = await ui.findAll({ type: 'Svg' })
  await ui.unmount()
  return [...found.map(t => t.text), ...buttons.map(b => String(b.props.label)), ...svgs.map(v => String(v.props.alt))]
}

// A switch's state, the label of its On/Off button in the unfolded Details; null when not drawn.
async function stateOf($: Engine, key: string): Promise<unknown> {
  const ui = await $.ui.mount({ plugin: 'jimal-session', surface: 'desktop', ...BAND })
  const found = await ui.find({ key })
  await ui.unmount()
  return found ? String(found.props.label).toLowerCase() : null
}

// The props the band hands its middle module; undefined when the middle is not drawn.
async function middleOf($: Engine): Promise<{ list: string; working: string; width: number } | undefined> {
  const ui = await $.ui.mount({ plugin: 'jimal-session', surface: 'desktop', ...BAND })
  const found = await ui.find({ key: 'middle' })
  await ui.unmount()
  return found ? (found.props.props as { list: string; working: string; width: number }) : undefined
}

// The texts of the check line under the band's row, in order; undefined when none is drawn.
async function checkLine($: Engine): Promise<{ text: string; color?: unknown; strikethrough?: unknown; dim?: unknown }[] | undefined> {
  const ui = await $.ui.mount({ plugin: 'jimal-session', surface: 'desktop', ...BAND })
  const box = await ui.find({ key: 'check' })
  const all = box ? await ui.findAll({ type: 'Text' }) : []
  await ui.unmount()
  if (!box) return undefined
  const texts = all.map(t => ({ text: t.text, color: t.props.color, strikethrough: t.props.strikethrough, dim: t.props.dimColor }))
  const from = texts.findIndex(t => t.text === 'Fix English:')
  return from < 0 ? [] : texts.slice(from)
}

const typed = ($: Engine, text: string) =>
  ($.prompt as unknown as { change: (e: unknown) => Promise<unknown> }).change({ text, cursor: text.length, origin: { kind: 'engine' } })

// Presses a band button; a switch (in the Details) unfolds them first when they are folded.
async function press($: Engine, key: string) {
  let ui = await $.ui.mount({ plugin: 'jimal-session', surface: 'desktop', ...BAND })
  if (key !== 'details' && !(await ui.find({ key }))) {
    await ui.press({ key: 'details' })
    await ui.unmount()
    ui = await $.ui.mount({ plugin: 'jimal-session', surface: 'desktop', ...BAND })
  }
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

test('band: Details folded draws no switch; unfolded, each is an On/Off button, and Keep warm and Auto-handoff exclude each other', async ($, on) => {
  const { world } = await session($, on)
  expect(await stateOf($, 'keep-warm')).toBeNull()
  expect(await texts($)).toContain('Details ▾')

  await press($, 'details')
  expect(await stateOf($, 'keep-warm')).toBe('off')
  expect(await stateOf($, 'auto-handoff')).toBe('off')
  expect(await stateOf($, 'fix-english')).toBe('off')
  expect(await stateOf($, 'shape-prompt')).toBe('off')
  expect(world.store.details).toBe(true)

  await press($, 'keep-warm')
  expect(await stateOf($, 'keep-warm')).toBe('on')
  expect(await stateOf($, 'auto-handoff')).toBe('off')
  await press($, 'auto-handoff')
  expect(await stateOf($, 'auto-handoff')).toBe('on')
  expect(await stateOf($, 'keep-warm')).toBe('off')

  // The prompt switches are kept in the store; In reply and In pane sit under Fix English.
  await press($, 'fix-english')
  expect(world.store.prompt).toEqual({ fixEnglish: true, inReply: true, inPane: true, shapePrompt: false })
  await press($, 'in-pane')
  expect(world.store.prompt).toEqual({ fixEnglish: true, inReply: true, inPane: false, shapePrompt: false })

  await press($, 'details')
  expect(await stateOf($, 'keep-warm')).toBeNull()
  expect(world.store.details).toBe(false)
})

test('keep warm: refreshes the cache 59 minutes after the last answer', async ($, on) => {
  const { clock, world } = await session($, on)
  await answer($)
  await press($, 'keep-warm')

  await clock.advance(58 * MIN)
  expect(world.forks).toHaveLength(0)
  await clock.advance(1 * MIN + 2000)
  expect(world.forks).toHaveLength(1)
  // Refreshed: a full hour again (no minutes shown above half an hour); the middle lists the switch.
  const shown = await texts($)
  expect(shown).toContain('cache warm')
  expect((await middleOf($))?.list).toContain('Keep warm')
  expect(await stateOf($, 'keep-warm')).toBe('on')
  expect(await stateOf($, 'auto-handoff')).toBe('off')
})

test('auto-handoff: writes a note in the last minute; a compaction refused is said, and the note is kept', async ($, on) => {
  const { clock, world } = await session($, on, { fork: '## Goal\nShip the band.' })
  await answer($)
  await press($, 'auto-handoff')

  await clock.advance(59 * MIN + 2000)
  const paths = Object.keys(world.writes)
  expect(paths).toHaveLength(1)
  expect(paths[0]).toMatch(/^C:\/Users\/me\/\.claude\/handoffs\/E--AI-workflow\/\d{8}-\d{6}-abcdef12\.md$/)
  expect(world.forks[0]).toContain('handover note')

  // The kit has no transcript for a compaction to read, so it refuses one: the band and a
  // toast say the note was not applied (the compaction's answer is tested below).
  expect((await middleOf($))?.working).toContain('note not applied')
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

test('band: a narrow window drops the figures one by one, the buttons stay', async ($, on) => {
  await session($, on)
  const shownAt = async (bodyColumns: number) => {
    const ui = await $.ui.mount({ plugin: 'jimal-session', surface: 'desktop', component: 'AbovePrompt', props: { ...BAND.props, bodyColumns } as never })
    const texts = (await ui.findAll({ type: 'Text' })).map(t => t.text)
    const switches = await ui.find({ key: 'details' })
    await ui.unmount()
    return { texts, hasSwitches: switches !== undefined }
  }
  const wide = await shownAt(140)
  expect(wide.texts).toContain('3h')
  expect(wide.texts).toContain('4d')
  expect(wide.hasSwitches).toBe(true)

  const medium = await shownAt(60)
  expect(medium.texts).toContain('3h')
  expect(medium.texts).not.toContain('4d')
  expect(medium.hasSwitches).toBe(true)

  const narrow = await shownAt(50)
  expect(narrow.texts).not.toContain('3h')
  expect(narrow.hasSwitches).toBe(true)
})

test('band: the middle module gets the switches that are on, and the working line while a feature works', async ($, on) => {
  await session($, on, { delayMs: 2500, store: { prompt: { fixEnglish: true, inReply: true, inPane: true, shapePrompt: false } } })
  expect((await middleOf($))?.list).toBe('● Fix English  ● In reply  ● In pane')
  await press($, 'auto-handoff')
  const idle = await middleOf($)
  expect(idle?.list).toBe('● Auto-handoff  ● Fix English  ● In reply  ● In pane')
  expect(idle?.working).toBe('')
  // The module measures its own columns (width 0): the slot grows into the row's spare room.
  expect(idle?.width).toBe(0)

  // While Fix English works, its own line stands in the middle, counted.
  const pending = $.prompt.submit({ text: 'please fix teh header of the page' } as never)
  expect((await middleOf($))?.working).toMatch(/^◷ Fix English · checking… \ds$/)
  await pending
  expect((await middleOf($))?.working).toBe('')
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
  const svgs = await ui.findAll({ type: 'Svg' })
  await ui.unmount()
  const texts = found.map(t => t.text)
  // The desktop draws the dot and its text as one grey Svg.
  const cache = svgs.find(v => v.props.alt === 'cache cold')
  expect(cache).toBeDefined()
  expect(String(cache?.props.source)).toContain('fill="#8a8f8c"')
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

const submit = ($: Engine, text: string) => $.prompt.submit({ text } as never) as Promise<{ text?: string; context?: readonly string[]; drop?: string }>
const PROMPT_ON = { fixEnglish: false, inReply: true, inPane: true, shapePrompt: false }

test('diff: a misspelt word is removed and its correction added; spacing and lines stay', () => {
  expect(markChanges(diffWords('fix the typo in teh header', 'fix the typo in the header'))).toBe('fix the typo in ~~teh~~ **the** header')
  expect(markChanges(diffWords('it dont work', 'it does not work'))).toBe('it ~~dont~~ **does not** work')
  expect(markChanges(diffWords('add tests\nthen ship', 'add tests\nthen ship it'))).toBe('add tests\nthen ship **it**')
  expect(diffWords('same text', 'same text')).toEqual([{ kind: 'same', text: 'same text' }])
})

test('fix English: the corrections ride as context and open the pane, coloured; a right prompt does neither', async ($, on) => {
  const { world } = await session($, on, { reply: p => p.replace('teh', 'the'), store: { prompt: { ...PROMPT_ON, fixEnglish: true } } })
  const out = await submit($, 'please fix teh header of the page')
  expect(out.text).toBe('please fix teh header of the page')
  expect(out.context?.[0]).toContain('~~teh~~ **the**')
  expect(out.context?.[0]).toContain('**Prompt check**')
  expect(world.opens).toEqual(['jimal-session-check'])
  expect(world.completions[0]?.system).toMatch(/copy editor/)
  const ui = await $.ui.mount({ plugin: 'jimal-session', surface: 'desktop', component: 'Pane', requestId: 'jimal-session-check', props: {} as never })
  const pane = (await ui.findAll({ type: 'Text' })).map(t => ({ text: t.text, color: t.props.color, strikethrough: t.props.strikethrough }))
  await ui.unmount()
  expect(pane.find(t => t.text === 'teh')).toMatchObject({ color: '#e0846b', strikethrough: true })
  expect(pane.find(t => t.text === 'the')).toMatchObject({ color: '#4caf6e' })

  const right = await submit($, 'please fix the header of the page')
  expect(right.context).toBeUndefined()
  expect(world.opens).toHaveLength(1)
})

test('fix English: In reply off keeps the context out, In pane off keeps the pane shut; both off, no call; a Chinese or short prompt is not checked', async ($, on) => {
  const { world } = await session($, on, { reply: p => p.replace('teh', 'the'), store: { prompt: { ...PROMPT_ON, fixEnglish: true, inReply: false } } })
  const out = await submit($, 'please fix teh header of the page')
  expect(out.context).toBeUndefined()
  expect(world.opens).toEqual(['jimal-session-check'])
  await press($, 'in-pane')
  await submit($, 'please fix teh header of the page')
  await submit($, '把这个标题改一下')
  await submit($, 'fix header')
  expect(world.completions).toHaveLength(1)
})

test('fix English: a failed call lets the prompt through with a toast', async ($, on) => {
  const { world } = await session($, on, { fail: true, store: { prompt: { ...PROMPT_ON, fixEnglish: true } } })
  const out = await submit($, 'please fix the header of the page')
  expect(out.text).toBe('please fix the header of the page')
  expect(out.context).toBeUndefined()
  expect(world.toasts[0]).toMatch(/^Fix English: API error 529/)
})

test('shape prompt: the prompt goes as typed, the arranged version beside it; a shaped prompt is not proofread again', async ($, on) => {
  const { world } = await session($, on, { reply: '**Tasks**\n1. make teh page faster\n\n**Context**\nit is slow', store: { prompt: { ...PROMPT_ON, fixEnglish: true, shapePrompt: true } } })
  const out = await submit($, 'make teh page faster, it is slow')
  expect(out.drop).toBeUndefined()
  expect(out.text).toBe('make teh page faster, it is slow')
  expect(out.context?.[0]).toContain('arranged the prompt above into sections')
  expect(out.context?.[0]).toContain('**Tasks**\n1. make teh page faster\n\n**Context**\nit is slow')
  expect(world.completions).toHaveLength(1)
  expect(world.completions[0]?.system).toMatch(/extractive organiser/)
})

test('shape prompt: a reply with no heading or list, or padded past the original, sends the prompt alone', async ($, on) => {
  const { world } = await session($, on, { reply: p => (p.startsWith('pad') ? `**Tasks**\n1. ${p}\n\n**Context**\n${'x'.repeat(400)}` : `Sure. ${p}`), store: { prompt: { ...PROMPT_ON, shapePrompt: true } } })
  const plain = await submit($, 'make the page faster, it is slow')
  expect(plain.text).toBe('make the page faster, it is slow')
  expect(plain.context).toBeUndefined()
  const padded = await submit($, 'pad the page faster, it is slow')
  expect(padded.text).toBe('pad the page faster, it is slow')
  expect(padded.context).toBeUndefined()
  expect(world.completions).toHaveLength(2)
  expect(world.toasts).toHaveLength(0)
})

test('shape prompt: a Chinese prompt is shaped too; a failed call sends it as typed with a toast in Chinese; a few characters go as they are', async ($, on) => {
  const { world } = await session($, on, { fail: true, store: { prompt: { ...PROMPT_ON, shapePrompt: true } } })
  const out = await submit($, '帮我把页面改快一点')
  expect(out.text).toBe('帮我把页面改快一点')
  expect(out.context).toBeUndefined()
  expect(world.toasts[0]).toMatch(/^整理失败/)
  await submit($, '继续')
  expect(world.completions).toHaveLength(1)
})

test('prompt features: a command passes untouched, and a loaded handover note is not shaped', async ($, on) => {
  const dir = 'C:/Users/me/.claude/handoffs/E--AI-workflow'
  const { world } = await session($, on, { reply: 'Goal: x', store: { prompt: { ...PROMPT_ON, shapePrompt: true } }, files: { [`${dir}/20261027-100000-ffffffff.md`]: '## Goal\nShip it.' } })
  await $.prompt.submit({ text: '/compact', command: { name: 'compact' } } as never)
  expect(world.completions).toHaveLength(0)
})

test('shape prompt: an aside the model gives back unchanged, or answers with an explanation, goes as typed', async ($, on) => {
  const { world } = await session($, on, { reply: p => (p === '我看看，等等' ? '这条消息没有任务，无法整理。' : p), store: { prompt: { ...PROMPT_ON, shapePrompt: true } } })
  const aside = await submit($, '我看看，等等')
  expect(aside.text).toBe('我看看，等等')
  expect(aside.context).toBeUndefined()
  const same = await submit($, 'make the page faster, it is slow')
  expect(same.text).toBe('make the page faster, it is slow')
  expect(world.toasts).toHaveLength(0)
})

test('fix English, live: the draft is checked 900 ms after the last change and the corrections drawn under the row; sent, the check is reused and dimmed', async ($, on) => {
  const { clock, world } = await session($, on, { reply: p => p.replace('teh', 'the'), store: { prompt: { ...PROMPT_ON, fixEnglish: true } } })
  await typed($, 'please fix teh')
  await clock.advance(500)
  await typed($, 'please fix teh header of the page')
  await clock.advance(500)
  expect(world.completions).toHaveLength(0)
  await clock.advance(500)
  expect(world.completions).toHaveLength(1)
  const line = await checkLine($)
  expect(line?.find(t => t.text === 'teh')).toMatchObject({ color: '#e0846b', strikethrough: true })
  expect(line?.find(t => t.text === 'the')).toMatchObject({ color: '#4caf6e' })

  // Enter: no second call, the corrections ride as context, and the line goes dim.
  const out = await submit($, 'please fix teh header of the page')
  expect(world.completions).toHaveLength(1)
  expect(out.context?.[0]).toContain('~~teh~~ **the**')
  expect((await checkLine($))?.[0]).toMatchObject({ text: 'Fix English:', dim: true })

  // A right draft says so; a Chinese one clears the line.
  await typed($, 'please fix the header of the page')
  await clock.advance(1000)
  expect((await checkLine($))?.some(t => t.text === 'no issues')).toBe(true)
  await typed($, '把标题改一下')
  expect(await checkLine($)).toBeUndefined()
})

test('shape prompt: a prompt ending in ++ is shaped with the switch off, and the mark is dropped', async ($, on) => {
  const { world } = await session($, on, { reply: '1. make the page faster\n2. it is slow', store: { prompt: { ...PROMPT_ON } } })
  const plain = await submit($, 'make the page faster, it is slow')
  expect(plain.text).toBe('make the page faster, it is slow')
  expect(world.completions).toHaveLength(0)
  const marked = await submit($, 'make the page faster, it is slow ++')
  expect(marked.text).toBe('make the page faster, it is slow')
  expect(marked.context?.[0]).toContain('1. make the page faster\n2. it is slow')
  expect(marked.context?.[0]).not.toContain('++')
  expect(world.completions[0]?.prompt).toBe('make the page faster, it is slow')
})

// Three hours of ticks: longer than the default budget.
test('keep warm: turns itself off after its window, and when a ping finds the cache cold', { timeoutMs: 20000 }, async ($, on) => {
  const { clock, world } = await session($, on)
  await answer($)
  await press($, 'keep-warm')
  expect(await stateOf($, 'keep-warm')).toBe('on')
  // Two pings in, the window (3 hours) runs out.
  await clock.advance(59 * MIN + 2000)
  await clock.advance(59 * MIN + 2000)
  expect(world.forks).toHaveLength(2)
  await clock.advance(62 * MIN)
  expect(await stateOf($, 'keep-warm')).toBe('off')
  expect(world.toasts.some(t => t.startsWith('Keep warm off: its 3 hours are up'))).toBe(true)
})

test('keep warm: a ping that read no cache turns it off with a toast', async ($, on) => {
  const { clock, world } = await session($, on, { coldFork: true })
  await answer($)
  await press($, 'keep-warm')
  await clock.advance(59 * MIN + 2000)
  expect(world.forks).toHaveLength(1)
  expect(await stateOf($, 'keep-warm')).toBe('off')
  expect(world.toasts.some(t => t.startsWith('Keep warm off: the cache was already cold'))).toBe(true)
})

test('details: no button carries a hotkey (the band must be focused first, so a click is simpler)', async ($, on) => {
  await session($, on)
  await press($, 'details')
  const byKey = async (key: string) => {
    const ui2 = await $.ui.mount({ plugin: 'jimal-session', surface: 'desktop', ...BAND })
    const b = await ui2.find({ key })
    await ui2.unmount()
    return b?.props.hotkey
  }
  for (const key of ['handoff-all', 'details', 'keep-warm', 'auto-handoff', 'fix-english', 'in-reply', 'in-pane', 'shape-prompt']) {
    expect(await byKey(key)).toBeUndefined()
  }
})

test('usage tool: the windows, the cache, the context and the switches as text', async ($, on) => {
  const { clock } = await session($, on)
  const call = async () => String(((await $.tool.call({ tool: 'mcp__jimal-session__usage' } as never)) as { result: string }).result)

  // Before the first answer: the windows read, the cache cold.
  let text = await call()
  expect(text).toContain('5-hour window: 38% used, 62% left, resets in 3h 0m')
  expect(text).toContain('weekly window: 20% used, 80% left, resets in 4d 0h')
  expect(text).toContain('Prompt cache: cold (no answer yet)')
  expect(text).toContain('Switches: Keep warm off, Auto-handoff off')

  // After an answer the cache is warm with its hour; an hour on, expired.
  await answer($)
  await clock.advance(20 * MIN)
  text = await call()
  expect(text).toContain('Prompt cache: warm, 40m left')
  await clock.advance(41 * MIN)
  expect(await call()).toContain('Prompt cache: expired')
})

test('usage tool: without a reading it says so, and the context and cost show when the host gives them', async ($, on) => {
  await session($, on, { noUsage: true, context: { tokens: 123456, window: 1000000, percent: 12 }, cost: { usd: 3.21 } })
  const text = String(((await $.tool.call({ tool: 'mcp__jimal-session__usage' } as never)) as { result: string }).result)
  expect(text).toContain('Usage limits: no reading yet')
  expect(text).toContain('Context window: 123k of 1.0M tokens (12% used)')
  expect(text).toContain('Session cost: ≈$3.21')
})
