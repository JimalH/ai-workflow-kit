import { expect, test } from 'claude-code/testing'

import { edited, emptyMarks, finished, folderMarks, HOLD_MS, lineDelta, pathsIn, planned, started, stepDone } from '../hooks/marks'

test('marks: a task plans, changes and finishes its files, then holds them', () => {
  let m = started()
  m = planned(m, ['/p/a.ts', '/p/b.ts'])
  expect(m.files).toEqual({ '/p/a.ts': 'planned', '/p/b.ts': 'planned' })

  m = edited(m, ['/p/a.ts'], 1_000)
  expect(m.files['/p/a.ts']).toBe('editing')
  expect(m.clearAt).toBeNull()

  // Planning again does not demote a file already changing.
  m = planned(m, ['/p/a.ts', '/p/c.ts'])
  expect(m.files['/p/a.ts']).toBe('editing')

  m = stepDone(m)
  expect(m.files['/p/a.ts']).toBe('done')
  expect(m.files['/p/b.ts']).toBe('planned')

  m = finished(edited(m, ['/p/b.ts'], 2_000), 5_000)
  expect(m.files['/p/b.ts']).toBe('done')
  expect(m.isActive).toBe(false)
  expect(m.clearAt).toBe(5_000 + HOLD_MS)
})

test('marks: an edit outside any task is done at once and held', () => {
  const m = edited(emptyMarks(), ['/p/a.ts'], 1_000)
  expect(m.files['/p/a.ts']).toBe('done')
  expect(m.clearAt).toBe(1_000 + HOLD_MS)
})

test('marks: a folder shows its most advanced file', () => {
  const m = { ...started(), files: { '/p/src/a.ts': 'planned' as const, '/p/src/b.ts': 'done' as const, '/p/docs/x.md': 'editing' as const } }
  const up = (p: string) => {
    const out: string[] = []
    for (let d = p.slice(0, p.lastIndexOf("/")); d.length > 1; d = d.slice(0, d.lastIndexOf("/"))) out.push(d)
    return out
  }
  expect(folderMarks(m, up)).toEqual({ '/p/src': 'done', '/p/docs': 'editing', '/p': 'done' })
})

test('marks: paths are read off task list items', () => {
  expect(pathsIn('Update `hooks/register.tsx` and README.md')).toEqual(['hooks/register.tsx', 'README.md'])
  expect(pathsIn('Fix src\\a.ts, then run tests')).toEqual(['src/a.ts'])
  expect(pathsIn('Bump to 1.5.0 and see https://example.com/x.md')).toEqual([])
})

test('lines: added and removed, lines both sides keep not counted', () => {
  expect(lineDelta('a\nb\nc\n', 'a\nB\nc\nd\n')).toEqual([2, 1])
  expect(lineDelta('', 'one\ntwo')).toEqual([2, 0])
  expect(lineDelta('x\r\ny\r\n', 'x\ny\n')).toEqual([0, 0])
})
