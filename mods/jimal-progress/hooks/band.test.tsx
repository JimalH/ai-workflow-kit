import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

const BAND = { component: 'AbovePrompt', props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 100 } as never } as const

async function session($: Engine, on: On) {
  mock.clock(on, { now: Date.parse('2026-10-10T02:00:00Z') })
  mock.env(on, { LANG: 'en_US.UTF-8' })
  on('settings.read', async () => ({ value: {} }) as never)
  on('session.start', async () => ({ cwd: '/repo' }) as never)
  await $.session.start({ source: 'startup', cwd: '/repo', surface: 'terminal', isInteractive: true } as never)
  await $.tool.call({ tool: 'mcp__jimal-progress__progress', title: 'Ship it', total: 4, done: 1, phase: 'delegate' } as never)
}

async function band($: Engine, surface: 'terminal' | 'desktop') {
  const ui = await $.ui.mount({ plugin: 'jimal-progress', surface, ...BAND })
  const svg = await ui.findAll({ type: 'Svg' })
  const title = await ui.findAll({ type: 'Text', text: /^Ship it$/ })
  const label = await ui.findAll({ type: 'Text', text: /^Tasks 1\/4$/ })
  await ui.unmount()
  return { svg: svg.length, title: title.length, label: label.length }
}

test('terminal: the row draws the title, bar and label as text, not an Svg', async ($, on) => {
  await session($, on)
  expect(await band($, 'terminal')).toEqual({ svg: 0, title: 1, label: 1 })
})

test('desktop: the row is still one Svg', async ($, on) => {
  await session($, on)
  expect(await band($, 'desktop')).toEqual({ svg: 1, title: 0, label: 0 })
})

// Measured on the desktop at 175% scaling: 81 columns gave a 615px slot, and the
// count and dismiss Buttons with their gaps took 77px beside the row SVG.
test('desktop: the row SVG leaves room for the count and the dismiss', async ($, on) => {
  await session($, on)
  for (const cols of [60, 81, 120]) {
    const ui = await $.ui.mount({ plugin: 'jimal-progress', surface: 'desktop', component: 'AbovePrompt', props: { ...BAND.props, bodyColumns: cols } as never })
    const [svg] = await ui.findAll({ type: 'Svg' })
    await ui.unmount()
    const width = Number(svg?.props.width)
    expect(width + 77).toBeLessThanOrEqual(cols * 7.6)
    expect(width).toBeGreaterThan(cols * 7.6 - 100)
  }
})
