# AI_LOADER.md — 自举入口（短版，跨平台通用）

> 你可以把本文件内容粘贴到任意 Agent 的“全局指令/系统提示/项目规则/入口文件”里使用。  
> 目标：当 workspace 缺少本工作流套件时，自动从 GitHub 下载/安装；当已存在时，进入当前 workflow。

---

## 0) 硬规则（必须遵守）
- **先自举，再做事**：确认工作流套件就位前，禁止开始实现/验收。
- **不确定就问**：任何可能越权的动作，遵循当前 workflow 的 `BASE.md -> Autonomy & Permissions Policy`。
- **最小改动**：只做必要的文件增删改；不要重排无关内容。

---

## 1) Kit Source（self-bootstrap 配置）
- WORKFLOW_KIT_REPO = https://github.com/JimalH/ai-workflow-kit.git
- WORKFLOW_KIT_REF  = main   (建议后续 pin 到 tag，例如 v0.1.0)
- WORKFLOW_KIT_SUBDIR = .    (若套件在子目录则写相对路径)
- INSTALL_STRATEGY = copy    (推荐 copy；可选 submodule)
- MARKER_BLOCK_ID = AI_WORKFLOW_LOADER_BLOCK

---

## 2) 已安装检测（workspace 是否已有套件）
若满足以下全部条件，则视为“已安装”，跳到第 4 节：
- 存在 `.workflow/workflows/CHAT_PROTOCOL.md`
- 存在 `.workflow/workflows/ACTIVE_WORKFLOW.txt`
- 存在 `.workflow/roles/`
- 存在 `.workflow/AI_WORKFLOW_BASE.md`

否则执行第 3 节“安装/修复”。

---

## 3) 安装 / 修复（缺文件时执行）

### 3.1 拉取套件（联网）
优先使用 git（更稳定、可复现）：
- `git clone --depth 1 --branch <WORKFLOW_KIT_REF> <WORKFLOW_KIT_REPO> <tmp_dir>`

若无法 git：下载 repo zip 并解压到 `<tmp_dir>`。

### 3.2 拷贝到 workspace（INSTALL_STRATEGY=copy）
从 `<tmp_dir>/<WORKFLOW_KIT_SUBDIR>/` 拷贝以下到 **当前 workspace 根目录**：
- `.workflow/`（包含 loader/base/workflows/roles 全部内容）

冲突处理（必须）：
- 不覆盖用户同名文件的非工作流内容；若冲突，必须询问用户“保留哪个/如何合并”。
- 拷贝完成后，确保存在 `.workflow/workflows/_skills_cache/`（无则创建）。

### 3.3 选择 workflow（必须问用户）
?????? `.workflow/workflows/` ???? `BASE.md` ?????? `docs/`?`_skills_cache/`?????? `workflow_slug`???? `none`??? minimal safety only??????
- “你要启用哪个 workflow_slug？”

将选择结果写入：
- `.workflow/workflows/ACTIVE_WORKFLOW.txt`（仅一行：workflow_slug）

### 3.4 修复 / 写入平台入口文件（幂等）
目的：让不同平台下次进入项目时都能先读本 Loader。

入口文件：
- Codex：`AGENTS.md`（仓库根目录）
- Claude Code：`.claude/CLAUDE.md`
- Antigravity/Gemini：`.agent/rules/GEMINI.md`

写入策略（推荐：标记块，避免破坏原内容）  
在目标文件中插入/更新以下标记块（若已存在则只更新块内内容）：

```md
<!-- BEGIN AI_WORKFLOW_LOADER_BLOCK -->
You MUST read and follow ./.workflow/AI_LOADER.md before doing any work.
<!-- END AI_WORKFLOW_LOADER_BLOCK -->
```

规则：
- 文件不存在：创建并写入**仅含该块**即可。
- 文件存在但没有标记块：追加标记块（不要覆盖原内容）。
- 若文件存在且有显著冲突（例如显式要求忽略本 block）：必须询问用户。

---

## 4) ?????????????????
??????
1) ???? `.workflow/AI_WORKFLOW_BASE.md`
2) ? `<workflow_slug> == none`?
   - ?? `.workflow/workflows/none/BASE.md`
   - ?? promptbook/SSOT/append-only ???none ??? SSOT?
   - ???????????????? `.workflow/roles/<ROLE>.md`?
   ???? `.workflow/AI_WORKFLOW_BASE.md` ? Bootstrap Sequence ???
   - `.workflow/workflows/ACTIVE_WORKFLOW.txt`
   - `.workflow/workflows/CHAT_PROTOCOL.md`
   - `.workflow/workflows/<workflow_slug>/BASE.md`
   - `.workflow/roles/<ROLE>.md`??????????
3) ?? `.workflow/workflows/<workflow_slug>/temp_chat_*.txt`?????none ??????
4) ?????/??/? SSOT?none ????? SSOT?
## 5) 最后输出（强制）
若执行过第 3 节安装/修复，你必须在对话里输出：
- 已写入/更新的文件列表（含路径）
- 发生冲突的文件（如有）与需要用户选择的点
- 发现的 workflow_slug 列表 + 用户选择结果（写入 ACTIVE_WORKFLOW）
