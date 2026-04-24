# RTK Manual Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use the `test-driven-development` skill before touching code, and use `verification-before-completion` before claiming success.

> **Companion plan for:** `planning/active/rtk-integration-analysis/`

**Goal:** 按方案 2 将 `rtk-ai/rtk` 以**一次性、手工维护**的方式接入当前 marketplace 仓库，让 VS Code / GitHub Copilot 用户可以通过本仓库安装 RTK 的 Copilot hook 与提示词资产，而**不**把 RTK 作为新的 upstream 同步源，也**不**建立后续自动同步责任。

**Architecture:** 保持现有 sync/adapters/generator 架构不变，直接提交一个静态插件包 `plugins/claude--rtk/`。该插件包只封装 RTK 的 Copilot 相关资产：`hooks/hooks.json`、`instructions/*.instructions.md`、README 与操作文档。RTK 二进制本身不随插件分发，用户必须自行安装并保证 `rtk` 在 `PATH` 中。marketplace 清单文件本次手工更新，避免运行全量 sync 带来无关上游漂移。

**Tech Stack:** Bun、TypeScript smoke tests、现有 marketplace manifest 结构、RTK upstream 文档与源码（固定到 `v0.37.2` / commit `80a6fe606f73b19e52b0b330d242e62a6c07be42`）。

## 方案边界与关键决策

- **不新增 adapter**：RTK 仓库没有 `.claude-plugin/plugin.json`、`.github/plugin/marketplace.json` 等 marker，不适合挂到现有 upstream sync 管线。
- **不扩展 `Platform` union**：本次不引入 `community` / `manual` 平台类型，避免扩大 `src/adapters/types.ts`、`src/generator/vscode-plugin.ts`、下游 label 逻辑与潜在测试影响。
- **插件目录命名采用 `claude--rtk`**：这是一个务实折中。它复用现有平台前缀体系，避免 core type 变更；“手工包装”的事实写入 `_meta.json` 与 `README.md`，而不是通过新平台类型表达。
- **只落地 Copilot 资产**：本次不尝试打包 `~/.claude/settings.json` patch 行为、不尝试复刻 `rtk init -g` 的全局 Claude Code 安装流程，也不打包 RTK binary。
- **清单手工更新，不跑全量 `bun run sync`**：这样可以把本次 PR 控制在 RTK 相关文件，避免被其他 upstream 新提交“顺手带飞”。未来任意一次正常 sync 仍会保留此静态插件目录，因为 `loadGeneratedMarketplaceEntries()` 会读取整个 `plugins/` 目录。

## 目标文件清单

### 新增文件

- `plugins/claude--rtk/plugin.json`
- `plugins/claude--rtk/_meta.json`
- `plugins/claude--rtk/README.md`
- `plugins/claude--rtk/hooks/hooks.json`
- `plugins/claude--rtk/instructions/rtk-token-optimized-cli.instructions.md`
- `plugins/claude--rtk/commands/install.md`
- `plugins/claude--rtk/commands/verify.md`
- `plugins/claude--rtk/commands/troubleshoot.md`

### 修改文件

- `tests/smoke/copilot-cli.test.ts`
- `marketplace.json`
- `.github/plugin/marketplace.json`
- `.claude-plugin/marketplace.json`

## Task 1: 先把 smoke coverage 拉起来，再落插件骨架

**Files:**
- Modify: `tests/smoke/copilot-cli.test.ts`
- Create: `plugins/claude--rtk/plugin.json`
- Create: `plugins/claude--rtk/hooks/hooks.json`
- Create: `plugins/claude--rtk/instructions/rtk-token-optimized-cli.instructions.md`

- [ ] 在 `tests/smoke/copilot-cli.test.ts` 里把 `claude--rtk` 加进 representative plugins，并补一个“如果源插件目录存在 `instructions/`，安装后也必须保留”的断言。这样可以显式覆盖本次 RTK 插件最重要但当前未被 smoke test 保护的资产类型。

  建议修改形状如下：

  ```ts
  const REPRESENTATIVE_PLUGINS = [
    'claude--code-review',
    'claude--hookify',
    'cursor--cursor-team-kit',
    'claude--rtk',
  ] as const;

  const OPTIONAL_PASSTHROUGH_DIRS = ['instructions'] as const;

  // 在现有 manifest artifact 断言之后追加：
  for (const dirName of OPTIONAL_PASSTHROUGH_DIRS) {
    const sourceDir = path.join(sourcePluginPath, dirName);
    if (existsSync(sourceDir)) {
      const installedDir = path.join(installedPluginPath, dirName);
      expect(existsSync(installedDir)).toBe(true);
    }
  }
  ```

