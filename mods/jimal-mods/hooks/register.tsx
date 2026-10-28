import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Available, Catalog, Installed, Marketplace, View } from '../types'

const catalog = atom({ plugin: 'jimal-mods', key: 'catalog' } as const, {
  installed: [],
  available: [],
  marketplaces: [],
  readAt: 0,
} as Catalog)
const view = atom({ plugin: 'jimal-mods', key: 'view' } as const, {
  busy: '',
  message: '',
  isDirty: false,
  tab: 'installed',
  openMarketplace: '',
  filter: '',
} as View)

const PANE = 'jimal-mods'
const SELF = 'jimal-mods'
// The available plugins listed at once; a filter narrows the rest.
const AVAILABLE_ROWS = 15
// Commands shown under a plugin's name.
const COMMAND_HINTS = 3


// ---------------------------------------------------------------------------
// The plugin CLI: the one place that lists, enables, disables and installs.

const cli = async ($: EngineInterface, args: string[]): Promise<{ ok: boolean; out: string }> => {
  const ran = await $.process.run(['claude', 'plugin', ...args], { timeoutMs: 120_000 }).catch((err: unknown) => ({
    exitCode: -1,
    stdout: '',
    stderr: String(err),
  }))
  return { ok: ran.exitCode === 0, out: ran.exitCode === 0 ? ran.stdout : ran.stderr || ran.stdout }
}

const asText = (v: unknown): string => (typeof v === 'string' ? v : '')

const parseInstalled = (raw: unknown[]): Installed[] =>
  raw.map(r => {
    const o = r as Record<string, unknown>
    const id = asText(o.id)
    const [name = id, marketplace = ''] = id.split('@')
    return {
      id,
      name,
      marketplace,
      version: asText(o.version),
      isEnabled: o.enabled === true,
      installPath: asText(o.installPath).replace(/\\/g, '/'),
      description: '',
      kind: 'plugin',
      commands: [],
    }
  })

const parseAvailable = (raw: unknown[]): Available[] =>
  raw.map(r => {
    const o = r as Record<string, unknown>
    return {
      id: asText(o.pluginId),
      name: asText(o.name),
      marketplace: asText(o.marketplaceName),
      description: asText(o.description),
      installCount: typeof o.installCount === 'number' ? o.installCount : 0,
    }
  })

const parseMarketplaces = (raw: unknown[]): Marketplace[] =>
  raw.map(r => {
    const o = r as Record<string, unknown>
    const repo = asText(o.repo)
    const url = repo ? `https://github.com/${repo}` : /^https:\/\//.test(asText(o.url)) ? asText(o.url) : undefined
    return { name: asText(o.name), ...(repo ? { repo } : {}), ...(url ? { url } : {}) }
  })

