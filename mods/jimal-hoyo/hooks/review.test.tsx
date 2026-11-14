// Tests for the review round: control characters, error keeping, shown/hidden, races, repo safety, real shapes.
import { expect, test } from 'claude-code/testing'
import { PANE, REPO, RUN_A, RUN_B, envelope, logFile, openPane, runDoc, shown, statusData, statusFile, step, task, verbArgv, world } from './world'
import type { World } from './world'

const opts = { options: { repo: REPO } }
const composer = { kind: 'composer' } as const

// Real lines of an HSR upstream.log (run 20261114-225255-0f64): the level is wrapped in ANSI colour.
const HSR_LINE = '2026-11-14 22:56:02,311 | \u001b[92mINFO\u001b[0m | 开拓力: 0/300'
const HSR_LINE2 = '2026-11-14 22:54:30,997 | \u001b[92mINFO\u001b[0m | 切换到：\u001b[92m打开菜单\u001b[0m'

const idle = (w: World) => {
  w.handlers.status = () => ({ stdout: envelope(statusData()) })
}

const running = (w: World, over: Record<string, unknown> = {}) => {
  w.files[statusFile(RUN_A)] = JSON.stringify(
    runDoc({
      state: 'running',
      outcome: null,
      ended_at: null,
      current_game: 'hsr',
      steps: [step('zzz', { tasks: [task('a', 'done', '', true)] }), step('hsr', { state: 'running', outcome: '', ended_at: null })],
      ...over,
    }),
  )
  w.handlers.status = () => ({ stdout: envelope(statusData({ active_run: { run_id: RUN_A, state: 'running' } })) })
}

const ended = (w: World, doc: Record<string, unknown>) => {
  w.handlers.status = () => ({ stdout: envelope(statusData({ last_run: { run_id: doc.run_id } })) })
  w.files[statusFile(String(doc.run_id))] = JSON.stringify(doc)
}

const hasControl = (s: string) => /[\u0000-\u0008\u000b-\u001f\u007f]/.test(s)

// --- 1, 2: control characters -------------------------------------------------

test('an HSR log line with ANSI codes draws; the codes are gone and the stamp is cut', opts, async ($, on) => {
  const w = world($, on)
  running(w)
  w.files[logFile(RUN_A, 'hsr')] = [HSR_LINE2, HSR_LINE, ''].join('\n')
  const ui = await openPane($, w) // mount rejects a tree that holds a control character
  const s = await shown(ui)
  expect(s.texts).toContain('22:56:02 开拓力: 0/300')
  expect(hasControl(s.all)).toBe(false)
  await ui.unmount()
})

test('the reopened pane still draws: the stored line is clean', opts, async ($, on) => {
  const w = world($, on)
  running(w)
  w.files[logFile(RUN_A, 'hsr')] = HSR_LINE + '\u0007\n'
  const ui = await openPane($, w)
  await ui.unmount()
  const again = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(hasControl((await shown(again)).all)).toBe(false)
  await again.unmount()
})

test('hoyo logs output (fallback) with ANSI is cleaned too', opts, async ($, on) => {
  const w = world($, on)
  running(w)
  w.unreadable.add(logFile(RUN_A, 'hsr'))
  w.handlers.logs = () => ({ stdout: envelope({ lines: [HSR_LINE2, HSR_LINE] }) })
  const ui = await openPane($, w)
  expect((await shown(ui)).texts).toContain('22:56:02 开拓力: 0/300')
  expect(w.calls).toContainEqual(verbArgv(['logs', RUN_A, '--source', 'hsr', '--tail', '30']))
  await ui.unmount()
})

test('task names, reasons, needs_user, run message: control characters never reach the tree', opts, async ($, on) => {
  const w = world($, on)
  const dirty = (t: string) => `\u001b[31;1m${t}\u001b[0m\u0007\u0000`
  ended(
    w,
    runDoc({
      run_id: RUN_B,
      outcome: 'refused',
      message: dirty('worker refused'),
      needs_user: [{ game: 'zzz', code: 'x', message: dirty('请先登录') }],
      steps: [
        step('zzz', {
          tasks: [
            task('a', 'failed', dirty('出错'), true, dirty('咖啡店')),
            task('b', 'skipped', dirty('没有计划'), true, '体力刷本'),
          ],
        }),
      ],
    }),
  )
  const ui = await openPane($, w)
  const s = await shown(ui)
  expect(hasControl(s.all)).toBe(false)
  expect(s.texts).toContain('worker refused')
  expect(s.texts.some(t => t.includes('请先登录'))).toBe(true)
  expect(s.texts).toContain('失败　咖啡店')
  await ui.unmount()
})