- [ ] 先运行一次定向 smoke test，确认新增断言在插件尚不存在时失败，锁定测试基线：

  ```bash
  bun test tests/smoke/copilot-cli.test.ts
  ```

  预期失败点应集中在以下之一：
  - marketplace 中找不到 `claude--rtk`
  - 源插件目录不存在
  - 安装后找不到 `instructions/`

- [ ] 创建 `plugins/claude--rtk/plugin.json`。该 manifest 只声明仓库当前有正式字段支持的组件：`commands` 与 `hooks`。`instructions/` 作为额外目录直接随插件拷贝，不写入 manifest。

  目标内容：

  ```json
  {
    "name": "claude--rtk",
    "version": "0.37.2",
    "description": "RTK token-optimized shell command rewrite for VS Code Copilot Chat and Copilot CLI",
    "author": {
      "name": "rtk-ai",
      "url": "https://github.com/rtk-ai/rtk"
    },
    "license": "Apache-2.0",
    "homepage": "https://github.com/rtk-ai/rtk",
    "repository": "https://github.com/rtk-ai/rtk",
    "keywords": [
      "rtk",
      "copilot",
      "hooks",
      "token-optimization",
      "cli"
    ],
    "tags": [
      "cli",
      "hooks",
      "productivity"
    ],
    "category": "developer-tools",
    "commands": "./commands/",
    "hooks": "./hooks/hooks.json",
    "strict": false
  }
  ```

- [ ] 创建 `plugins/claude--rtk/hooks/hooks.json`，内容直接对齐 RTK upstream `COPILOT_HOOK_JSON`，不要二次设计。

  目标内容：

  ```json
  {
    "hooks": {
      "PreToolUse": [
        {
          "type": "command",
          "command": "rtk hook copilot",
          "cwd": ".",
          "timeout": 5
        }
      ]
    }
  }
  ```

- [ ] 创建 `plugins/claude--rtk/instructions/rtk-token-optimized-cli.instructions.md`，内容**精简继承** RTK upstream 的 `COPILOT_INSTRUCTIONS`，保留 golden rule、常用命令、meta commands、安装验证与 Copilot 行为说明；不要把上游整篇超长文档原样灌进来，避免把 instruction context 变成卡车。

  推荐内容：

  ```md
  ---
  applyTo: "**"
  ---

  # RTK — Token-Optimized CLI

  `rtk` is a CLI proxy that filters and compresses command output, usually saving 60-90% tokens on common development commands.

  ## Rule

  Prefer prefixing verbose shell commands with `rtk`.

  ```bash
  git status       -> rtk git status
  git diff         -> rtk git diff
  cargo test       -> rtk cargo test
  vitest           -> rtk vitest
  docker ps        -> rtk docker ps
  kubectl get pods -> rtk kubectl get pods
  ```

  ## Meta commands

  ```bash
  rtk gain
  rtk gain --history
  rtk discover
  rtk proxy <cmd>
  ```

  ## Verification

  ```bash
  rtk --version
  rtk gain
  which rtk
  ```

  ## Copilot behavior

  - VS Code Copilot Chat uses transparent rewrite when the hook can return `updatedInput`.
  - Copilot CLI falls back to deny-with-suggestion until its hook API supports `updatedInput`.
  ```

- [ ] 重新运行定向 smoke test，确保现在失败点只剩下 marketplace 清单中还没收录 `claude--rtk`；这说明插件目录本身已经成形，下一步只需要把它挂到清单上，而不是继续在插件内部打转。

- [ ] 任务完成后提交一次 checkpoint：

  ```bash
  git add tests/smoke/copilot-cli.test.ts plugins/claude--rtk
  git commit -m "Add manual RTK plugin package skeleton"
  ```

## Task 2: 补齐 provenance、README 与 operator-facing 文档

**Files:**
- Create: `plugins/claude--rtk/_meta.json`
- Create: `plugins/claude--rtk/README.md`
- Create: `plugins/claude--rtk/commands/install.md`
- Create: `plugins/claude--rtk/commands/verify.md`
- Create: `plugins/claude--rtk/commands/troubleshoot.md`

