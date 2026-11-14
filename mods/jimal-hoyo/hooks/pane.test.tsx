import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import {
  PANE, REPO, RUN_A, RUN_B, envelope, logFile, openPane, runDoc, shown, statusData, statusFile, step, task, verbArgv, world,
} from './world'
import type { World } from './world'

const opts = { options: { repo: REPO } }

const idleStatus = (w: World, today: Record<string, unknown> = { zzz: null, hsr: null }) => {
  w.handlers.status = () => ({ stdout: envelope(statusData({ today })) })
}

// A run in progress: status says active, status.json on disk holds the run.
const runningDoc = (over: Record<string, unknown> = {}) =>
  runDoc({
    state: 'running',
    outcome: null,
    ended_at: null,
    current_game: 'hsr',
    steps: [
      step('zzz', {
        tasks: [task('a', 'done', '', true), task('b', 'done', '', true), task('c', 'skipped', '没有可运行的计划', true, '体力刷本')],
      }),
      step('hsr', { state: 'running', outcome: '', ended_at: null }),
    ],
    ...over,
  })

const running = (w: World, doc = runningDoc()) => {
  w.files[statusFile(RUN_A)] = JSON.stringify(doc)
  w.handlers.status = () => ({ stdout: envelope(statusData({ active_run: { run_id: RUN_A, state: 'running' } })) })
  w.files[logFile(RUN_A, 'hsr')] = ['2026-01-01 10:09:40,001 | INFO | older line', '2026-01-01 10:09:50,001 | INFO | 正在领取每日奖励', '', ''].join('\n')
}

const ended = (w: World, doc: Record<string, unknown>) => {
  w.handlers.status = () => ({
    stdout: envelope(statusData({ last_run: { run_id: doc.run_id }, today: { zzz: { run_id: 'x', outcome: 'partial' }, hsr: null } })),
  })
  w.files[statusFile(String(doc.run_id))] = JSON.stringify(doc)
}

const STARTERS = ['跑全部', '绝区零', '星铁']

for (const surface of ['terminal', 'desktop'] as const) {
  test(`${surface}: idle shows today's results, three start buttons and the note`, opts, async ($, on) => {
    const w = world($, on)
    idleStatus(w, { zzz: { run_id: 'r', outcome: 'ok' }, hsr: null })
    await $.session.start({ cwd: '/', surface, isInteractive: true })
    await $.command.run({ command: 'hoyo' })
    await w.clock.settle()
    const ui = await $.ui.mount({ ...PANE, surface })
    const s = await shown(ui)
    expect(s.texts).toContain('每日助手')
    expect(s.texts).toContain('空闲')
    expect(s.texts).toContain('今天')
    expect(s.texts).toContain('绝区零　已完成')
    expect(s.texts).toContain('星穹铁道　还没跑')
    expect(s.texts).toContain('开跑后不要碰鼠标键盘。')
    expect(s.buttons).toEqual(['刷新', ...STARTERS])
    await ui.unmount()
  })
}

test('today: every outcome has its word', opts, async ($, on) => {
  const w = world($, on)
  idleStatus(w, { zzz: { run_id: 'r', outcome: 'partial' }, hsr: { run_id: 'r', outcome: 'force_stopped' } })
  const ui = await openPane($, w)
  const s = await shown(ui)
  expect(s.texts).toContain('绝区零　部分完成')
  expect(s.texts).toContain('星穹铁道　强制停止')
  await ui.unmount()
})

test('running: elapsed time, finished game results, current game with the last log line', opts, async ($, on) => {
  const w = world($, on)
  running(w)
  const ui = await openPane($, w)
  const s = await shown(ui)
  // started 10:00:01, the mocked clock reads 10:10:00
  expect(s.texts).toContain('运行中 9:59')
  expect(s.texts.some(t => t.startsWith('绝区零') && t.includes('部分完成') && t.includes('10:05 结束'))).toBe(true)
  expect(s.texts).toContain('已完成 2 项')
  expect(s.texts).toContain('跳过　体力刷本')
  expect(s.texts).toContain('星穹铁道　进行中')
  expect(s.texts).toContain('10:09:50 正在领取每日奖励')
  expect(s.buttons).toEqual(['刷新', '暂停', '停止'])
  // the log line comes from the file: no logs process
  expect(w.verbs()).not.toContain('logs')
  await ui.unmount()
})

