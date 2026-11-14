// Third round: log levels, repo hint, error-first, bounded wait, control characters in the folder, log stat.
import { expect, test } from 'claude-code/testing'
import { PANE, REPO, RUN_A, envelope, logFile, openPane, runDoc, shown, statusData, statusFile, step, world } from './world'
import type { World } from './world'

const opts = { options: { repo: REPO } }

const running = (w: World) => {
  w.files[statusFile(RUN_A)] = JSON.stringify(
    runDoc({
      state: 'running',
      outcome: null,
      ended_at: null,
      current_game: 'hsr',
      steps: [step('hsr', { state: 'running', outcome: '', ended_at: null })],
      games: ['hsr'],
    }),
  )
  w.handlers.status = () => ({ stdout: envelope(statusData({ active_run: { run_id: RUN_A, state: 'running' } })) })
}

const hsr = (level: string, text: string) => `2026-11-14 22:56:02,311 | \u001b[92m${level}\u001b[0m | ${text}`
const zzz = (level: string, text: string) => `[22:53:01.164] [application_launcher.py 52] [${level}]: ${text}`

test('a DEBUG line at the end of the HSR log is not shown; the last INFO line is', opts, async ($, on) => {
  const w = world($, on)
  running(w)
  w.files[logFile(RUN_A, 'hsr')] = [hsr('INFO', '开拓力: 0/300'), hsr('DEBUG', 'OCR识别结果: UID 123456789')].join('\n')
  const ui = await openPane($, w)
  const s = await shown(ui)
  expect(s.texts).toContain('22:56:02 开拓力: 0/300')
  expect(s.all.includes('UID')).toBe(false)
  await ui.unmount()
})

test('a log that is all DEBUG shows no log line', opts, async ($, on) => {
  const w = world($, on)
  running(w)
  w.files[logFile(RUN_A, 'hsr')] = [hsr('DEBUG', 'a'), hsr('DEBUG', 'OCR识别结果: UID 123456789')].join('\n')
  const ui = await openPane($, w)
  const s = await shown(ui)
  expect(s.all.includes('UID')).toBe(false)
  expect(s.texts.some(t => /^\d\d:\d\d:\d\d /.test(t))).toBe(false)
  await ui.unmount()
})

test('a ZZZ DEBUG line is not shown; ZZZ INFO is cut to time and text', opts, async ($, on) => {
  const w = world($, on)
  running(w)
  w.files[statusFile(RUN_A)] = JSON.stringify(
    runDoc({ state: 'running', outcome: null, ended_at: null, current_game: 'zzz', games: ['zzz'], steps: [step('zzz', { state: 'running', outcome: '' })] }),
  )
  w.files[logFile(RUN_A, 'zzz')] = [zzz('INFO', '正在加载OCR模型'), zzz('DEBUG', '识别到 UID 123456789')].join('\n')
  const ui = await openPane($, w)
  const s = await shown(ui)
  expect(s.texts).toContain('22:53:01 正在加载OCR模型')
  expect(s.all.includes('UID')).toBe(false)
  await ui.unmount()
})

test('the hoyo logs fallback is filtered the same way', opts, async ($, on) => {
  const w = world($, on)
  running(w)
  w.unreadable.add(logFile(RUN_A, 'hsr'))
  w.handlers.logs = () => ({ stdout: envelope({ lines: [hsr('INFO', '开拓力: 0/300'), hsr('DEBUG', 'OCR识别结果: UID 123456789')] }) })
  const ui = await openPane($, w)
  const s = await shown(ui)
  expect(s.texts).toContain('22:56:02 开拓力: 0/300')
  expect(s.all.includes('UID')).toBe(false)
  await ui.unmount()
})

test('an unchanged log file (same size and mtime) is not read again; reads are at most every 6 s', opts, async ($, on) => {
  const w = world($, on)
  running(w)
  const path = logFile(RUN_A, 'hsr')
  w.files[path] = hsr('INFO', 'one')
  const ui = await openPane($, w)
  const readsOf = () => w.reads.filter(p => p === path).length
  expect(readsOf()).toBe(1)
  await w.clock.advance(30_000) // status.json is read every 3 s, the log is only stat-ed
  expect(readsOf()).toBe(1)
  expect(w.stats.filter(p => p === path).length).toBeLessThanOrEqual(6)
  w.files[path] = [hsr('INFO', 'one'), hsr('INFO', 'two')].join('\n')
  await w.clock.advance(6_100)
  expect(readsOf()).toBe(2)
  expect((await shown(ui)).texts).toContain('22:56:02 two')
  await ui.unmount()
})

test('a refused /hoyo repo points to the plugin setting', async ($, on) => {
  const w = world($, on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run({ command: 'hoyo', args: `repo ${REPO}`, origin: { kind: 'plugin', name: 'x' } } as never)
  await w.clock.settle()
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await shown(ui)).texts.some(t => t.includes('只有在输入框里亲自输入') && t.includes('插件设置里填 repo'))).toBe(true)
  await ui.unmount()
})

test('a folder with a control character is refused, not turned into another folder', async ($, on) => {
  const w = world($, on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  // the cleaned form would be a real, valid folder
  await $.command.run({ command: 'hoyo', args: `repo ${REPO}\u0007`, origin: { kind: 'composer' } } as never)
  await w.clock.settle()
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const s = await shown(ui)
  expect(s.texts.some(t => t.includes('带盘符的绝对路径'))).toBe(true)
  expect(s.all.includes('已保存')).toBe(false)
  expect(w.calls).toEqual([])
  await ui.unmount()
})

test('a settings value with a control character counts as not configured', { options: { repo: `${REPO}\u0007` } }, async ($, on) => {
  const w = world($, on)
  const ui = await openPane($, w)
  expect((await shown(ui)).texts.some(t => t.includes('不合格'))).toBe(true)
  expect(w.calls).toEqual([])
  await ui.unmount()
})

test('a command error shows at once, before a stuck refresh ends', opts, async ($, on) => {
  const w = world($, on)
  let release: () => void = () => undefined
  const gate = new Promise<void>(r => (release = r))
  let n = 0
  w.handlers.status = async () => {
    n++
    if (n === 2) await gate
    return { stdout: envelope(statusData()) }
  }
  w.handlers.run = () => ({ exitCode: 4, stdout: envelope({}, { ok: false, code: 4, error: { code: 'busy', message: 'busy now' } }) })
  const ui = await openPane($, w)
  await w.clock.advance(61_000) // the idle poll (n = 2) hangs
  const pressed = ui.press({ key: 'run-all' })
  await w.clock.settle()
  expect((await shown(ui)).texts).toContain('busy now') // shown while the old refresh is still stuck
  release()
  await pressed
  expect((await shown(ui)).texts).toContain('busy now')
  await ui.unmount()
})

test('the wait for an old refresh is bounded (about 120 s), then a new refresh runs', opts, async ($, on) => {
  const w = world($, on)
  let n = 0
  const gate = new Promise<void>(() => undefined) // never released
  w.handlers.status = async () => {
    n++
    if (n === 2) await gate
    return { stdout: envelope(statusData()) }
  }
  w.handlers.run = () => ({ stdout: envelope({ run_id: RUN_A }) })
  const ui = await openPane($, w)
  await w.clock.advance(61_000)
  const pressed = ui.press({ key: 'run-all' })
  await w.clock.advance(125_000)
  await pressed
  expect(n).toBeGreaterThanOrEqual(3)
  await ui.unmount()
})