- [ ] 创建 `plugins/claude--rtk/_meta.json`，把“这是手工包装，不是自动同步产物”的事实写死进去，并 pin 到本次选定的 upstream revision。

  目标内容：

  ```json
  {
    "displayName": "RTK (manual wrapper from rtk-ai/rtk)",
    "_source": {
      "platform": "claude-code",
      "upstream": "https://github.com/rtk-ai/rtk.git",
      "pluginPath": "hooks/copilot",
      "commitSha": "80a6fe606f73b19e52b0b330d242e62a6c07be42",
      "version": "0.37.2"
    },
    "_compatibility": {
      "overall": "partial",
      "notes": [
        "Manual wrapper: packages RTK's Copilot hook and prompt guidance for this marketplace.",
        "Requires the external `rtk` binary to be installed and available on PATH.",
        "The plugin ships instructions as `.instructions.md` files outside official plugin.json component fields."
      ],
      "warnings": [
        "This package does not install, update, or verify the RTK binary for the user.",
        "GitHub Copilot CLI still uses deny-with-suggestion because its current hook API does not support `updatedInput`."
      ],
      "droppedComponents": []
    }
  }
  ```

- [ ] 创建 `plugins/claude--rtk/README.md`，README 要把用户最关心的三件事说明白：
  1. 这个插件安装的是什么，不安装什么；
  2. 先决条件是 RTK binary 已安装；
  3. VS Code Chat 与 Copilot CLI 的行为差异。

  建议 README 至少包含以下结构：

  ```md
  # RTK

  Manual marketplace wrapper for RTK's Copilot integration.

  ## What this plugin installs

  - Copilot hook config at `hooks/hooks.json`
  - VS Code instruction files under `instructions/`
  - Operator docs under `commands/`

  ## What this plugin does not install

  - The `rtk` binary
  - Global Claude Code config patches
  - `~/.claude/settings.json` automation

  ## Prerequisite

  Install RTK separately and make sure `rtk` is on `PATH`.

  ## Behavior

  - VS Code Copilot Chat: transparent rewrite via `updatedInput`
  - GitHub Copilot CLI: deny-with-suggestion fallback

  ## Upstream provenance

  This plugin is a manual one-time wrapper derived from `rtk-ai/rtk` release `v0.37.2`.
  ```

- [ ] 创建 `plugins/claude--rtk/commands/install.md`，把安装 RTK binary 的主路径写清楚。这里不要瞎发明安装方式；正文中以“参考 upstream 官方 README/INSTALL”为主，并给出当前最容易执行的验证序列。

  建议内容：

  ```md
  # Install RTK

  Install RTK from the upstream project before enabling this plugin.

  ## Verify installation

  ```bash
  rtk --version
  rtk gain
  which rtk
  ```

  If `rtk gain` fails, check for a name collision with another `rtk` binary and reinstall the one from `rtk-ai/rtk`.
  ```

- [ ] 创建 `plugins/claude--rtk/commands/verify.md`，用于安装后的 self-check。

  建议内容：

  ```md
  # Verify RTK Integration

  ## Binary checks

  ```bash
  rtk --version
  rtk gain
  which rtk
  ```

  ## Runtime expectations

  - VS Code Copilot Chat should rewrite verbose shell commands to `rtk ...` transparently when the hook fires.
  - Copilot CLI should deny a raw command and suggest the `rtk ...` form.
  ```

- [ ] 创建 `plugins/claude--rtk/commands/troubleshoot.md`，记录两个最容易踩坑的问题：
  - `rtk` command not found / PATH 问题
  - 安装到了错误的 `rtk`（同名 binary 冲突）

  建议内容：

  ```md
  # Troubleshoot RTK

  ## `rtk` not found

  Ensure the RTK binary is installed and available on `PATH` for the editor session.

  ## Wrong `rtk` binary

  Run:

  ```bash
  which rtk
  rtk --version
  ```

  If `rtk gain` is unavailable, you may have installed a different tool with the same name.
  ```

- [ ] 运行一次 artifact audit，确保新插件目录结构与当前仓库约定一致：

  ```bash
  bun test tests/smoke/generated-artifact-audit.test.ts
  ```

- [ ] 任务完成后提交 checkpoint：

  ```bash
  git add plugins/claude--rtk tests/smoke/generated-artifact-audit.test.ts
  git commit -m "Add RTK manual plugin docs and metadata"
  ```

  > 注：如果 `generated-artifact-audit.test.ts` 不需要改动，就不要为了凑热闹把它 staged 进去。

## Task 3: 手工更新 marketplace manifests，并完成自动化验证

**Files:**
- Modify: `marketplace.json`
- Modify: `.github/plugin/marketplace.json`
- Modify: `.claude-plugin/marketplace.json`
- Re-run: `tests/smoke/copilot-cli.test.ts`

- [ ] 在三个 marketplace manifest 中各新增一条 `claude--rtk` 记录。字段形状对齐现有产物，不额外引入 generator 还没写出的字段。

  目标条目：

  ```json
  {
    "name": "claude--rtk",
    "source": "./plugins/claude--rtk",
    "description": "RTK token-optimized shell command rewrite for VS Code Copilot Chat and Copilot CLI (from Claude Code)",
    "strict": false,
    "version": "0.37.2",
    "author": {
      "name": "rtk-ai",
      "url": "https://github.com/rtk-ai/rtk"
    },
    "repository": "https://github.com/rtk-ai/rtk",
    "keywords": [
      "rtk",
      "copilot",
      "hooks",
      "token-optimization",
      "cli"
    ]
  }
  ```