test('running: a game not reached yet waits; paused offers Resume', opts, async ($, on) => {
  const w = world($, on)
  running(
    w,
    runningDoc({ paused: true, current_game: 'zzz', steps: [step('zzz', { state: 'running', outcome: '', ended_at: null }), step('hsr', { state: 'pending', outcome: '' })] }),
  )
  const ui = await openPane($, w)
  const s = await shown(ui)
  expect(s.texts).toContain('绝区零　进行中')
  expect(s.texts).toContain('星穹铁道　等待')
  expect(s.texts.some(t => t.includes('已暂停'))).toBe(true)
  expect(s.buttons).toEqual(['刷新', '继续', '停止'])
  await ui.unmount()
})

test('ended: grouped results, needs_user block, start buttons again', opts, async ($, on) => {
  const w = world($, on)
  ended(
    w,
    runDoc({
      run_id: RUN_B,
      needs_user: [{ game: 'zzz', code: 'set_training_target', message: '请先设置培养目标' }],
      steps: [
        step('zzz', {
          ended_at: '2026-01-01T10:05:09+00:00',
          tasks: [
            task('a', 'done', '', true),
            task('b', 'done', 'unverified: guess', false, '迷失之地'),
            task('c', 'skipped', '没有可运行的计划', true, '体力刷本'),
            task('d', 'failed', '出错了', true, '咖啡店'),
            task('e', 'not_run', 'stopped by user (was in progress)', true, '录像店'),
            task('f', 'not_run', 'disabled in upstream config', true, '隐藏项'),
            task('g', 'not_run', 'not reached: x', true),
          ],
        }),
        step('hsr', { outcome: 'ok', ended_at: '2026-01-01T10:19:59+00:00', tasks: [task('x', 'done', '', true)] }),
      ],
    }),
  )
  const ui = await openPane($, w)
  const s = await shown(ui)
  expect(s.texts).toContain('部分完成')
  expect(s.texts).toContain('需要你处理')
  expect(s.texts.some(t => t.includes('请先设置培养目标'))).toBe(true)
  expect(s.texts.some(t => t.startsWith('绝区零') && t.includes('10:05 结束'))).toBe(true)
  expect(s.texts.some(t => t.startsWith('星穹铁道') && t.includes('10:19 结束'))).toBe(true)
  for (const line of ['已完成 1 项', '大概率完成　迷失之地', '跳过　体力刷本', '没有可运行的计划', '失败　咖啡店', '出错了', '被停止打断　录像店', '没执行 1 项', '已完成 1 项']) {
    expect(s.texts.some(t => t.includes(line))).toBe(true)
  }
  expect(s.all.includes('隐藏项')).toBe(false)
  expect(s.buttons).toEqual(['刷新', ...STARTERS])
  await ui.unmount()
})

for (const [outcome, word] of [
  ['ok', '完成'], ['partial', '部分完成'], ['failed', '失败'], ['stopped', '已停止'], ['force_stopped', '强制停止'],
  ['refused', '被拒绝'], ['timeout', '超时'], ['aborted', '中止'], ['orphaned', '有残留进程'],
] as const) {
  test(`ended marker: ${outcome} reads ${word}`, opts, async ($, on) => {
    const w = world($, on)
    ended(w, runDoc({ run_id: RUN_B, outcome, steps: [step('zzz', { outcome }), step('hsr', { outcome })] }))
    const ui = await openPane($, w)
    expect((await shown(ui)).texts).toContain(word)
    await ui.unmount()
  })
}

test('ended: a game that was never reached says so', opts, async ($, on) => {
  const w = world($, on)
  ended(w, runDoc({ run_id: RUN_B, outcome: 'stopped', steps: [step('zzz', { outcome: 'stopped' }), step('hsr', { state: 'pending', outcome: 'not_run', ended_at: '' })] }))
  const ui = await openPane($, w)
  expect((await shown(ui)).texts).toContain('没执行')
  await ui.unmount()
})

