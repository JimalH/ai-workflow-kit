import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

const pane = { title: 'Agents', isFocused: false, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 30 }, view: {} } as const

const agent = (i: number) => ({
  id: `a${i}`,
  type: i % 3 ? 'general-purpose' : 'savvy-worker',
  description: `Task number ${i} with a fairly long description text`,
  model: 'claude-sonnet-5-5',
  status: i < 6 ? 'running' : i % 7 ? 'done' : 'failed',
  startedAt: Date.parse('2026-10-28T09:00:00Z') + i * 60000,
  ...(i < 6 ? {} : { endedAt: Date.parse('2026-10-28T09:30:00Z') + i * 60000 }),
  contextTokens: 20000 + i * 100,
  contextMax: 200000,
  tokens: 5000 * i,
  costUsd: 0.01 * i,
  steps: i,
  round: 1,
})

// The pane draws from what the session stored: `state.get` beneath the plugin stands for it.
const stored = (on: On, agents: unknown[]) =>
  on('state.get', (_$, e) => {
    const key = (e as { key: string }).key
    if (key === 'agents') return { value: { value: agents, version: 1 } } as never
    if (key === 'panel') return { value: { value: { isCompact: false, isDoneCollapsed: false, autoOpenedFor: '' }, version: 1 } } as never
    return { value: { value: undefined, version: 0 } } as never
  })

const mount = ($: Engine, surface: 'terminal' | 'desktop') =>
  $.ui.mount({ plugin: 'jimal-progress', surface, component: 'Pane', requestId: 'savvy-agents', props: pane as never })

const drawnTexts = async (ui: Awaited<ReturnType<typeof mount>>, surface: 'terminal' | 'desktop') =>
  surface === 'desktop' ? (await ui.findAll({ type: 'Svg' })).map(x => String(x.props.alt)) : (await ui.findAll({ type: 'Text' })).map(t => String(t.text))

for (const surface of ['terminal', 'desktop'] as const) {
  test(`${surface}: a record without a model still draws, its model a dash`, async ($, on) => {
    // A spawn that left the model to the session's default stored no model (1.5.0 and before);
    // a type or description may be missing the same way.
    stored(on, [{ ...agent(1), model: undefined }, { ...agent(2), type: undefined, description: undefined }])
    const ui = await mount($, surface)
    const texts = await drawnTexts(ui, surface)
    expect(texts.some(t => t.includes('—'))).toBe(true)
    await ui.unmount()
  })

  test(`${surface}: 84 records draw`, async ($, on) => {
    stored(on, Array.from({ length: 84 }, (_, i) => agent(i)))
    const ui = await mount($, surface)
    const texts = await drawnTexts(ui, surface)
    expect(texts.filter(t => t.includes('Task number')).length).toBe(84)
    await ui.unmount()
  })
}