// What a plugin's own files say about it: its description, whether it is a mod (a
// hooks module), and how to use it (the commands its modules register, its skills
// as `/plugin:skill`, its command files). Anything unreadable is left out.
const describe = async ($: EngineInterface, p: Installed): Promise<Installed> => {
  const root = p.installPath
  if (!root) return p
  const readJson = async (path: string) =>
    $.fs.read(path).then(t => JSON.parse(t) as Record<string, unknown>, () => null)

  const manifest = await readJson(`${root}/.claude-plugin/plugin.json`)
  const hooks = await readJson(`${root}/hooks/hooks.json`)
  const modules = Array.isArray(hooks?.modules) ? (hooks.modules as unknown[]).filter((m): m is string => typeof m === 'string') : []

  const commands: string[] = []
  for (const m of modules) {
    const source = await $.fs.read(`${root}/hooks/${m.replace(/^\.\//, '')}`).catch(() => '')
    for (const match of source.matchAll(/command\.register\(\{\s*name:\s*['"]([\w-]+)['"]/g)) commands.push(`/${match[1]}`)
  }
  const skills = await $.fs.list(`${root}/skills`).catch(() => [])
  for (const s of skills) if (s.kind === 'directory') commands.push(`/${p.name}:${s.name}`)
  const files = await $.fs.list(`${root}/commands`).catch(() => [])
  for (const f of files) if (f.kind === 'file' && f.name.endsWith('.md')) commands.push(`/${f.name.replace(/\.md$/, '')}`)

  return {
    ...p,
    description: asText(manifest?.description),
    kind: modules.length > 0 ? 'mod' : 'plugin',
    commands: [...new Set(commands)],
  }
}

const refresh = async ($: EngineInterface): Promise<void> => {
  await update($, view, v => ({ ...v, busy: 'refresh' }))
  const [plugins, markets] = await Promise.all([
    cli($, ['list', '--json', '--available']),
    cli($, ['marketplace', 'list', '--json']),
  ])
  try {
    if (!plugins.ok) throw new Error(plugins.out.trim() || 'claude plugin list failed')
    const list = JSON.parse(plugins.out) as { installed?: unknown[]; available?: unknown[] }
    const available = parseAvailable(list.available ?? [])
    const installed: Installed[] = []
    for (const p of parseInstalled(list.installed ?? [])) {
      const described = await describe($, p)
      // A marketplace's own description, where the plugin's manifest has none.
      installed.push(described.description ? described : { ...described, description: available.find(a => a.id === p.id)?.description ?? '' })
    }
    const installedIds = new Set(installed.map(p => p.id))
    const at = await $.clock.now()
    await update($, catalog, () => ({
      installed,
      available: available.filter(a => !installedIds.has(a.id)),
      marketplaces: markets.ok ? parseMarketplaces(JSON.parse(markets.out) as unknown[]) : [],
      readAt: at,
    }))
    await update($, view, v => ({ ...v, busy: '' }))
  } catch (err) {
    await update($, view, v => ({ ...v, busy: '', message: `Could not read the plugins: ${String((err as Error).message ?? err).slice(0, 200)}` }))
  }
}

// Enable, disable or install one plugin, then read the list again.
const change = async ($: EngineInterface, id: string, action: 'enable' | 'disable' | 'install'): Promise<void> => {
  await update($, view, v => ({ ...v, busy: id, message: '' }))
  const ran = await cli($, action === 'install' ? ['install', id, '--scope', 'user'] : [action, id])
  await update($, view, v => ({
    ...v,
    busy: '',
    isDirty: v.isDirty || ran.ok,
    message: ran.ok
      ? `${action === 'install' ? 'Installed' : action === 'enable' ? 'Enabled' : 'Disabled'} ${id}. Reload to apply it to this session.`
      : `${action} ${id} failed: ${ran.out.trim().split('\n').pop()?.slice(0, 200) ?? ''}`,
  }))
  await refresh($)
}

// /reload-plugins, run for the person; where a plugin may not run it, they restart instead.
const reload = async ($: EngineInterface): Promise<void> => {
  const ran = await $.command.run({ command: 'reload-plugins' }).catch(() => null)
  await update($, view, v =>
    ran
      ? { ...v, isDirty: false, message: 'Plugins reloaded.' }
      : { ...v, message: 'Could not reload from here: run /reload-plugins, or start a new session.' },
  )
}

// Opens the panel (reading the list afresh), or closes it when it is up.
async function togglePane($: EngineInterface): Promise<boolean> {
  const isOpen = (await $.ui.panes()).some(p => p.id === PANE)
  if (isOpen) {
    await $.ui.close({ id: PANE })
    return false
  }
  await $.ui.open({ id: PANE, title: 'Plugins & mods', closeOnEscape: true })
  void refresh($)
  return true
}

const fmtCount = (n: number): string => (n >= 1000 ? `${Math.round(n / 1000)}k` : String(n))

// `jimal-progress` → `Jimal Progress`.
const displayName = (name: string): string =>
  name
    .split(/[-_]/)
    .filter(Boolean)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')

// One glyph per kind, as a row's icon.
const iconOf = (p: Installed): string => (p.name === SELF ? '⚙' : p.kind === 'mod' ? '◈' : '▣')

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    await $.command.register({
      name: 'mods',
      description: 'Show or hide the plugins & mods panel: turn them on or off, install from your marketplaces',
    })
    return started
  })

  on('command.run', { command: 'mods' }, async $ => {
    const isOpen = await togglePane($)
    return { text: isOpen ? 'Plugins & mods panel opened.' : 'Plugins & mods panel closed.' }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const ui = $.ui.resolve(e)
    const { Box, Text, Button } = ui
    const Link = 'Link' in ui ? ui.Link : null
    const Input = 'Input' in ui ? ui.Input : null
    const c = await read($, catalog)
    const v = await read($, view)
    const isTerminal = e.surface === 'terminal'

    // A switch or tab: the surface's own primary button, its label dim while off, so its
    // frame and its hover shade are the surface's and match.
    const framed = (key: string, label: string, isOn: boolean, onPress: () => unknown) =>
      isTerminal ? (
        <Button key={key} label={isOn ? `[${label}]` : ` ${label} `} plain dimColor={!isOn} onPress={onPress} />
      ) : (
        <Button key={key} label={label} variant="primary" dimColor={!isOn} onPress={onPress} />
      )

    const enabled = c.installed.filter(p => p.isEnabled).length
    const summary =
      c.readAt === 0
        ? v.busy
          ? 'Reading the plugins…'
          : 'Not read yet: press ↻.'
        : `${c.installed.length} installed · ${enabled} on · ${c.marketplaces.length} marketplaces${v.busy ? (v.busy === 'refresh' ? ' · reading…' : ` · working on ${v.busy}…`) : ''}`

    const installedTab = (
      <Box flexDirection="column" rowGap={1}>
        {c.installed.map(p => (
          <Box key={`row-${p.id}`} flexDirection="row" alignItems="center" columnGap={2}>
            <Box width={2} flexShrink={0}>
              <Text dimColor>{iconOf(p)}</Text>
            </Box>
            <Box flexDirection="column" flexGrow={1} flexShrink={1} minWidth={0} overflow="hidden">
              <Box flexDirection="row" columnGap={1}>
                <Text bold>{displayName(p.name)}</Text>
                <Text dimColor wrap="truncate-end">{`${p.kind} · v${p.version} · ${p.marketplace}`}</Text>
              </Box>
              {p.description ? <Text dimColor wrap="truncate-end">{p.description}</Text> : null}
              {p.commands.length ? (
                <Text dimColor italic wrap="truncate-end">
                  {`${p.commands.slice(0, COMMAND_HINTS).join(' · ')}${p.commands.length > COMMAND_HINTS ? ' …' : ''}`}
                </Text>
              ) : null}
            </Box>
            {p.name === SELF ? (
              <Text dimColor>this panel</Text>
            ) : (
              framed(`toggle-${p.id}`, p.isEnabled ? 'On' : 'Off', p.isEnabled, () => change($, p.id, p.isEnabled ? 'disable' : 'enable'))
            )}
          </Box>
        ))}
      </Box>
    )

    const filter = v.filter.trim().toLowerCase()
    const listed = c.available
      .filter(a => a.marketplace === v.openMarketplace)
      .filter(a => !filter || a.name.toLowerCase().includes(filter) || a.description.toLowerCase().includes(filter))
      .sort((a, b) => b.installCount - a.installCount)
    const shownAvailable = listed.slice(0, AVAILABLE_ROWS)

    const marketsTab = (
      <Box flexDirection="column" rowGap={1}>
        {c.marketplaces.map(m => {
          const count = c.available.filter(a => a.marketplace === m.name).length
          const isOpen = v.openMarketplace === m.name
          return (
            <Box key={`market-${m.name}`} flexDirection="column">
              <Box flexDirection="row" alignItems="center" columnGap={2}>
                <Box width={2} flexShrink={0}>
                  <Text dimColor>⌂</Text>
                </Box>
                <Box flexDirection="column" flexGrow={1} flexShrink={1} minWidth={0} overflow="hidden">
                  <Text bold>{m.name}</Text>
                  <Text dimColor wrap="truncate-end">{`${m.repo ?? m.url ?? ''} · ${count} not installed`}</Text>
                </Box>
                {m.url && Link ? <Link href={m.url} label="GitHub ↗" /> : null}
                {framed(`market-open-${m.name}`, isOpen ? 'Hide' : 'Browse', isOpen, () =>
                  update($, view, prev => ({ ...prev, openMarketplace: prev.openMarketplace === m.name ? '' : m.name, filter: '' })),
                )}
              </Box>
              {isOpen ? (
                <Box flexDirection="column" paddingLeft={4} rowGap={1}>
                  {Input ? (
                    <Input
                      key="filter"
                      placeholder={`Filter ${m.name}`}
                      value={v.filter}
                      submitLabel="Filter"
                      onInput={value => update($, view, prev => ({ ...prev, filter: value }))}
                      onSubmit={value => update($, view, prev => ({ ...prev, filter: value }))}
                    />
                  ) : null}
                  {shownAvailable.map(a => (
                    <Box key={`avail-${a.id}`} flexDirection="row" alignItems="center" columnGap={2}>
                      <Box flexDirection="column" flexGrow={1} flexShrink={1} minWidth={0} overflow="hidden">
                        <Box flexDirection="row" columnGap={1}>
                          <Text bold>{displayName(a.name)}</Text>
                          <Text dimColor>{`${fmtCount(a.installCount)} installs`}</Text>
                        </Box>
                        <Text dimColor wrap="truncate-end">{a.description}</Text>
                      </Box>
                      {framed(`install-${a.id}`, 'Install', false, () => change($, a.id, 'install'))}
                    </Box>
                  ))}
                  {listed.length > shownAvailable.length ? (
                    <Text dimColor>{`+${listed.length - shownAvailable.length} more: filter to find one.`}</Text>
                  ) : null}
                  {listed.length === 0 ? <Text dimColor>Nothing to install here.</Text> : null}
                </Box>
              ) : null}
            </Box>
          )
        })}
      </Box>
    )

    return (
      <Box flexDirection="column" rowGap={1}>
        <Box flexDirection="row" alignItems="center" columnGap={1}>
          {framed('tab-installed', `Installed ${c.installed.length}`, v.tab === 'installed', () =>
            update($, view, prev => ({ ...prev, tab: 'installed' })),
          )}
          {framed('tab-marketplaces', `Marketplaces ${c.marketplaces.length}`, v.tab === 'marketplaces', () =>
            update($, view, prev => ({ ...prev, tab: 'marketplaces' })),
          )}
          <Box flexGrow={1} />
          {v.isDirty ? framed('reload', 'Reload now', true, () => reload($)) : null}
          <Button key="refresh" label="↻" plain dimColor onPress={() => refresh($)} />
          <Button key="close" label="✕" plain role="dismiss" onPress={() => $.ui.close({ id: PANE })} />
        </Box>
        <Text dimColor>{summary}</Text>
        {v.message ? <Text wrap="wrap">{v.message}</Text> : null}
        {v.tab === 'installed' ? installedTab : marketsTab}
      </Box>
    )
  })
}