test('an old ended run leaves the panel idle', opts, async ($, on) => {
  const w = world($, on)
  ended(w, runDoc({ run_id: RUN_B, ended_at: '2025-12-31T01:00:00+00:00' }))
  const ui = await openPane($, w)
  expect((await shown(ui)).texts).toContain('空闲')
  await ui.unmount()
})

// --- buttons --------------------------------------------------------------

const press = async ($: Engine, w: World, key: string, setup: (w: World) => void) => {
  setup(w)
  const ui = await openPane($, w)
  w.calls.length = 0
  await ui.press({ key })
  await ui.unmount()
}

const startOk = (w: World) => {
  idleStatus(w)
  w.handlers.run = () => ({ stdout: envelope({ run_id: RUN_A }) })
}
const runningOk = (w: World) => {
  running(w)
  for (const v of ['pause', 'resume', 'stop']) w.handlers[v] = () => ({ stdout: envelope({}) })
}

for (const [key, verb] of [
  ['run-all', ['run', 'all', '--detach']],
  ['run-zzz', ['run', 'zzz', '--detach']],
  ['run-hsr', ['run', 'hsr', '--detach']],
] as const) {
  test(`button ${key} sends ${verb.join(' ')} at once, no confirmation`, opts, async ($, on) => {
    const w = world($, on)
    await press($, w, key, startOk)
    expect(w.calls[0]).toEqual(verbArgv([...verb]))
    // after the call the pane refreshes
    expect(w.verbs()).toContain('status')
  })
}

for (const [key, verb] of [['pause', 'pause'], ['stop', 'stop']] as const) {
  test(`button ${key} sends ${verb}`, opts, async ($, on) => {
    const w = world($, on)
    await press($, w, key, runningOk)
    expect(w.calls[0]).toEqual(verbArgv([verb]))
  })
}

test('button resume sends resume when the run is paused', opts, async ($, on) => {
  const w = world($, on)
  await press($, w, 'resume', w => {
    running(w, runningDoc({ paused: true }))
    w.handlers.resume = () => ({ stdout: envelope({}) })
  })
  expect(w.calls[0]).toEqual(verbArgv(['resume']))
})

test('timeouts: run 200 s, stop 120 s, pause 60 s, reads 30 s', opts, async ($, on) => {
  const w = world($, on)
  runningOk(w)
  w.handlers.run = () => ({ stdout: envelope({ run_id: RUN_A }) })
  const ui = await openPane($, w)
  await ui.press({ key: 'pause' })
  await ui.press({ key: 'stop' })
  await ui.unmount()
  expect(w.timeouts.status).toBe(30_000)
  expect(w.timeouts.pause).toBe(60_000)
  expect(w.timeouts.stop).toBe(120_000)
})

test('timeout of run is 150 s', opts, async ($, on) => {
  const w = world($, on)
  await press($, w, 'run-all', startOk)
  expect(w.timeouts.run).toBe(200_000)
})

test('a second click while a command runs is ignored, and the button shows the busy label', opts, async ($, on) => {
  const w = world($, on)
  startOk(w)
  let release: () => void = () => undefined
  const gate = new Promise<void>(r => (release = r))
  w.handlers.run = async () => {
    await gate
    return { stdout: envelope({ run_id: RUN_A }) }
  }
  const ui = await openPane($, w)
  const first = ui.press({ key: 'run-all' })
  await w.clock.settle()
  const during = await shown(ui)
  expect(during.buttons).toEqual(['刷新', '启动中…', '启动中…', '启动中…'])
  const second = ui.press({ key: 'run-zzz' })
  const third = ui.press({ key: 'run-all' })
  await w.clock.settle()
  release()
  await Promise.all([first, second, third])
  expect(w.verbs().filter(v => v === 'run')).toHaveLength(1)
  expect((await shown(ui)).buttons).toEqual(['刷新', ...STARTERS])
  await ui.unmount()
})

// --- errors -----------------------------------------------------------------