test('pwsh error output with ANSI (not JSON) is cleaned', opts, async ($, on) => {
  const w = world($, on)
  w.handlers.status = () => ({ exitCode: 1, stdout: '', stderr: '\u001b[31;1mhoyo: boom\u001b[0m\n at line 1' })
  const ui = await openPane($, w)
  const s = await shown(ui)
  expect(s.texts).toContain('hoyo: boom')
  expect(hasControl(s.all)).toBe(false)
  await ui.unmount()
})

test('an error message from hoyo with ANSI is cleaned', opts, async ($, on) => {
  const w = world($, on)
  w.handlers.status = () => ({
    exitCode: 1,
    stdout: envelope({}, { ok: false, code: 1, error: { code: 'x', message: '\u001b[91mbad config\u001b[0m' } }),
  })
  const ui = await openPane($, w)
  expect((await shown(ui)).texts).toContain('bad config')
  await ui.unmount()
})

// --- 3: errors are kept --------------------------------------------------------

test('a command error survives disk refreshes while running and the 60 s idle refresh clock', opts, async ($, on) => {
  const w = world($, on)
  running(w)
  w.handlers.pause = () => ({ exitCode: 1, stdout: envelope({}, { ok: false, code: 1, error: { code: 'not_delivered', message: 'pause not delivered' } }) })
  const ui = await openPane($, w)
  await ui.press({ key: 'pause' })
  expect((await shown(ui)).texts).toContain('pause not delivered')
  await w.clock.advance(12_000) // four disk refreshes
  expect((await shown(ui)).texts).toContain('pause not delivered')
  await ui.unmount()
})

test('an error clears with the next user action, or after 60 s at a successful refresh', opts, async ($, on) => {
  const w = world($, on)
  idle(w)
  w.handlers.run = () => ({ exitCode: 4, stdout: envelope({}, { ok: false, code: 4, error: { code: 'busy', message: 'busy now' } }) })
  const ui = await openPane($, w)
  await ui.press({ key: 'run-all' })
  expect((await shown(ui)).texts).toContain('busy now')
  await w.clock.advance(30_000)
  expect((await shown(ui)).texts).toContain('busy now')
  await w.clock.advance(100_000)
  expect((await shown(ui)).texts).not.toContain('busy now')
  await ui.unmount()
})

test('an error clears with the next user action', opts, async ($, on) => {
  const w2 = world($, on)
  idle(w2)
  w2.handlers.run = () => ({ exitCode: 4, stdout: envelope({}, { ok: false, code: 4, error: { code: 'busy', message: 'busy now' } }) })
  const ui2 = await openPane($, w2)
  await ui2.press({ key: 'run-all' })
  w2.handlers.run = () => ({ stdout: envelope({ run_id: RUN_A }) })
  await ui2.press({ key: 'run-zzz' })
  expect((await shown(ui2)).texts).not.toContain('busy now')
  await ui2.unmount()
})

// --- 4: shown / hidden ----------------------------------------------------------

test('a covered pane starts no process and reads nothing; shown again it refreshes at once', opts, async ($, on) => {
  const w = world($, on)
  running(w)
  const ui = await openPane($, w)
  w.panes.isShown = false
  await w.clock.advance(2_000)
  const calls = w.calls.length
  const reads = w.reads.length
  await w.clock.advance(90_000)
  expect(w.calls.length).toBe(calls)
  expect(w.reads.length).toBe(reads)
  w.panes.isShown = true
  await w.clock.advance(1_500)
  expect(w.reads.length).toBeGreaterThan(reads)
  await ui.unmount()
})