- [ ] 重新运行 smoke test，确认 `claude--rtk` 可以被 browse / install，并且安装后保留：
  - `hooks/hooks.json`
  - `commands/`
  - `instructions/`

  ```bash
  bun test tests/smoke/copilot-cli.test.ts
  ```

- [ ] 再跑一次全量测试，确认这不是一个“局部看着没事，整体一跑就散架”的快乐假象：

  ```bash
  bun test
  ```

- [ ] 查看 git diff，确认变更范围仍只包含 RTK 相关文件与三份 marketplace 清单，没有把 unrelated upstream 漂移带进来。

  ```bash
  git --no-pager diff --stat
  git --no-pager diff -- marketplace.json .github/plugin/marketplace.json .claude-plugin/marketplace.json plugins/claude--rtk tests/smoke/copilot-cli.test.ts
  ```

- [ ] 任务完成后提交 checkpoint：

  ```bash
  git add marketplace.json .github/plugin/marketplace.json .claude-plugin/marketplace.json tests/smoke/copilot-cli.test.ts
  git commit -m "Register RTK manual plugin in marketplace manifests"
  ```

## Task 4: 做一轮人工功能验证，确认 hook 语义没有在插件层走样

**Files:**
- No new repo files required unless验证结果需要补文档

- [ ] 在本地安装/确认 RTK binary：

  ```bash
  rtk --version
  rtk gain
  which rtk
  ```

- [ ] 通过本仓库的 marketplace 安装 `claude--rtk`，然后在 VS Code Copilot Chat 里触发一个典型 verbose shell command，例如 `git status` 或 `git diff`。

- [ ] 预期行为：
  - VS Code Copilot Chat：应通过 `updatedInput` 透明改写为 `rtk git status` / `rtk git diff`，而不是直接原样跑高噪声命令。
  - GitHub Copilot CLI：如果测试 CLI 路径，应表现为 deny-with-suggestion，而不是透明改写。

- [ ] 若人工验证发现 plugin loader **不会**自动带上 `instructions/` 目录，回到 Task 1，把 smoke test 保护的“额外目录透传”变更扩展为安装器修复；否则保持当前最小方案，不额外改核心逻辑。

- [ ] 若人工验证通过，再走一次 completion gate：

  ```bash
  bun test
  ```

## 验收标准

- `plugins/claude--rtk/` 成为一个完整、可安装的静态插件目录。
- 三份 marketplace manifest 都包含 `claude--rtk` 条目。
- `bun test tests/smoke/copilot-cli.test.ts` 通过，并显式覆盖 `instructions/` 透传。
- `bun test tests/smoke/generated-artifact-audit.test.ts` 通过。
- `bun test` 全量通过。
- 人工验证确认 Copilot hook 的实际语义仍符合 RTK upstream：VS Code Chat 透明改写、Copilot CLI deny-with-suggestion。

## 不在本次范围内

- 把 RTK 新增为 upstream repo，并接入 `src/index.ts` / `src/sync/pipeline.ts` 的自动同步流程。
- 新增 `community` / `manual` 平台类型。
- 自动下载或安装 RTK binary。
- 实现 `rtk init -g` 对 Claude Code 全局配置的所有副作用。
- 追踪 RTK 后续 release 并持续同步本插件。

## 风险与回退策略

- **风险 1：** `claude--rtk` 使用现有 `claude-code` platform label，会让 marketplace description 出现 `(from Claude Code)`，语义不够完美。  
  **接受理由：** 这是为了避免在“手工一次性接入”任务里扩大 core schema 变更面。

- **风险 2：** 插件系统虽然会复制整个目录，但当前 automated tests 之前没有显式保护 `instructions/`。  
  **缓解：** Task 1 先补 smoke coverage。

- **风险 3：** 不跑 `bun run sync` 代表 marketplace 清单需要手工更新。  
  **缓解：** 只改三份 manifest，并通过 smoke test 覆盖 browse/install 路径；未来任意正常 sync 仍会保留该插件。

- **回退方案：** 如果人工验证发现 “静态插件 + 现有 loader” 不能正确承载 RTK 的 Copilot hook/instructions 语义，则撤回本计划，转为单独设计 `community/manual` provenance 或定制 generator 支持；不要半修半挂地把一个名义可安装、实际不可用的插件提交进主分支。
