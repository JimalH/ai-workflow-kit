import { expect, test } from 'claude-code/testing'
import { clean, elapsed, explain, groupStep, hhmm, isValidRepo, lastMeaningfulLine, parseEnvelope, toRunView } from './logic'
import { runDoc, step, task } from './world'

const stepOf = (tasks: ReturnType<typeof task>[]) => {
  const run = toRunView(runDoc({ steps: [step('zzz', { tasks })] }))
  if (!run) throw new Error('no run')
  return run.steps[0]!
}

test('grouping: verified done merge into one count, the rest are listed', () => {
  const lines = groupStep(
    stepOf([
      task('a', 'done', 'already done', true),
      task('b', 'done', '', undefined), // a missing `verified` reads as true
      task('c', 'done', 'unverified: guess', false, '迷失之地'),
      task('d', 'skipped', '没有可运行的计划', true, '体力刷本'),
      task('e', 'failed', 'unparsed: boom', true, '咖啡店'),
      task('f', 'not_run', 'stopped by user (was in progress)', true, '录像店'),
      task('g', 'not_run', 'disabled in upstream config', true),
      task('h', 'not_run', 'not reached: the run was stopped by request'),
      task('i', 'not_run', 'not reached: the run was stopped by request'),
    ]),
  )
  expect(lines.map(l => l.text)).toEqual([
    '已完成 2 项',
    '大概率完成　迷失之地',
    '跳过　体力刷本',
    '失败　咖啡店',
    '被停止打断　录像店',
    '没执行 2 项',
  ])
  expect(lines[2]?.reason).toBe('没有可运行的计划')
})

test('grouping: a long reason is cut to about 80 characters, Chinese kept as is', () => {
  const long = '没有可运行的计划（找不到 代理人方案培养）'.repeat(6)
  const lines = groupStep(stepOf([task('d', 'skipped', long, true)]))
  const reason = lines[0]?.reason ?? ''
  expect(reason.length).toBe(80)
  expect(reason.endsWith('…')).toBe(true)
  expect(reason.startsWith('没有可运行的计划')).toBe(true)
})

test('grouping: disabled-only and empty steps give no lines', () => {
  expect(groupStep(stepOf([task('g', 'not_run', 'disabled in upstream config')]))).toEqual([])
  expect(groupStep(stepOf([]))).toEqual([])
})

test('helpers: time, elapsed, envelope, error lines', () => {
  expect(hhmm('2026-11-14T22:54:22+11:00')).toBe('22:54')
  expect(hhmm('')).toBe('')
  expect(elapsed(65_000)).toBe('1:05')
  expect(parseEnvelope('not json')).toBeUndefined()
  const env = parseEnvelope('{"ok":false,"exit_code":4,"data":{},"error":{"code":"busy","message":"run x is still active"}}')
  expect(env?.exitCode).toBe(4)
  expect(explain(env!)).toEqual(['已有运行在进行，或上一次运行还占着锁（可能有残留进程）。', 'run x is still active'])
})

test('clean: ANSI sequences, OSC, BEL and other C0 controls go; newline and tab stay', () => {
  expect(clean('\u001b[92mINFO\u001b[0m | 开拓力: 0/300')).toBe('INFO | 开拓力: 0/300')
  expect(clean('\u001b[31;1mboom\u001b[0m\u0007')).toBe('boom')
  expect(clean('a\u001b]0;title\u0007b')).toBe('ab')
  expect(clean('x\u0000y\u0008z\u007f')).toBe('xyz')
  expect(clean('a\tb\nc')).toBe('a\tb\nc')
  expect(clean('\u001b(Bplain')).toBe('plain')
})

test('envelope: text around the JSON, with braces in it, still parses', () => {
  const json = '{"ok":true,"exit_code":0,"data":{"a":1},"error":null}'
  expect(parseEnvelope(`warning {not json}\n${json}\n`)?.ok).toBe(true)
  expect(parseEnvelope(`${json}\ntrailing { text`)?.ok).toBe(true)
  expect(parseEnvelope('{"nope":1}')).toBeUndefined()
})

test('repo form: drive-letter absolute only', () => {
  expect(isValidRepo('D:\\Example\\HoYo')).toBe(true)
  expect(isValidRepo('D:\\Example\u0007\\HoYo')).toBe(false) // a control character is refused, not stripped
  for (const bad of ['rel\\x', '\\\\srv\\share', 'C:x', 'C:/x', 'D:\\a\\..\\b', '']) expect(isValidRepo(bad)).toBe(false)
})

const HSR = (level: string, text: string) => `2026-11-14 22:56:02,311 | \u001b[92m${level}\u001b[0m | ${text}`
const ZZZ = (level: string, text: string) => `[22:53:01.164] [application_launcher.py 52] [${level}]: ${text}`

test('log line: only INFO and above are shown; DEBUG and level-less lines are skipped', () => {
  const log = [HSR('INFO', '开拓力: 0/300'), HSR('DEBUG', 'OCR识别结果: UID 123456789'), HSR('DEBUG', 'more'), ''].join('\n')
  expect(lastMeaningfulLine(log)).toBe('22:56:02 开拓力: 0/300')
  expect(lastMeaningfulLine([HSR('DEBUG', 'OCR识别结果: UID 123456789')].join('\n'))).toBe('')
  expect(lastMeaningfulLine('plain line\n+----+\n| banner |\n----- done -----\n\n')).toBe('')
  expect(lastMeaningfulLine('')).toBe('')
  for (const level of ['WARNING', 'ERROR', 'CRITICAL']) expect(lastMeaningfulLine(HSR(level, 'x'))).toBe('22:56:02 x')
})

test('log line: ZZZ lines are cut to "time text"; DEBUG and the runner marker rules', () => {
  expect(lastMeaningfulLine(ZZZ('INFO', '正在加载OCR模型'))).toBe('22:53:01 正在加载OCR模型')
  expect(lastMeaningfulLine([ZZZ('INFO', '正在加载OCR模型'), ZZZ('DEBUG', '识别到 UID 123456789')].join('\n'))).toBe('22:53:01 正在加载OCR模型')
  expect(lastMeaningfulLine(ZZZ('DEBUG', '识别到 UID 123456789'))).toBe('')
  expect(lastMeaningfulLine([ZZZ('INFO', 'a'), '[zzz_run] result: COMPLETED'].join('\n'))).toBe('[zzz_run] result: COMPLETED')
  // a level inside the text does not make a level-less line pass
  expect(lastMeaningfulLine('OCR said | INFO | something')).toBe('')
})