test('a widget (small form) counts as shown', opts, async ($, on) => {
  const w = world($, on)
  idle(w)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run({ command: 'hoyo' })
  await w.clock.settle()
  const ui = await $.ui.mount({ ...PANE, props: { ...PANE.props, placement: 'widget' }, surface: 'desktop' })
  w.panes.isShown = false
  await w.clock.advance(65_000)
  expect(w.verbs().length).toBe(2)
  await ui.unmount()
})

// --- 5: timeout -------------------------------------------------------------------

test('run waits up to 200 s', opts, async ($, on) => {
  const w = world($, on)
  idle(w)
  w.handlers.run = () => ({ stdout: envelope({ run_id: RUN_A }) })
  const ui = await openPane($, w)
  await ui.press({ key: 'run-all' })
  expect(w.timeouts.run).toBe(200_000)
  await ui.unmount()
})

// --- 6: a refresh in flight when a command returns ------------------------------

test('a command waits for the refresh in flight, then refreshes again (no stale idle)', opts, async ($, on) => {
  const w = world($, on)
  let release: () => void = () => undefined
  const gate = new Promise<void>(r => (release = r))
  let n = 0
  w.files[statusFile(RUN_A)] = JSON.stringify(runDoc({ state: 'running', outcome: null, ended_at: null, current_game: 'zzz', steps: [step('zzz', { state: 'running', outcome: '' })] }))
  w.handlers.status = async () => {
    n++
    if (n === 2) {
      await gate
      return { stdout: envelope(statusData()) } // the old answer: idle
    }
    if (n === 1) return { stdout: envelope(statusData()) }
    return { stdout: envelope(statusData({ active_run: { run_id: RUN_A } })) }
  }
  w.handlers.run = () => ({ stdout: envelope({ run_id: RUN_A }) })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run({ command: 'hoyo' })
  await w.clock.settle()
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await w.clock.advance(61_000) // the idle poll starts (n = 2) and hangs
  const pressed = ui.press({ key: 'run-all' })
  await w.clock.settle()
  release()
  await pressed
  await w.clock.settle()
  expect(n).toBe(3)
  expect((await shown(ui)).texts.some(t => t.startsWith('运行中'))).toBe(true)
  await ui.unmount()
})

test('a refresh stuck for over 120 s is given up', opts, async ($, on) => {
  const w = world($, on)
  let release: () => void = () => undefined
  const gate = new Promise<void>(r => (release = r))
  let n = 0
  w.handlers.status = async () => {
    n++
    if (n === 1) await gate
    return { stdout: envelope(statusData()) }
  }
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run({ command: 'hoyo' })
  await w.clock.advance(125_000)
  expect(n).toBeGreaterThanOrEqual(2)
  release()
  await w.clock.settle()
})

// --- 7: first frame ---------------------------------------------------------------

test('before the first status answer the pane says loading and offers no start button', opts, async ($, on) => {
  const w = world($, on)
  let release: () => void = () => undefined
  const gate = new Promise<void>(r => (release = r))
  w.handlers.status = async () => {
    await gate
    return { stdout: envelope(statusData()) }
  }
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run({ command: 'hoyo' })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const s = await shown(ui)
  expect(s.texts).toContain('读取中…')
  expect(s.buttons).toEqual(['刷新'])
  expect(s.all.includes('还没跑')).toBe(false)
  release()
  await w.clock.settle()
  expect((await shown(ui)).buttons).toEqual(['刷新', '跑全部', '绝区零', '星铁'])
  await ui.unmount()
})

// --- 8: the repo folder is changed only by a person, and only to a drive path -------

const typed = async ($: Parameters<Parameters<typeof test>[1]>[0], args: string, origin: unknown) => {
  await $.command.run({ command: 'hoyo', args, origin } as never)
}

test('/hoyo repo from a plugin, the bridge or the SDK only opens the panel', async ($, on) => {
  const w = world($, on)
  idle(w)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  for (const origin of [{ kind: 'plugin', name: 'other' }, { kind: 'bridge' }, { kind: 'sdk' }]) {
    await typed($, `repo ${REPO}`, origin)
  }
  await w.clock.settle()
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const s = await shown(ui)
  expect(s.texts.some(t => t.includes('只有在输入框里亲自输入'))).toBe(true)
  expect(s.texts).toContain('还没有配置 HoYo 日常助手的位置。')
  expect(w.calls).toEqual([])
  await ui.unmount()
})

