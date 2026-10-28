import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

const PANE = { component: 'Pane', requestId: 'jimal-mods', props: { title: '', isFocused: false, bodyColumns: 80, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} } as never } as const

const LIST = {
  installed: [
    { id: 'jimal-progress@ai-workflow-kit', version: '1.5.0', enabled: true, installPath: 'C:\\p\\jimal-progress' },
    { id: 'jimal-mods@ai-workflow-kit', version: '0.1.0', enabled: true },
    { id: 'savvy-progress@claude-kit', version: '1.2.1', enabled: false },
  ],
  available: [
    { pluginId: 'jimal-progress@ai-workflow-kit', name: 'jimal-progress', marketplaceName: 'ai-workflow-kit', description: 'bar', installCount: 1 },
    { pluginId: 'jimal-session@ai-workflow-kit', name: 'jimal-session', marketplaceName: 'ai-workflow-kit', description: 'band', installCount: 2 },
    { pluginId: 'session-band@claude-kit', name: 'session-band', marketplaceName: 'claude-kit', description: 'band', installCount: 5 },
  ],
}
const MARKETS = [
  { name: 'ai-workflow-kit', source: 'github', repo: 'JimalH/ai-workflow-kit' },
  { name: 'claude-kit', source: 'github', repo: 'JohnnyVizz/claude-kit' },
]

// A session whose `claude plugin` calls are recorded and answered from LIST.
async function session($: Engine, on: On) {
  const runs: string[][] = []
  const commands: string[] = []
  mock.clock(on, { now: Date.parse('2026-10-28T10:00:00Z') })
  on('session.start', async () => ({ cwd: '/repo' }) as never)
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return (<Text>below</Text>) as never
  })
  on('command.register', () => ({ value: undefined }) as never)
  on('ui.open', () => ({ value: { isPlaced: true } }) as never)
  on('ui.close', () => ({ value: undefined }) as never)
  on('ui.panes', () => ({ value: [] }) as never)
  on('command.run', (_$, e) => {
    commands.push((e as { command: string }).command)
    return { text: 'ok' } as never
  })
  // jimal-progress's own files: a manifest, and a hooks module that registers /agents-info.
  const FILES: Record<string, string> = {
    'C:/p/jimal-progress/.claude-plugin/plugin.json': JSON.stringify({ name: 'jimal-progress', description: 'Progress bar above the prompt' }),
    'C:/p/jimal-progress/hooks/hooks.json': JSON.stringify({ modules: ['./register.tsx'] }),
    'C:/p/jimal-progress/hooks/register.tsx': "await $.command.register({\n  name: 'agents-info',",
  }
  on('fs.read', (_$, e) => {
    const path = (e as { path: string }).path.replace(/\\/g, '/')
    if (path in FILES) return { value: FILES[path] } as never
    throw new Error(`no file ${path}`)
  })
  on('fs.list', () => ({ value: [] }) as never)
  on('process.run', (_$, e) => {
    const argv = (e as { argv: string[] }).argv
    runs.push(argv)
    const out = argv.includes('marketplace') ? MARKETS : argv.includes('list') ? LIST : {}
    return { value: { exitCode: 0, stdout: JSON.stringify(out), stderr: '' } } as never
  })
  await $.session.start({ source: 'startup', cwd: '/repo', surface: 'desktop', isInteractive: true } as never)
  return { runs, commands }
}

async function pane($: Engine) {
  const ui = await $.ui.mount({ plugin: 'jimal-mods', surface: 'desktop', ...PANE })
  return ui
}

test('panel: lists the installed plugins with their switches, not itself', async ($, on) => {
  const { runs } = await session($, on)
  await $.command.run({ command: 'mods' } as never)
  expect(runs.some(a => a.join(' ').includes('plugin list --json --available'))).toBe(true)

  const ui = await pane($)
  // Name, kind and how to use it, read from the plugin's own files.
  expect(await ui.find({ type: 'Text', text: 'Jimal Progress' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'mod · v1.5.0 · ai-workflow-kit' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'Progress bar above the prompt' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '/agents-info' })).toBeDefined()
  expect((await ui.find({ key: 'toggle-jimal-progress@ai-workflow-kit' }))?.props.dimColor).toBe(false)
  expect((await ui.find({ key: 'toggle-savvy-progress@claude-kit' }))?.props.dimColor).toBe(true)
  expect(await ui.find({ key: 'toggle-jimal-mods@ai-workflow-kit' })).toBeUndefined()
  await ui.unmount()
})

test('panel: a switch disables a plugin, then offers to reload', async ($, on) => {
  const { runs, commands } = await session($, on)
  await $.command.run({ command: 'mods' } as never)
  let ui = await pane($)
  await ui.press({ key: 'toggle-jimal-progress@ai-workflow-kit' })
  await ui.unmount()
  expect(runs.some(a => a.join(' ') === 'claude plugin disable jimal-progress@ai-workflow-kit')).toBe(true)

  ui = await pane($)
  expect(await ui.find({ key: 'reload' })).toBeDefined()
  await ui.press({ key: 'reload' })
  await ui.unmount()
  expect(commands).toContain('reload-plugins')
})

test('panel: a marketplace lists what is not installed yet, and installs it', async ($, on) => {
  const { runs } = await session($, on)
  await $.command.run({ command: 'mods' } as never)
  let ui = await pane($)
  await ui.press({ key: 'tab-marketplaces' })
  await ui.unmount()

  ui = await pane($)
  expect(await ui.find({ type: 'Link', href: 'https://github.com/JimalH/ai-workflow-kit' } as never)).toBeDefined()
  await ui.press({ key: 'market-open-ai-workflow-kit' })
  await ui.unmount()

  ui = await pane($)
  expect(await ui.find({ key: 'install-jimal-session@ai-workflow-kit' })).toBeDefined()
  expect(await ui.find({ key: 'install-jimal-progress@ai-workflow-kit' })).toBeUndefined()
  await ui.press({ key: 'install-jimal-session@ai-workflow-kit' })
  await ui.unmount()
  expect(runs.some(a => a.join(' ') === 'claude plugin install jimal-session@ai-workflow-kit --scope user')).toBe(true)
})

