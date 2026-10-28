import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

const MIN = 60 * 1000
const PLAN = 'mcp__ccd_turn__update_plan'
const BAND = { component: 'AbovePrompt', props: { hasSurvey: false, isWorking: false, maxRows: 20, bodyColumns: 100 } as never } as const

// A desktop session whose task-list tool calls go through.
async function session($: Engine, on: On) {
  const clock = mock.clock(on, { now: Date.parse('2026-10-28T10:00:00Z') })
  mock.env(on, { LANG: 'en_US.UTF-8' })
  on('settings.read', async () => ({ value: {} }) as never)
  on('session.start', async () => ({ cwd: '/repo' }) as never)
  on('tool.call', () => ({ result: 'ok' }) as never)
  on('prompt.submit', (_$, e) => ({ text: (e as { text: string }).text }) as never)
  // A reported plan opens the agents panel by itself.
  on('ui.open', () => ({ value: { isPlaced: true } }) as never)
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return (<Text>below</Text>) as never
  })
  await $.session.start({ source: 'startup', cwd: '/repo', surface: 'desktop', isInteractive: true } as never)
  return clock
}

const plan = ($: Engine, input: Record<string, unknown>) => $.tool.call({ tool: PLAN, ...input } as never)

async function band($: Engine) {
  const ui = await $.ui.mount({ plugin: 'jimal-progress', surface: 'desktop', ...BAND })
  const texts = (await ui.findAll({ type: 'Text' })).map(t => t.text)
  const bars = (await ui.findAll({ type: 'Svg' })).length
  const more = await ui.find({ key: 'tasks-more' })
  await ui.unmount()
  return { texts, bars, more: more ? String(more.props.label) : null }
}

test('task list: the bar follows it, with each open task and its time left', async ($, on) => {
  const clock = await session($, on)
  await plan($, { items: [
    { content: 'Read the code', status: 'in_progress' },
    { content: 'Write the fix', status: 'pending' },
    { content: 'Run the tests', status: 'pending' },
  ] })

  // Nothing finished yet: no time to go on.
  let shown = await band($)
  expect(shown.texts).toContain('Read the code')
  expect(shown.texts).toContain('3 open · time left —')
  expect(shown.bars).toBe(1 + 3)

  // The first took 10 minutes: the others are expected to take as long.
  await clock.advance(10 * MIN)
  await plan($, { advance: true })
  shown = await band($)
  expect(shown.texts).not.toContain('Read the code')
  expect(shown.texts).toContain('~20m left · total ~30m')
  expect(shown.texts.filter(t => t === '~10m')).toHaveLength(2)

  // Four minutes into the second: six left of it.
  await clock.advance(4 * MIN)
  shown = await band($)
  expect(shown.texts).toContain('~6m')
})

test('task list: estimates from the progress tool, scaled by the pace so far', async ($, on) => {
  const clock = await session($, on)
  await $.tool.call({ tool: 'mcp__jimal-progress__progress', title: 'Ship it', phase: 'delegate', tasks: [
    { title: 'Parser', tier: 'medium', estimateMin: 10 },
    { title: 'CLI', tier: 'light', estimateMin: 20 },
  ] } as never)
  const shown = await band($)
  expect(shown.texts).toContain('~30m left · total ~30m')
  void clock
})

test('task list: five rows until expanded, finished ones hidden', async ($, on) => {
  await session($, on)
  await plan($, { items: Array.from({ length: 8 }, (_, i) => ({ content: `Step ${i + 1}`, status: i === 0 ? 'completed' : i === 1 ? 'in_progress' : 'pending' })) })

  let shown = await band($)
  expect(shown.texts).not.toContain('Step 1')
  expect(shown.texts).toContain('Step 6')
  expect(shown.texts).not.toContain('Step 7')
  expect(shown.more).toBe('+2 more')

  const ui = await $.ui.mount({ plugin: 'jimal-progress', surface: 'desktop', ...BAND })
  await ui.press({ key: 'tasks-more' })
  await ui.unmount()
  shown = await band($)
  expect(shown.texts).toContain('Step 8')
  expect(shown.more).toBe('Show less')
})

test('task list: the wrap-up finishes the flow, which then counts down', async ($, on) => {
  await session($, on)
  await plan($, { items: [{ content: 'Only step', status: 'in_progress' }] })
  await $.tool.call({ tool: 'mcp__ccd_turn__wrap_up', recap: 'done' } as never)
  const ui = await $.ui.mount({ plugin: 'jimal-progress', surface: 'desktop', ...BAND })
  const [svg] = await ui.findAll({ type: 'Svg' })
  await ui.unmount()
  expect(String(svg?.props.source)).toContain('Done · 30s')
})

test('band: a message sent while the flow runs folds its tasks to one line, a click opens them', async ($, on) => {
  await session($, on)
  await plan($, { items: [
    { content: 'Read the code', status: 'in_progress' },
    { content: 'Write the fix', status: 'pending' },
  ] })
  await $.prompt.submit({ text: 'one more thing' } as never)

  let ui = await $.ui.mount({ plugin: 'jimal-progress', surface: 'desktop', ...BAND })
  const folded = await ui.find({ key: 'band-expand' })
  expect(String(folded?.props.label)).toContain('2 tasks')
  // The bar itself stays; only the task rows fold.
  expect(await ui.findAll({ type: 'Svg' })).toHaveLength(1)
  await ui.press({ key: 'band-expand' })
  await ui.unmount()

  ui = await $.ui.mount({ plugin: 'jimal-progress', surface: 'desktop', ...BAND })
  expect(await ui.findAll({ type: 'Svg' })).toHaveLength(1 + 2)
  expect(await ui.find({ key: 'band-expand' })).toBeUndefined()
  await ui.unmount()

  // A new flow starts unfolded.
  await plan($, { scope: 'new_task', items: [{ content: 'Something else', status: 'in_progress' }] })
  ui = await $.ui.mount({ plugin: 'jimal-progress', surface: 'desktop', ...BAND })
  expect(await ui.find({ key: 'band-expand' })).toBeUndefined()
  await ui.unmount()
})