for (const bad of ['relative\\dir', '..\\x', 'C:rel', '\\\\server\\share\\hoyo', 'D:\\a\\..\\b', 'C:/forward']) {
  test(`/hoyo repo refuses ${bad}`, async ($, on) => {
    const w = world($, on)
    await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
    await typed($, `repo ${bad}`, composer)
    await w.clock.settle()
    const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
    const s = await shown(ui)
    expect(s.texts.some(t => t.includes('带盘符的绝对路径'))).toBe(true)
    expect(w.calls).toEqual([])
    await ui.unmount()
  })
}

test('an invalid settings value is reported and nothing is started', { options: { repo: 'relative\\dir' } }, async ($, on) => {
  const w = world($, on)
  const ui = await openPane($, w)
  const s = await shown(ui)
  expect(s.texts.some(t => t.includes('不合格'))).toBe(true)
  expect(s.texts).toContain('还没有配置 HoYo 日常助手的位置。')
  expect(w.calls).toEqual([])
  await ui.unmount()
})

test('an invalid stored value is reported and nothing is started', async ($, on) => {
  const w = world($, on, { store: { repo: '..\\evil' } })
  const ui = await openPane($, w)
  expect((await shown(ui)).texts.some(t => t.includes('不合格'))).toBe(true)
  expect(w.calls).toEqual([])
  await ui.unmount()
})

test('after a person saves a good folder the only command run is status', async ($, on) => {
  const w = world($, on)
  idle(w)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await typed($, `repo ${REPO}`, composer)
  await w.clock.settle()
  expect(w.verbs()).toEqual(['status'])
  expect(w.calls[0]).toEqual(verbArgv(['status', '--no-verify']))
})

// --- 9: the log ---------------------------------------------------------------------

test('the last meaningful log line: rules, banners and empty lines are skipped', opts, async ($, on) => {
  const w = world($, on)
  running(w)
  w.files[logFile(RUN_A, 'hsr')] = [
    '2026-11-14 22:56:02,311 | \u001b[92mINFO\u001b[0m | 正在清体力',
    '+----------------------+',
    '| 本次运行结果 |',
    '----- 完成 -----',
    '',
    '   ',
  ].join('\n')
  const ui = await openPane($, w)
  expect((await shown(ui)).texts).toContain('22:56:02 正在清体力')
  await ui.unmount()
})

test('log file read directly: no logs process, and it follows the file', opts, async ($, on) => {
  const w = world($, on)
  running(w)
  w.files[logFile(RUN_A, 'hsr')] = '2026-01-01 10:09:40,001 | INFO | first'
  const ui = await openPane($, w)
  w.files[logFile(RUN_A, 'hsr')] = '2026-01-01 10:09:40,001 | INFO | first\n2026-01-01 10:09:44,001 | INFO | second'
  await w.clock.advance(6_100)
  expect((await shown(ui)).texts).toContain('10:09:44 second')
  expect(w.verbs()).not.toContain('logs')
  await ui.unmount()
})

test('a log over 4 MiB falls back to hoyo logs, at most every 20 s', opts, async ($, on) => {
  const w = world($, on)
  running(w)
  w.unreadable.add(logFile(RUN_A, 'hsr'))
  w.handlers.logs = () => ({ stdout: envelope({ lines: ['2026-01-01 10:09:40,001 | INFO | a line'] }) })
  const ui = await openPane($, w)
  expect(w.verbs().filter(v => v === 'logs').length).toBe(1)
  await w.clock.advance(15_000)
  expect(w.verbs().filter(v => v === 'logs').length).toBe(1)
  await w.clock.advance(7_000)
  expect(w.verbs().filter(v => v === 'logs').length).toBe(2)
  await ui.unmount()
})

test('a log that is not there yet shows nothing and starts no process', opts, async ($, on) => {
  const w = world($, on)
  running(w)
  const ui = await openPane($, w)
  expect(w.verbs()).toEqual(['status'])
  await w.clock.advance(10_000)
  expect(w.verbs()).toEqual(['status'])
  await ui.unmount()
})

