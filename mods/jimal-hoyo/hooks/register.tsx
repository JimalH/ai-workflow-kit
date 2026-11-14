import type { Register } from 'claude-code'

import type { RunView, StepView } from '../types'
import {
  PANE, act, cleanPath, currentRepo, ensureTicker, isBusy, readModel, readNow, refresh, resetRefreshClock, set,
  setRepoOption, setWidget, startRun, stopTicker,
} from './core'
import { clean, elapsed, groupStep, hhmm, isValidRepo, parseTime } from './logic'
import type { Line } from './logic'
import { RECENT_MS, S, TIMEOUT } from './strings'

const GAMES = ['zzz', 'hsr'] as const

// ---------------------------------------------------------------------------
// Drawing

const OUTCOME_COLOR: Record<string, string> = {
  ok: 'success',
  partial: 'warning',
  failed: 'error',
  stopped: 'warning',
  force_stopped: 'error',
  refused: 'error',
  timeout: 'error',
  aborted: 'error',
  orphaned: 'error',
}

const LINE_COLOR: Record<Line['kind'], string | undefined> = {
  done: 'success',
  likely: 'suggestion',
  skipped: 'warning',
  failed: 'error',
  interrupted: 'warning',
  notrun: undefined,
}
export const register: Register = (on, options) => {
  setRepoOption(options?.repo)

  on('session.start', async ($, e, next) => {
    // Registers the command only: nothing is opened and no process is started.
    await $.command.register({
      name: 'hoyo',
      description: 'Open the HoYo Daily Assistant panel (start, stop, watch runs); /hoyo repo <path> sets its folder',
      argumentHint: '[repo <path>]',
    })
    return next(e)
  })

  // Answers its own command: the folder is changed only by a person typing it (origin `composer`);
  // a plugin's `$.command.run`, the bridge or the SDK only open the panel. Nothing here starts a run.
  on('command.run', { command: 'hoyo' }, async ($, e) => {
    const args = (e.args ?? '').trim()
    if (/^repo(\s|$)/i.test(args)) {
      const path = cleanPath(args.replace(/^repo/i, ''))
      if (e.origin?.kind !== 'composer') {
        await set($, { error: [S.repoNotPerson], notice: '' })
      } else if (!path) {
        await set($, { notice: S.repoCurrent((await currentRepo($)) || '—'), error: [] })
      } else if (!isValidRepo(path)) {
        await set($, { error: [S.repoBadFormat(path)], notice: '' })
      } else if (!(await $.fs.exists(`${path}\\hoyo.ps1`).catch(() => false))) {
        await set($, { error: [S.repoMissing(path)], notice: '' })
      } else {
        await $.store.set('repo', path)
        await set($, { notice: S.repoSaved(path), error: [], needsRepo: false })
        resetRefreshClock()
      }
    }
    await $.ui.open({ id: PANE, title: S.pane })
    ensureTicker($)
    return {}
  })

  // The pane closes: stop polling at once.
  // Only watches: a failure here changes nothing, so the catch just passes the close on.
  on('ui.close', { id: 'jimal-hoyo' }, ($, e, next) => {
    stopTicker()
    return next(e)
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'Pane', requestId: 'jimal-hoyo' }, async ($, e) => {
    // A pane left open from before (a reload, another session) draws without a command: start following it.
    try {
      ensureTicker($)
    } catch {
      // Drawing never fails for want of a timer.
    }
    // A widget (the desktop's small form) counts as shown; a covered pane does not.
    setWidget(e.props.placement === 'widget')
    const { Box, Text, Button } = $.ui.resolve(e)
    const m = await readModel($)
    await readNow($)
    const at = await $.clock.now()
    const busy = isBusy(m.busy, at) ? m.busy : null

    const btn = (key: string, label: string, onPress: () => void, variant?: 'primary') => (
      <Button key={key} label={label} variant={variant} onPress={onPress} />
    )
    const starters = (
      <Box flexDirection="row" gap="sm" flexWrap="wrap">
        {btn('run-all', busy?.kind === 'run' ? S.busyRun : S.btnRunAll, () => void startRun($, 'all'), 'primary')}
        {btn('run-zzz', busy?.kind === 'run' ? S.busyRun : S.btnZzz, () => void startRun($, 'zzz'))}
        {btn('run-hsr', busy?.kind === 'run' ? S.busyRun : S.btnHsr, () => void startRun($, 'hsr'))}
      </Box>
    )

    const refreshBtn = btn('refresh', S.btnRefresh, () => void refresh($, true))
    const header = (marker: string, color?: string) => (
      <Box flexDirection="row" gap="sm" alignItems="center" flexWrap="wrap">
        <Text weight="bold" size="heading">{S.pane}</Text>
        <Text weight="semibold" color={color}>{marker}</Text>
        {refreshBtn}
      </Box>
    )

    // Every outside string is cleaned when stored; once more here, because one control
    // character makes the surface refuse the whole tree.
    const errorBlock =
      m.error.length > 0 ? (
        <Box flexDirection="column" borderStyle="round" borderColor="error" paddingX="sm">
          {m.error.map((l, i) => <Text key={`err${i}`} color="error">{clean(l)}</Text>)}
        </Box>
      ) : null
    const notice = m.notice ? <Text dimColor>{clean(m.notice)}</Text> : null

    // Before the first answer nothing is known: no results, no start buttons.
    if (!m.isLoaded) {
      return (
        <Box flexDirection="column" gap="sm">
          {header(S.loading)}
          {errorBlock}
        </Box>
      )
    }

    if (m.needsRepo) {
      return (
        <Box flexDirection="column" gap="sm">
          {header(S.idle)}
          <Text color="warning">{S.noRepoTitle}</Text>
          {S.noRepoWays.map((w, i) => <Text key={`way${i}`} dimColor>{w}</Text>)}
          {errorBlock}
          {notice}
        </Box>
      )
    }

    const gameName = (g: string) => S.game[g] ?? g

    const lineRows = (lines: Line[], prefix: string) =>
      lines.map((l, i) => (
        <Box key={`${prefix}${i}`} flexDirection="column">
          <Text color={LINE_COLOR[l.kind]} dimColor={l.kind === 'notrun'}>{l.text}</Text>
          {l.reason ? <Text dimColor>{`　　${l.reason}`}</Text> : null}
        </Box>
      ))

    // One finished game: title with its end time, then the grouped results.
    const finishedGame = (step: StepView | undefined, game: string) => {
      if (!step || step.outcome === 'not_run' || step.state === 'pending') {
        return (
          <Box key={`g-${game}`} flexDirection="column">
            <Text weight="semibold">{gameName(game)}</Text>
            <Text dimColor>{S.gameNotReached}</Text>
          </Box>
        )
      }
      const time = hhmm(step.endedAt)
      const outcome = S.outcome[step.outcome] ?? step.outcome
      return (
        <Box key={`g-${game}`} flexDirection="column">
          <Text weight="semibold">
            {gameName(game)}
            <Text color={OUTCOME_COLOR[step.outcome]}>{`　${outcome}`}</Text>
            <Text dimColor>{time ? `　${time} ${S.endedAt}` : ''}</Text>
          </Text>
          {lineRows(groupStep(step), `l-${game}-`)}
        </Box>
      )
    }

    const needsBlock = (run: RunView) =>
      run.needsUser.length > 0 ? (
        <Box flexDirection="column" borderStyle="round" borderColor="warning" paddingX="sm">
          <Text weight="bold" color="warning">{S.needsYou}</Text>
          {run.needsUser.map((n, i) => (
            <Text key={`nu${i}`}>
              {n.game ? <Text dimColor>{`[${gameName(n.game)}] `}</Text> : null}
              {n.message}
            </Text>
          ))}
        </Box>
      ) : null

    // --- running
    if (m.active) {
      const run = m.active
      const started = parseTime(run.startedAt)
      const clock = started ? ` ${elapsed(at - started)}` : ''
      const label = run.state === 'stopping' ? S.stopping : S.running
      const games = run.games.length > 0 ? run.games : [...GAMES]
      const paused = run.isPaused
      const stopBusy = busy?.kind === 'stop'
      const pauseBusy = busy?.kind === 'pause' || busy?.kind === 'resume'
      return (
        <Box flexDirection="column" gap="sm">
          {header(`${label}${clock}${paused ? `　${S.paused}` : ''}`, 'suggestion')}
          {games.map(g => {
            const step = run.steps.find(s => s.game === g)
            if (step?.state === 'finished') return finishedGame(step, g)
            const isCurrent = g === run.currentGame || step?.state === 'running' || step?.state === 'stopping'
            return (
              <Box key={`g-${g}`} flexDirection="column">
                <Text weight="semibold">
                  {gameName(g)}
                  <Text color={isCurrent ? 'suggestion' : undefined} dimColor={!isCurrent}>{`　${isCurrent ? S.inProgress : S.waiting}`}</Text>
                </Text>
                {isCurrent && m.logLine ? <Text dimColor>{clean(m.logLine)}</Text> : null}
              </Box>
            )
          })}
          {errorBlock}
          {notice}
          <Box flexDirection="row" gap="sm" flexWrap="wrap">
            {paused
              ? btn('resume', busy?.kind === 'resume' ? S.busyResume : S.btnResume, () => void act($, 'resume', ['resume'], TIMEOUT.pause))
              : btn('pause', busy?.kind === 'pause' ? S.busyPause : S.btnPause, () => void act($, 'pause', ['pause'], TIMEOUT.pause))}
            {btn('stop', stopBusy ? S.busyStop : S.btnStop, () => void act($, 'stop', ['stop'], TIMEOUT.stop))}
          </Box>
          {pauseBusy || stopBusy ? <Text dimColor>{S.refreshing}</Text> : null}
        </Box>
      )
    }

    // --- ended (a recent run) or idle
    const last = m.last
    const endedAt = last ? parseTime(last.endedAt) : 0
    if (last && last.state === 'finished' && (!endedAt || at - endedAt < RECENT_MS)) {
      const label = (S.outcome[last.outcome] ?? last.outcome) + (last.isDryRun ? `（${S.dryRun}）` : '')
      const games = last.games.length > 0 ? last.games : [...GAMES]
      const showMessage = last.message && (last.outcome === 'refused' || last.outcome === 'aborted')
      return (
        <Box flexDirection="column" gap="sm">
          {header(label, OUTCOME_COLOR[last.outcome])}
          {showMessage ? <Text color="error">{last.message}</Text> : null}
          {needsBlock(last)}
          {games.map(g => finishedGame(last.steps.find(s => s.game === g), g))}
          {errorBlock}
          {notice}
          {starters}
          <Text dimColor>{S.touchNote}</Text>
        </Box>
      )
    }

    return (
      <Box flexDirection="column" gap="sm">
        {header(S.idle)}
        <Box flexDirection="column">
          <Text dimColor>{S.today}</Text>
          {GAMES.map(g => {
            const o = m.today[g]
            return (
              <Text key={`t-${g}`}>
                {gameName(g)}
                <Text color={o ? OUTCOME_COLOR[o] : undefined} dimColor={!o}>{`　${o ? (S.todayOutcome[o] ?? o) : S.notRunYet}`}</Text>
              </Text>
            )
          })}
        </Box>
        {errorBlock}
        {notice}
        {starters}
        <Text dimColor>{S.touchNote}</Text>
      </Box>
    )
  })
}
