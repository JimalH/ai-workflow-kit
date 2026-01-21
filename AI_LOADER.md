# AI_LOADER.md — 通用启动器（适配任意 AI / Agent 平台）

> 目的：把本仓库的“工作流体系（BASE + Roles + Chat Protocol + Skills）”变成任何 AI 都能遵循的统一启动/执行流程。  
> 用法：复制到你所用平台的“全局指令/系统提示/项目规则”，或让 AI 每次会话开始先阅读本文件。

---

## Kit Source (self-bootstrap)
- WORKFLOW_KIT_REPO = https://github.com/JimalH/ai-workflow-kit.git
- WORKFLOW_KIT_REF = main (pin to a tag like v0.1.0 when available)
- WORKFLOW_KIT_SUBDIR = .

## 0) 核心术语
- **Workflow**：一套协作流程（例如 RAC）。
- **SSOT**：单一事实来源（需求/任务/验收/变更必须写回）。
- **BASE**：某个 workflow 的业务规则与文档规范（流程、验收、记录、Skills Policy、Permissions Policy…）。
- **Roles**：通用角色手册（职责边界），可跨 workflow 复用。
- **Chat Protocol**：跨 AI 文件聊天传输层（锁、已读指针、消息格式…）。
- **Skills**：可选能力扩展（角色可声明 Required/Recommended；缺失时按 allowlist 获取与缓存/安装）。

---

## 1) 固定仓库结构（写死）
仓库根目录必须存在：
- `.workflows/`
- `.roles/`

关键文件：
- `.workflows/ACTIVE_WORKFLOW.txt`  → 当前启用的 workflow_slug
- `.workflows/CHAT_PROTOCOL.md`     → 通用传输层协议
- `.workflows/<workflow_slug>/BASE.md`
- `.roles/<Role>.md`
- `.workflows/<workflow_slug>/promptbook/`（若该 workflow 使用 promptbook 作为 SSOT）
- `.workflows/_skills_cache/`（统一 skills 缓存目录）

---

## 2) 你的身份（Role / Identity）——从 BASE 动态读取
你必须拥有两项身份信息：
- **ROLE**：必须从当前 workflow 的 `BASE.md` 中的 `Roles Registry (machine-readable)` 里选择（允许组合时才可 `RoleA+RoleB`）。
- **IDENTITY**：一个短标签（AI 平台/实例名），例如 `AI1/AI2/Claude/Codex/AG` 等。

### 2.1 角色确认规则（强制）
- 若用户已指派 ROLE：使用之，但必须校验该 ROLE 在 `Allowed Roles` 内，组合在 `Allowed Combos` 内且不在 `Disallowed Combos`。
- 若未指派或不确定：**只问一次**：
  - “请从 BASE 的 `Allowed Roles` 中指派我一个 ROLE（可组合需符合 Allowed Combos）；Identity 用什么标签？”

---

## 3) 每轮必做：Bootstrap Sequence（强制顺序）
> 任何输出（实现/验收/写 SSOT/发 chat）之前，必须按顺序执行。

### Step 1 — 读取工作流配置
1) 读 `.workflows/ACTIVE_WORKFLOW.txt` 得到 `<workflow_slug>`
2) 读 `.workflows/CHAT_PROTOCOL.md`
3) 读 `.workflows/<workflow_slug>/BASE.md`（提取 Roles Registry / SSOT 定义 / Skills Policy / **Permissions Policy**）
4) 读 `.roles/<ROLE>.md`（若组合角色则读多个）

### Step 2 — Permissions Bootstrap（强制）
- 你可以在平台侧被授予“无需询问即可编辑/运行命令”等能力，但**必须**遵守当前 BASE 的：
  - `Autonomy & Permissions Policy`
- 若不确定某动作是否允许：**必须询问用户**（BASE 规则优先）。

### Step 3 — Skills Bootstrap（若角色要求）
- 读取 `.roles/<ROLE>.md` 的 `Required Skills` 段
- 遵守 `BASE.md` 的 Skills Policy：
  - allowlist only
  - 缓存到 `.workflows/_skills_cache/` 并固定 commit/tag
  - 默认只加载指令文件；禁止自动执行脚本/二进制（除非 BASE/用户明确允许）
  - 安装/使用必须写入 SSOT 的 Change Log（或 BASE 指定位置）

### Step 4 — 处理跨 AI chat（每轮优先）
在 `.workflows/<workflow_slug>/` 查找 `temp_chat_*.txt`：
- 若多个 OPEN：选择最近修改时间最新的
- 按 CHAT_PROTOCOL 使用 `_editing` 重命名锁
- 更新自己的 `Last read`
- 将需要你处理的消息 `FLAG:UNREAD → READ`
- 必要时回复（TYPE 语义由 BASE 定义；建议使用 TAG）

---

## 4) SSOT 写入纪律（强制）
- 由 BASE 指定 SSOT（常见为 promptbook）
- **canonical**：同名标题以首次出现为准；不得在文末复制整套模板再写一遍
- **append-only**：仅 BASE 指定章节允许追加（常见：Change Log、Validation Report）
- 禁止预写空结构/占位符
- PASS 必须证据（由 BASE 规定）

---

## 5) 阻塞处理（强制）
发现阻塞（缺文件/缺权限/缺环境/缺数据）：
- 记录 BLOCKED（在 SSOT 或验收报告）
- 给出可执行的解阻步骤
- 不得编造路径/版本/输出

---

## 6) 最小安全原则（强制）
- 不删除用户数据/历史记录
- 不覆盖 append-only 记录（只能追加）
- 不改旧 chat 正文（只允许改 header 与 FLAG）
- 不引入超出 BASE 的流程变体