test('the log line is dropped when the current game changes', opts, async ($, on) => {
  const w = world($, on)
  running(w, { current_game: 'zzz', steps: [step('zzz', { state: 'running', outcome: '' }), step('hsr', { state: 'pending', outcome: '' })] })
  w.files[logFile(RUN_A, 'zzz')] = '[10:09:50.100] [x.py 1] [INFO]: zzz is working'
  const ui = await openPane($, w)
  expect((await shown(ui)).texts).toContain('10:09:50 zzz is working')
  w.files[statusFile(RUN_A)] = JSON.stringify(
    runDoc({ state: 'running', outcome: null, ended_at: null, current_game: 'hsr', steps: [step('zzz', {}), step('hsr', { state: 'running', outcome: '' })] }),
  )
  await w.clock.advance(6_100)
  expect((await shown(ui)).all.includes('zzz is working')).toBe(false)
  await ui.unmount()
})

test('status.json unreadable: status and result are retried at most every 15 s', opts, async ($, on) => {
  const w = world($, on)
  running(w)
  delete w.files[statusFile(RUN_A)]
  w.handlers.result = () => ({ stdout: envelope(runDoc({ state: 'running', outcome: null, ended_at: null, current_game: 'zzz', steps: [step('zzz', { state: 'running', outcome: '' })] })) })
  const ui = await openPane($, w)
  const first = w.calls.length
  expect(first).toBeGreaterThanOrEqual(2) // status, result
  await w.clock.advance(12_000)
  expect(w.calls.length).toBe(first)
  await w.clock.advance(6_000)
  expect(w.calls.length).toBeGreaterThan(first)
  await ui.unmount()
})

// --- other findings ---------------------------------------------------------------------

test('step-level needs_user is summarised when the run has none', opts, async ($, on) => {
  const w = world($, on)
  ended(w, runDoc({ run_id: RUN_B, steps: [step('hsr', { needs_user: [{ game: 'hsr', code: 'login_expired', message: '登录已过期' }] }), step('zzz', {})] }))
  const ui = await openPane($, w)
  const s = await shown(ui)
  expect(s.texts).toContain('需要你处理')
  expect(s.texts.some(t => t.includes('登录已过期'))).toBe(true)
  await ui.unmount()
})

test('stopping, dry run and a refused run message', opts, async ($, on) => {
  const w = world($, on)
  running(w, { state: 'stopping' })
  const ui = await openPane($, w)
  expect((await shown(ui)).texts.some(t => t.startsWith('停止中'))).toBe(true)
  await ui.unmount()
})

test('a dry run is marked', opts, async ($, on) => {
  const w2 = world($, on)
  ended(w2, runDoc({ run_id: RUN_B, outcome: 'ok', dry_run: true, steps: [step('zzz', { outcome: 'ok' }), step('hsr', { outcome: 'ok' })] }))
  const ui2 = await openPane($, w2)
  expect((await shown(ui2)).texts).toContain('完成（演练）')
  await ui2.unmount()
})

test('a refused run shows its message', opts, async ($, on) => {
  const w3 = world($, on)
  ended(w3, runDoc({ run_id: RUN_B, outcome: 'refused', message: 'zzz_path_outside_root', steps: [] }))
  const ui3 = await openPane($, w3)
  expect((await shown(ui3)).texts).toContain('zzz_path_outside_root')
  await ui3.unmount()
})

test('isPlaced false stops the ticker even while the pane is hidden-then-closed', opts, async ($, on) => {
  const w = world($, on)
  idle(w)
  const ui = await openPane($, w)
  w.panes.isShown = false
  w.panes.isPlaced = false
  await w.clock.advance(3_000)
  const asked = w.panesCalls()
  await w.clock.advance(30_000)
  expect(w.panesCalls()).toBe(asked)
  await ui.unmount()
})

// --- real shapes (copied from the structure of real runs, personal data removed) ----------

const realStep = (game: string, over: Record<string, unknown>) => ({
  game,
  state: 'finished',
  outcome: 'partial',
  forced: false,
  started_at: '2026-01-01T10:00:02+11:00',
  ended_at: '2026-01-01T10:01:30+11:00',
  exit_code: 0,
  command: ['C:\\State\\envs\\zzz\\python.exe', '-X', 'utf8', '-I', '-B', 'C:\\State\\runners\\zzz_run.py', '-i', '1'],
  pid: 1234,
  pid_create_time: 1794657176.8,
  tasks: [],
  needs_user: [],
  error: '',
  upstream_run_id: '',
  log_files: ['C:\\State\\runs\\x\\zzz\\upstream.log'],
  orphan_pids: [],
  ...over,
})

