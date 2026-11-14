// Every word the panel shows, in one table (Simplified Chinese).

export const S = {
  pane: '每日助手',
  idle: '空闲',
  running: '运行中',
  stopping: '停止中',
  paused: '已暂停',
  today: '今天',
  notRunYet: '还没跑',
  waiting: '等待',
  inProgress: '进行中',
  dryRun: '演练',
  endedAt: '结束',
  touchNote: '开跑后不要碰鼠标键盘。',
  btnRunAll: '跑全部',
  btnZzz: '绝区零',
  btnHsr: '星铁',
  btnPause: '暂停',
  btnResume: '继续',
  btnStop: '停止',
  btnRefresh: '刷新',
  busyRun: '启动中…',
  busyStop: '停止中…',
  busyPause: '暂停中…',
  busyResume: '继续中…',
  doneCount: (n: number) => `已完成 ${n} 项`,
  likelyDone: '大概率完成',
  skipped: '跳过',
  failed: '失败',
  interrupted: '被停止打断',
  notExecuted: (n: number) => `没执行 ${n} 项`,
  gameNotReached: '没执行',
  needsYou: '需要你处理',
  refreshing: '刷新中…',
  loading: '读取中…',
  noRepoTitle: '还没有配置 HoYo 日常助手的位置。',
  noRepoWays: [
    '方式一：在插件设置里填写 repo（HoYo 日常助手文件夹，里面有 hoyo.ps1）。',
    '方式二：输入 /hoyo repo <文件夹路径>，路径存在本机，所有会话通用。',
  ],
  repoSaved: (p: string) => `已保存仓库路径：${p}`,
  repoCurrent: (p: string) => `当前仓库路径：${p}`,
  repoNotPerson: '只有在输入框里亲自输入 /hoyo repo <路径> 才能改仓库路径，这一次只打开了面板。也可以在插件设置里填 repo。',
  repoBadFormat: (p: string) => `仓库路径要写成带盘符的绝对路径（如 D:\\文件夹），不能是相对路径、网络路径或含 .. 的路径：${p}`,
  repoInvalid: (p: string) => `已配置的仓库路径不合格，当作没配置：${p}`,
  repoMissing: (p: string) => `找不到 ${p}\\hoyo.ps1，路径没有保存。`,
  spawnFailed: (m: string) => `命令没能运行或超时：${m}`,
  unreadable: (code: number) => `命令没有返回可读的结果（退出码 ${code}）。`,
  exitHints: {
    4: '已有运行在进行，或上一次运行还占着锁（可能有残留进程）。',
    5: '工作进程没能启动（UAC 被拒绝，或没人点）。',
    6: '没有正在进行的运行。',
  } as Record<number, string>,
  outcome: {
    ok: '完成',
    partial: '部分完成',
    failed: '失败',
    stopped: '已停止',
    force_stopped: '强制停止',
    refused: '被拒绝',
    timeout: '超时',
    aborted: '中止',
    orphaned: '有残留进程',
  } as Record<string, string>,
  // The same outcomes as a result next to a game name ("today" rows).
  todayOutcome: {
    ok: '已完成',
    partial: '部分完成',
    failed: '失败',
    stopped: '已停止',
    force_stopped: '强制停止',
    refused: '被拒绝',
    timeout: '超时',
    aborted: '中止',
    orphaned: '有残留进程',
  } as Record<string, string>,
  game: { zzz: '绝区零', hsr: '星穹铁道' } as Record<string, string>,
}

// An ended run stays on the panel this long; after it the panel is idle again.
export const RECENT_MS = 6 * 60 * 60 * 1000
// Reasons are quoted as they come, cut to this many characters.
export const REASON_MAX = 80
export const LOG_MAX = 100

// Refresh rhythm and command timeouts (ms).
export const EVERY_RUNNING_MS = 3_000
export const EVERY_IDLE_MS = 60_000
// The log file is looked at (stat) and read at most this often; a file over the size limit
// (fs.read refuses over 4 MiB) is not read.
export const LOG_READ_EVERY_MS = 6_000
export const LOG_READ_MAX_BYTES = 4_000_000
// `hoyo logs` is only the fallback (the log file is read directly when it can be).
export const LOG_PROCESS_EVERY_MS = 20_000
// After a failed read of status.json, status/result processes wait at least this long.
export const FALLBACK_BACKOFF_MS = 15_000
// An error stays on the panel at least this long, whatever refreshes meanwhile.
export const ERROR_KEEP_MS = 60_000
// A refresh in flight longer than this is given up.
export const INFLIGHT_MAX_MS = 120_000
export const TIMEOUT = {
  read: 30_000,
  // hoyo's own worst wait for `run` is 150 s (UAC 120 s, then 30 s after accepting); the rest is process start.
  run: 200_000,
  stop: 120_000,
  pause: 60_000,
}
