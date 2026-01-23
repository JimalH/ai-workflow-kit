# 设计手册（如何用本系统创建/维护新工作流）

本手册是 runbook：让任何 AI 按步骤执行即可，不依赖隐含经验。

---
none ???workflow_slug=none???? minimal safety?? promptbook/SSOT????????????

## A. 启动流程（任何 AI 进入仓库后必须做）
1) 读 `.workflow/workflows/ACTIVE_WORKFLOW.txt`
2) 读 `.workflow/workflows/CHAT_PROTOCOL.md`
3) 读 `.workflow/workflows/<workflow_slug>/BASE.md`（必须包含 Roles Registry + Permissions Policy）
4) 从 BASE 的 `Allowed Roles` 中确认 ROLE（用户指派为准；未指派只问一次）
5) 读 `.workflow/roles/<ROLE>.md`
6) 每轮先处理 chat，再做实现/验收/写 SSOT

---

## B. 新建工作流（workflow_slug）时必须创建
- `.workflow/workflows/<workflow_slug>/BASE.md`
- `.workflow/workflows/<workflow_slug>/.commands/`（建议包含 `session_watch.md` 与 `session_watchlist.txt`）
- （如用 Promptbook）`.workflow/workflows/<workflow_slug>/promptbook/P-0001.md`
- （如需新角色）`.workflow/roles/<Role>.md`
- 切换工作流：更新 `.workflow/workflows/ACTIVE_WORKFLOW.txt`

---

## C. BASE.md 必写清单（强制）
BASE 至少包含：
- Workflow Overview（目标/非目标）
- Artifacts & SSOT（SSOT 定义与路径）
- Document Formats（结构、编号、canonical、append-only、防呆）
- Process / Lifecycle（循环、失败策略、先全验收后判定）
- Chat Semantics（TYPE 语义、handoff、close/digest）
- Chat Initiation Rules（写明 MUST 触发：角色交接、验证 FAIL、工作流切换、高风险动作、安装/修复冲突等；其他场景可留给 AI 自行判断）
- Validation & Evidence Rules（PASS 证据门槛）
- Skills Policy（allowlist、cache、pin、是否允许执行脚本）
- **Autonomy & Permissions Policy（必须）**
- Safety / Do-Not-Do
- **Roles Registry (machine-readable)**（必须可解析）

---

## D. 角色手册（.workflow/roles/<Role>.md）必写清单
- Role Purpose
- Responsibilities
- Non-Responsibilities
- Operating Rules
- Chat Initiation Rules（角色层 MUST 触发写清；非强制场景由 AI 自行决定是否开启 chat）
- Handoff Expectations
- Required Skills（固定段落：Required/Recommended/Sources/Cache/Install policy/记录要求）

注意：
- 角色手册应可跨 workflow 复用：不要在角色手册里写 Promptbook 章节模板。

---

## E. Permissions Policy 落地（建议默认 L1）
推荐在 BASE 采用 L1：
- 允许 agent 在 scope 白名单内“不问直接 edit”
- 高风险动作（删除/装依赖/执行脚本/改安全配置/触及 secrets/超出 scope）必须询问用户
- 自动改动后必须输出变更摘要，并写回 SSOT（如需）

---

## F. 多 AI 并行写入纪律（强制）
- SSOT：除 append-only 章节外必须就地修改；禁止文末再写一套结构
- Chat：只允许改 header（Last read/Status）与消息 header 的 FLAG；旧正文禁止改动
- 冲突优先保证 SSOT 一致性，再补充 chat 说明


---

## Entry Stub（推荐写法）
在任意项目仓库中，只需要保证平台会首先读取到一个“入口 stub”，其内容指向 `AI_LOADER.md`。

推荐使用标记块（便于幂等更新，不破坏原文件）：

```md
<!-- BEGIN AI_WORKFLOW_LOADER_BLOCK -->
You MUST read and follow ./AI_LOADER.md before doing any work.
<!-- END AI_WORKFLOW_LOADER_BLOCK -->
```

平台入口文件路径：
- Codex：`AGENTS.md`
- Claude Code：`.claude/CLAUDE.md`
- Antigravity：`.agent/rules/GEMINI.md`

当 `.workflow/workflows/` 与 `.workflow/roles/` 缺失时，由 `AI_LOADER.md` 执行自举安装。

## 附：Session Watcher（替代 session mode）
- 工具：`.workflow/tools/session_watcher.py`（仅 mtime，可能误报；默认 1h 可用 `--forever`）
- 每个 workflow 写死监控范围：在 `.commands/session_watchlist.txt` 列出相对路径/glob（含 chat 临时文件、BASE、promptbook、报告等）
- 文档：`.commands/session_watch.md` 记录用法、自然语言映射、JSON 架构、退出码
- 自然语言示例：`session watch 30min` → `--duration 1800`; `session mode 1h` → `--duration 3600`; `session watch forever` → `--forever`