const failRun = (w: World, code: number, message: string, errCode = 'x') => {
  idleStatus(w)
  w.handlers.run = () => ({ exitCode: code, stdout: envelope({}, { ok: false, code, error: { code: errCode, message } }) })
}

for (const [code, hint] of [
  [4, '已有运行在进行，或上一次运行还占着锁'],
  [5, '工作进程没能启动（UAC 被拒绝，或没人点）'],
  [6, '没有正在进行的运行'],
] as const) {
  test(`exit code ${code}: the hint and the message from hoyo are shown`, opts, async ($, on) => {
    const w = world($, on)
    failRun(w, code, `hoyo says ${code}`)
    const ui = await openPane($, w)
    await ui.press({ key: 'run-all' })
    const s = await shown(ui)
    expect(s.texts.some(t => t.includes(hint))).toBe(true)
    expect(s.texts).toContain(`hoyo says ${code}`)
    await ui.unmount()
  })
}

test('ok: false with another code shows just the message', opts, async ($, on) => {
  const w = world($, on)
  failRun(w, 1, 'local config not found', 'launcher')
  const ui = await openPane($, w)
  await ui.press({ key: 'run-zzz' })
  const s = await shown(ui)
  expect(s.texts).toContain('local config not found')
  expect(s.all.includes('已有运行')).toBe(false)
  await ui.unmount()
})

test('a command that cannot start or times out is shown', opts, async ($, on) => {
  const w = world($, on)
  idleStatus(w)
  w.handlers.run = () => {
    throw new Error('timed out after 150000 ms')
  }
  const ui = await openPane($, w)
  await ui.press({ key: 'run-all' })
  expect((await shown(ui)).texts.some(t => t.includes('命令没能运行或超时'))).toBe(true)
  await ui.unmount()
})

test('output that is not JSON is shown, with the exit code', opts, async ($, on) => {
  const w = world($, on)
  w.handlers.status = () => ({ exitCode: 1, stdout: '', stderr: 'pwsh: boom' })
  const ui = await openPane($, w)
  const s = await shown(ui)
  expect(s.texts.some(t => t.includes('退出码 1'))).toBe(true)
  expect(s.texts).toContain('pwsh: boom')
  await ui.unmount()
})

test('a failed status keeps the buttons usable and shows the error', opts, async ($, on) => {
  const w = world($, on)
  w.handlers.status = () => ({ exitCode: 1, stdout: envelope({}, { ok: false, code: 1, error: { code: 'launcher', message: 'the app env is missing' } }) })
  const ui = await openPane($, w)
  const s = await shown(ui)
  expect(s.texts).toContain('the app env is missing')
  expect(s.buttons).toEqual(['刷新', ...STARTERS])
  await ui.unmount()
})

// --- repository path ----------------------------------------------------------

test('no repo configured: the pane says how to set it and starts no process', async ($, on) => {
  const w = world($, on)
  const ui = await openPane($, w)
  const s = await shown(ui)
  expect(s.texts).toContain('还没有配置 HoYo 日常助手的位置。')
  expect(s.all.includes('/hoyo repo')).toBe(true)
  expect(s.all.includes('repo（')).toBe(true)
  expect(w.calls).toEqual([])
  await ui.unmount()
})

test('/hoyo repo <path> saves it in the store and the pane then reads status', async ($, on) => {
  const w = world($, on)
  idleStatus(w)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run({ command: 'hoyo', args: `repo ${REPO}\\`, origin: { kind: 'composer' } } as never)
  await w.clock.settle()
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const s = await shown(ui)
  expect(s.texts.some(t => t.includes('已保存仓库路径'))).toBe(true)
  expect(w.calls[0]).toEqual(verbArgv(['status', '--no-verify']))
  await ui.unmount()
})

test('/hoyo repo with a folder that has no hoyo.ps1 is refused', async ($, on) => {
  const w = world($, on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run({ command: 'hoyo', args: 'repo C:\\Nowhere', origin: { kind: 'composer' } } as never)
  await w.clock.settle()
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await shown(ui)).texts.some(t => t.includes('找不到') && t.includes('hoyo.ps1'))).toBe(true)
  await ui.unmount()
})

