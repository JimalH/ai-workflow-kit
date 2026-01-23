# BASE — Relay–Accept–Change (RAC) 工作流 v4（Roles Registry + Permissions Policy）

## 1. Workflow Overview

需求写入 Promptbook（SSOT）→ Implementer 实现 → Validator 按 AC 验收 → 失败打回修复 → 循环直到通过。

## 2. Artifacts & SSOT

- Workflow Loader：`AI_LOADER.md`
- Workflow Base Rules：`AI_WORKFLOW_BASE.md`
- SSOT：`.workflow/workflows/relay_accept_change/promptbook/` 下最新 `P-####.md`
- Chat Protocol：`.workflow/workflows/CHAT_PROTOCOL.md`
- Skills cache：`.workflow/workflows/_skills_cache/`

## 3. Roles Registry (machine-readable)

- Allowed Roles: [Specifier, Implementer, Validator]
- Allowed Combos: [Specifier+Validator]
- Disallowed Combos: [Implementer+Validator]

## 4. Promptbook 结构与写入规则（强制）

- 章节必须包含：Metadata / Background / REQ / TASK / AC / CON / DELIV / Change Log / Validation Report / Appendix—Chat Digest
- 编号：REQ-001/TASK-001/AC-001/…
- canonical：同名标题以首次出现为准；禁止文末再粘贴整套模板
- append-only：仅 Change Log、Validation Report 允许循环追加；其他必须就地修改
- 禁止预写空结构/占位符

## 5. Lifecycle（强制）

- Validator能自行验收的部分先全验收后判定：即使发现 FAIL，也继续验收所有可验收项并记录。
- 需要User手动进行验收的部分逐一指导User进行验收，在获取User反馈后进行判定；如有FAIL，中止验收并记录验收成功/验收失败/未验收
- 验收结果需计入Validation Report

## 6. Chat Semantics（应用层）

- Chat Gate（强制）：在执行任何实现/验收/写入前，先检查当前 workflow 目录下的 `temp_chat_*.txt`（若存在）并处理新消息，再继续动作。
- 推荐 TYPE：QUESTION/ANSWER/HANDOFF/REJECT_WITH_FIX/FIX_DONE/VALIDATION_PASS/VALIDATION_FAIL/CLOSE_REQUEST/CLOSE_ACK
- handoff 必须包含：角色切换信息 + 当前状态 + 修复建议 + 复验命令（如有）

### Chat Initiation Rules
- MUST 打开 chat：
  1) 角色交接或 Implementer/Validator/Specifier 角色切换、请求他人接手
  2) 验证 FAIL / 退回 / 需要重做
  3) 工作流切换（含切到/切出 none）
  4) 平台 stub 或 kit 安装/修复冲突，需要用户决策
  5) 任何潜在破坏性或高风险操作需权限确认时
- AI 自行判断是否需要额外开启 chat（例如上下文可能过期、并发改动风险、规格歧义等）。

## 7. Evidence Rules（强制）

- PASS 必须给：命令 + 输出摘要/日志/文件路径与校验点
- 无证据不得 PASS

## 8. Close & Digest

- CLOSE_REQUEST 携带 `ARCHIVE_SUGGEST:YES|NO`
- CLOSE_ACK 携带 `ARCHIVE_DECISION:YES|NO`
- 双方都 YES 才归档 digest
- digest 写入 Promptbook canonical `## Appendix — Chat Digest`

## 9. Autonomy & Permissions Policy（建议 L1）

### Allowed without asking (in-scope)

Agent MAY edit/create files WITHOUT asking only if ALL are true:

- Scope 白名单（仅限以下路径）：
  - `.workflow/workflows/relay_accept_change/...`
  - `.workflow/workflows/CHAT_PROTOCOL.md`
  - `.workflow/workflows/ACTIVE_WORKFLOW.txt`（仅当用户要求切换工作流）
  - `.workflow/workflows/docs/...`（设计/指导文档）
  - `.workflow/roles/...`
- 非破坏性：不删除文件夹、不大规模移动/重命名、不做不可逆迁移。
- 遵守 SSOT 写入纪律：canonical + append-only。

### Always require user confirmation

Agent MUST ask before:

- 任何删除（文件或目录）或大规模 rename/move
- 修改 scope 白名单之外的内容
- 安装依赖/变更环境（pip/conda/npm 等）
- 运行会修改系统状态/凭证的命令
- 联网拉取（git clone/curl/wget）**除非**属于 Skills Policy 允许的 allowlist 拉取
- 触及 secrets/keys/tokens、`.env`、SSH/credential 配置

### Audit requirements (mandatory)

当 agent 在不询问的情况下写入文件后，必须：

- 给出简短 change plan（将改哪些文件、为什么）
- 给出 diff summary（改了哪些文件/新增哪些文件/关键变更点）
- 按工作流要求更新 SSOT 的 Change Log / Validation Report（如适用）

### Safety defaults

- 若不确定某动作是否允许 → 询问用户
- 避免无关重排/格式化；偏好最小 diff
- 禁止在 Promptbook 文末复制整套结构

## 10. Skills Policy（强制）

- allowlist only：
  - https://github.com/openai/skills
  - https://github.com/anthropics/skills
  - https://github.com/rominirani/antigravity-skills
  - https://github.com/sickn33/antigravity-awesome-skills
- 缓存：一律拉取到 `.workflow/workflows/_skills_cache/` 并固定 commit/tag
- 默认只加载指令文件；禁止自动执行 skill 内脚本/二进制（除非用户/BASE 明确允许并记录证据）
- 使用/安装记录必须写入 Promptbook 的 Change Log（repo+commit/tag+路径+安装目标/手动步骤）

## 11. Safety

- 不删历史；不覆盖 Change Log/验收总结；chat 不改旧正文（只改 header/FLAG）