const done = (id: string, name: string) =>
  ({ ...task(id, 'done', 'already done earlier today; upstream skipped it (应用已完成)', true, name), evidence: ['[22:53:03.293] [operation.py 451] [INFO]: 指令 ...', 'run record: run_status=1'] })

test('real shape: a forced stop (reason with the forced note, OneDragon disabled tasks)', opts, async ($, on) => {
  const w = world($, on)
  const disabled = ['恶名狩猎', '迷失之地', '枯萎之都', '零号业绩速刷', '式舆防卫战'].map((n, i) => task(`d${i}`, 'not_run', 'disabled in OneDragon (_group.yml)', true, n))
  ended(
    w,
    runDoc({
      run_id: RUN_B,
      outcome: 'force_stopped',
      games: ['zzz'],
      elevation: { mode: 'uac', elevated: true },
      worker: { pid: 99, create_time: 1794657175.7 },
      steps: [
        realStep('zzz', {
          outcome: 'force_stopped',
          forced: true,
          tasks: [
            done('a', '兑换码'), done('b', '邮件'), done('c', '每日签到'), done('d', '录像店营业'), done('e', '咖啡店'),
            task('f', 'not_run', "stopped by user (was in progress) (forced: the upstream process was ended) (run record left at 'running')", true, '体力刷本'),
            task('g', 'not_run', 'not reached: the run was force-stopped by request before this app (its run record says success earlier today)', true, '活跃度奖励'),
            task('h', 'not_run', 'not reached: the run was force-stopped by request before this app (its run record says success earlier today)', true, '丽都城募'),
            task('i', 'not_run', 'not reached: the run was force-stopped by request before this app (its run record says success earlier today)', true, '丽都周纪 (领奖励)'),
            ...disabled,
          ],
        }),
      ],
    }),
  )
  const ui = await openPane($, w)
  const s = await shown(ui)
  expect(s.texts).toContain('强制停止')
  expect(s.texts).toContain('已完成 5 项')
  expect(s.texts).toContain('被停止打断　体力刷本')
  expect(s.texts).toContain('没执行 3 项')
  expect(s.all.includes('恶名狩猎')).toBe(false)
  expect(s.all.includes('星穹铁道')).toBe(false) // the run had one game
  await ui.unmount()
})

test('real shape: a partial run of both games with skipped reasons and a needs_user from the step', opts, async ($, on) => {
  const w = world($, on)
  ended(
    w,
    runDoc({
      run_id: RUN_B,
      outcome: 'partial',
      steps: [
        realStep('zzz', {
          tasks: [
            done('a', '兑换码'),
            { ...task('charge_plan', 'skipped', '没有可运行的计划（找不到 代理人方案培养）; stamina 480 -> 480, 0 battles', true, '体力刷本'), evidence: ['x'] },
          ],
          needs_user: [{ game: 'zzz', code: 'set_training_target', message: '体力刷本没有找到「代理人方案培养」目标，请在游戏里设置培养目标。' }],
        }),
        realStep('hsr', {
          state: 'finished',
          outcome: 'partial',
          tasks: [task('stamina', 'done', 'unverified: upstream reports success', false, '清体力'), task('daily', 'done', '', true, '每日实训')],
        }),
      ],
      needs_user: [{ game: 'zzz', code: 'set_training_target', message: '体力刷本没有找到「代理人方案培养」目标，请在游戏里设置培养目标。' }],
    }),
  )
  const ui = await openPane($, w)
  const s = await shown(ui)
  expect(s.texts).toContain('部分完成')
  expect(s.texts).toContain('大概率完成　清体力')
  expect(s.texts.filter(t => t.includes('培养目标')).length).toBe(1) // not doubled: run level wins
  expect(s.texts.some(t => t.startsWith('　　没有可运行的计划'))).toBe(true)
  await ui.unmount()
})