test('a repo saved by /hoyo repo is used in a later session', { options: {} }, async ($, on) => {
  const w = world($, on, { store: { repo: REPO } })
  idleStatus(w)
  const ui = await openPane($, w)
  expect(w.calls[0]).toEqual(verbArgv(['status', '--no-verify']))
  await ui.unmount()
})

// --- polling and timers -------------------------------------------------------

test('running is followed from status.json on disk, no status process per tick', opts, async ($, on) => {
  const w = world($, on)
  running(w)
  const ui = await openPane($, w)
  const statusBefore = w.verbs().filter(v => v === 'status').length
  expect(statusBefore).toBe(1)
  await w.clock.advance(12_000)
  expect(w.verbs().filter(v => v === 'status').length).toBe(1)
  // the disk document changes: the pane follows it
  w.files[statusFile(RUN_A)] = JSON.stringify(runningDoc({ paused: true }))
  await w.clock.advance(3_000)
  expect((await shown(ui)).buttons).toContain('继续')
  await ui.unmount()
})

test('if status.json cannot be read, status and result take over', opts, async ($, on) => {
  const w = world($, on)
  running(w)
  delete w.files[statusFile(RUN_A)]
  w.handlers.result = () => ({ stdout: envelope(runningDoc()) })
  const ui = await openPane($, w)
  expect(w.verbs()).toContain('result')
  expect((await shown(ui)).texts).toContain('星穹铁道　进行中')
  await ui.unmount()
})

test('idle refreshes once a minute', opts, async ($, on) => {
  const w = world($, on)
  idleStatus(w)
  const ui = await openPane($, w)
  expect(w.verbs()).toEqual(['status'])
  await w.clock.advance(50_000)
  expect(w.verbs()).toEqual(['status'])
  await w.clock.advance(11_000)
  expect(w.verbs()).toEqual(['status', 'status'])
  await ui.unmount()
})

test('a run that ended triggers a full refresh', opts, async ($, on) => {
  const w = world($, on)
  running(w)
  const ui = await openPane($, w)
  const before = w.verbs().filter(v => v === 'status').length
  w.files[statusFile(RUN_A)] = JSON.stringify(runDoc({ outcome: 'ok', steps: [step('zzz', { outcome: 'ok' }), step('hsr', { outcome: 'ok' })] }))
  await w.clock.advance(3_000)
  expect(w.verbs().filter(v => v === 'status').length).toBe(before + 1)
  await ui.unmount()
})

test('one ticker however often the pane opens or draws; it stops when the pane goes', opts, async ($, on) => {
  const w = world($, on)
  idleStatus(w)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run({ command: 'hoyo' })
  await $.command.run({ command: 'hoyo' })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const ui2 = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await w.clock.settle()
  const base = w.panesCalls()
  await w.clock.advance(10_000)
  // one tick a second, not one per open
  expect(w.panesCalls() - base).toBeGreaterThanOrEqual(9)
  expect(w.panesCalls() - base).toBeLessThanOrEqual(11)

  // the pane is gone: the ticker cancels itself and nothing is polled
  w.panes.isPlaced = false
  await w.clock.advance(2_000)
  const stopped = w.panesCalls()
  const calls = w.calls.length
  await w.clock.advance(180_000)
  expect(w.panesCalls()).toBe(stopped)
  expect(w.calls.length).toBe(calls)

  // opened again: one ticker again
  w.panes.isPlaced = true
  await $.command.run({ command: 'hoyo' })
  await w.clock.settle()
  const again = w.panesCalls()
  await w.clock.advance(10_000)
  expect(w.panesCalls() - again).toBeGreaterThanOrEqual(9)
  expect(w.panesCalls() - again).toBeLessThanOrEqual(11)
  await ui.unmount()
  await ui2.unmount()
})

test('session start registers the command and starts nothing', opts, async ($, on) => {
  const w = world($, on)
  idleStatus(w)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await w.clock.advance(120_000)
  expect(w.calls).toEqual([])
})
