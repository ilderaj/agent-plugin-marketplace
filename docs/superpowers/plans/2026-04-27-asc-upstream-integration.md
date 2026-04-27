# ASC Upstream Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 `rorkai/app-store-connect-cli-skills` 作为一个常驻 upstream 接入本仓库的 sync pipeline，并生成一个完整、可持续更新、可在 Copilot / VS Code marketplace 中安装的插件产物。

**Architecture:** 保持这次改动聚焦于一个明确 upstream，而不是提前抽象成“任意第三方 skills marketplace”。新增一个专用 `AscSkillsAdapter`，把 asc skills 仓库根目录解析成单个 `community` 来源插件 IR，再复用现有生成器与 marketplace 写出链路，最终产出 `plugins/community--asc-cli-skills/` 与对应 marketplace 条目。

**Tech Stack:** TypeScript, Bun, 现有 `SyncPipeline`, `VsCodePluginGenerator`, `MarketplaceGenerator`, `bun:test`

**Active task path:** `planning/active/agent-plugin-marketplace-feasibility/`

**Lifecycle state:** `active`

**Sync-back status:** `companion plan created; planning files synced on 2026-04-27`

---

## 文件结构

### 需要修改

- `src/adapters/types.ts`
	- 扩展 `Platform` 联合类型，允许新的社区来源平台。
- `src/index.ts`
	- 注册 asc upstream 默认 repo URL、环境变量覆盖入口、以及新 adapter。
- `src/generator/vscode-plugin.ts`
	- 让生成 README / display label 正确展示新的来源平台名称。
- `README.md`
	- 记录新的 upstream、环境变量、产物名、以及 `asc` CLI 运行时前置要求。
- `tests/fixtures.test.ts`
	- 校验新 fixture 的结构合法性。
- `tests/generator/vscode-plugin.test.ts`
	- 覆盖社区来源插件的生成产物形态。
- `tests/sync/pipeline.test.ts`
	- 覆盖 asc upstream 的发现、同步、再同步、marketplace 落盘。

### 需要新增

- `src/adapters/asc-skills.ts`
	- 专用 adapter：把 `app-store-connect-cli-skills` 仓库根目录解析为一个插件。
- `tests/index.test.ts`
	- 覆盖默认配置里 asc upstream repo URL 的暴露与环境变量覆盖。
- `tests/adapters/asc-skills.test.ts`
	- 覆盖 `discover()` / `parse()` 行为。
- `tests/fixtures/asc-cli-skills/README.md`
	- 代表性的 upstream README fixture。
- `tests/fixtures/asc-cli-skills/skills/asc-cli-usage/SKILL.md`
	- 代表性技能 fixture，覆盖基础 skill frontmatter。
- `tests/fixtures/asc-cli-skills/skills/asc-cli-usage/references/commands.md`
	- 覆盖 references 目录复制。
- `tests/fixtures/asc-cli-skills/skills/asc-release-flow/SKILL.md`
	- 第二个技能 fixture，覆盖多技能场景。
- `tests/fixtures/asc-cli-skills/skills/asc-release-flow/scripts/check-readiness.sh`
	- 覆盖 skill scripts 复制和 `hasScripts` 检测。
- `tests/smoke/asc-cli-skills.test.ts`
	- 针对已生成仓库产物的 smoke audit。

### 预期生成物

- `plugins/community--asc-cli-skills/`
- `marketplace.json`
- `.github/plugin/marketplace.json`
- `.claude-plugin/marketplace.json`
- `data/sync-state.json`

### 明确非目标

- 这次不把 `repoUrls` 改造成任意数量的第三方 upstream 列表。
- 这次不实现“自动解析任意 GitHub skills 仓库”的泛化适配器。
- 这次不试图把 `asc` CLI 本身一起打包进插件；插件只承载 skills 与说明，CLI 仍是外部运行时依赖。

---

### Task 1: 扩展平台与默认配置

**Files:**
- Modify: `src/adapters/types.ts`
- Modify: `src/index.ts`
- Create: `tests/index.test.ts`

- [ ] **Step 1: 先写默认配置失败测试**

```ts
import { describe, expect, test } from "bun:test";
import { createDefaultSyncConfig } from "../src/index";

describe("createDefaultSyncConfig", () => {
	test("includes the ASC skills upstream by default", () => {
		const config = createDefaultSyncConfig("/tmp/agent-plugin-marketplace");

		expect(config.repoUrls.community).toBe(
			"https://github.com/rorkai/app-store-connect-cli-skills.git",
		);
	});

	test("allows overriding the ASC skills upstream via env", () => {
		Bun.env.ASC_SKILLS_REPO_URL = "https://github.com/example/custom-asc-skills.git";

		const config = createDefaultSyncConfig("/tmp/agent-plugin-marketplace");
		expect(config.repoUrls.community).toBe(
			"https://github.com/example/custom-asc-skills.git",
		);

		delete Bun.env.ASC_SKILLS_REPO_URL;
	});
});
```

- [ ] **Step 2: 运行测试，确认当前失败**

Run: `bun test tests/index.test.ts`

Expected: `Property 'community' does not exist` 或 `createDefaultSyncConfig` 尚未暴露 asc upstream。

- [ ] **Step 3: 修改平台类型与默认配置**

```ts
// src/adapters/types.ts
export type Platform = "codex" | "claude-code" | "cursor" | "community";
```

```ts
// src/index.ts
import { AscSkillsAdapter } from "./adapters/asc-skills";

const DEFAULT_REPO_URLS = {
	codex: "https://github.com/openai/plugins.git",
	"claude-code": "https://github.com/anthropics/claude-code.git",
	cursor: "https://github.com/cursor/plugins.git",
	community: "https://github.com/rorkai/app-store-connect-cli-skills.git",
} satisfies SyncConfig["repoUrls"];

export function createDefaultSyncConfig(baseDir = process.cwd()): SyncConfig {
	return {
		cacheDir: join(baseDir, ".cache", "sync"),
		outputDir: baseDir,
		repoUrls: {
			codex: Bun.env.CODEX_REPO_URL ?? DEFAULT_REPO_URLS.codex,
			"claude-code": Bun.env.CLAUDE_CODE_REPO_URL ?? DEFAULT_REPO_URLS["claude-code"],
			cursor: Bun.env.CURSOR_REPO_URL ?? DEFAULT_REPO_URLS.cursor,
			community: Bun.env.ASC_SKILLS_REPO_URL ?? DEFAULT_REPO_URLS.community,
		},
		marketplace: {
			name: "agent-plugin-marketplace",
			owner: {
				name: Bun.env.MARKETPLACE_OWNER_NAME ?? "agent-plugin-marketplace",
			},
			metadata: {
				description:
					Bun.env.MARKETPLACE_DESCRIPTION ??
					"Cross-platform agent plugins converted for VS Code",
			},
		},
	};
}

export function createPipeline(config = createDefaultSyncConfig()): SyncPipeline {
	return new SyncPipeline({
		adapters: [
			new CodexAdapter(),
			new ClaudeAdapter(),
			new CursorAdapter(),
			new AscSkillsAdapter(),
		],
		generator: new VsCodePluginGenerator(),
		marketplaceGen: new MarketplaceGenerator(config.marketplace),
		stateManager: new SyncStateManager(join(config.outputDir, "data", "sync-state.json")),
		config,
	});
}
```

- [ ] **Step 4: 重新运行默认配置测试**

Run: `bun test tests/index.test.ts`

Expected: PASS

- [ ] **Step 5: 提交这一小步**

```bash
git add src/adapters/types.ts src/index.ts tests/index.test.ts
git commit -m "feat: register asc skills upstream in default sync config"
```

---

### Task 2: 新增 asc upstream 专用 adapter

**Files:**
- Create: `src/adapters/asc-skills.ts`
- Create: `tests/adapters/asc-skills.test.ts`
- Create: `tests/fixtures/asc-cli-skills/README.md`
- Create: `tests/fixtures/asc-cli-skills/skills/asc-cli-usage/SKILL.md`
- Create: `tests/fixtures/asc-cli-skills/skills/asc-cli-usage/references/commands.md`
- Create: `tests/fixtures/asc-cli-skills/skills/asc-release-flow/SKILL.md`
- Create: `tests/fixtures/asc-cli-skills/skills/asc-release-flow/scripts/check-readiness.sh`
- Modify: `tests/fixtures.test.ts`

- [ ] **Step 1: 先写 adapter 行为测试**

```ts
import { describe, expect, test } from "bun:test";
import { join } from "path";
import { AscSkillsAdapter } from "../../src/adapters/asc-skills";

const FIXTURE = join(import.meta.dir, "..", "fixtures", "asc-cli-skills");

describe("AscSkillsAdapter", () => {
	test("discovers the repo root as a single plugin", async () => {
		const discovered = await new AscSkillsAdapter().discover(FIXTURE);

		expect(discovered).toEqual([
			expect.objectContaining({
				name: "asc-cli-skills",
				path: FIXTURE,
			}),
		]);
	});

	test("parses repo-root skills into a synthesized plugin IR", async () => {
		const ir = await new AscSkillsAdapter().parse(FIXTURE);

		expect(ir.source.platform).toBe("community");
		expect(ir.manifest.name).toBe("asc-cli-skills");
		expect(ir.components.skills.map((skill) => skill.name)).toEqual([
			"asc-cli-usage",
			"asc-release-flow",
		]);
		expect(ir.components.skills.find((skill) => skill.name === "asc-release-flow")?.hasScripts).toBe(true);
		expect(ir.compatibility.warnings).toContain(
			"Requires the `asc` CLI to be installed for most workflows.",
		);
	});
});
```

- [ ] **Step 2: 增加最小但有代表性的 fixture**

```md
<!-- tests/fixtures/asc-cli-skills/README.md -->
# asc cli skills

A collection of Agent Skills for shipping with the asc cli.
```

```md
---
name: asc-cli-usage
description: Guidance for using asc cli commands.
---

# asc cli usage

Use `asc --help` before composing commands.
```

```md
---
name: asc-release-flow
description: Submission readiness and release flow guidance.
---

# asc release flow

Check readiness before submission.
```

```sh
#!/usr/bin/env bash
set -euo pipefail
echo "readiness-ok"
```

- [ ] **Step 3: 让 fixture 结构测试先失败后转绿**

在 `tests/fixtures.test.ts` 新增一组断言：

```ts
describe("asc-cli-skills fixture", () => {
	const fixturePath = join(FIXTURES_DIR, "asc-cli-skills");

	test("skills directory exists with valid SKILL.md files", () => {
		expect(existsSync(join(fixturePath, "skills", "asc-cli-usage", "SKILL.md"))).toBe(true);
		expect(existsSync(join(fixturePath, "skills", "asc-release-flow", "SKILL.md"))).toBe(true);
	});
});
```

Run: `bun test tests/fixtures.test.ts tests/adapters/asc-skills.test.ts`

Expected: `Cannot find module '../../src/adapters/asc-skills'` 或解析字段不匹配。

- [ ] **Step 4: 实现专用 adapter**

```ts
import { readdir, stat } from "fs/promises";
import { join } from "path";
import type { Compatibility, DiscoveredPlugin, PluginIR, SkillRef, SourceAdapter } from "./types";

const SYNTHETIC_COMPATIBILITY: Compatibility = {
	overall: "full",
	details: [
		{
			type: "skill",
			name: "repo-root-skill-pack",
			level: "full",
			notes: "Skills follow the shared Agent Skills format and can be copied as-is.",
		},
	],
	warnings: [
		"Requires the `asc` CLI to be installed for most workflows.",
		"This plugin manifest is synthesized from a repo-root skill pack, not an upstream plugin.json.",
	],
	droppedComponents: [],
};

export class AscSkillsAdapter implements SourceAdapter {
	readonly platform = "community" as const;
	readonly markerDir = "skills";

	async discover(repoPath: string): Promise<DiscoveredPlugin[]> {
		const skillsDir = join(repoPath, "skills");
		const stats = await stat(skillsDir);
		if (!stats.isDirectory()) {
			return [];
		}

		return [
			{
				name: "asc-cli-skills",
				path: repoPath,
				markerPath: skillsDir,
			},
		];
	}

	async parse(pluginDir: string): Promise<PluginIR> {
		const skills = await this.parseSkills(pluginDir);

		return {
			id: "community--asc-cli-skills",
			source: {
				platform: "community",
				repoUrl: "",
				pluginPath: pluginDir,
				commitSha: "",
				version: "0.0.0",
			},
			manifest: {
				name: "asc-cli-skills",
				displayName: "ASC CLI Skills",
				version: "0.0.0",
				description: "Agent Skills for App Store Connect workflows using asc.",
				author: {
					name: "rorkai",
					url: "https://github.com/rorkai",
				},
				homepage: "https://asccli.sh/",
				repository: "https://github.com/rorkai/app-store-connect-cli-skills",
				keywords: [
					"ios",
					"macos",
					"app-store-connect",
					"testflight",
					"notarization",
					"xcode",
					"asc",
				],
				tags: ["ios", "macos", "app-store-connect", "community"],
				raw: {},
			},
			components: {
				skills,
				hooks: [],
				agents: [],
				commands: [],
				mcpServers: [],
				rules: [],
				apps: [],
			},
			compatibility: SYNTHETIC_COMPATIBILITY,
		};
	}

	private async parseSkills(pluginDir: string): Promise<SkillRef[]> {
		const skillsDir = join(pluginDir, "skills");
		const entries = await readdir(skillsDir, { withFileTypes: true });

		const skillRefs = await Promise.all(
			entries
				.filter((entry) => entry.isDirectory())
				.map(async (entry) => {
					const skillRoot = join(skillsDir, entry.name);
					await stat(join(skillRoot, "SKILL.md"));

					let hasScripts = false;
					try {
						hasScripts = (await stat(join(skillRoot, "scripts"))).isDirectory();
					} catch {
						hasScripts = false;
					}

					return {
						name: entry.name,
						path: `skills/${entry.name}`,
						hasScripts,
					} satisfies SkillRef;
				}),
		);

		return skillRefs.sort((left, right) => left.name.localeCompare(right.name));
	}
}
```

- [ ] **Step 5: 运行 adapter 与 fixture 测试**

Run: `bun test tests/adapters/asc-skills.test.ts tests/fixtures.test.ts`

Expected: PASS

- [ ] **Step 6: 提交这一小步**

```bash
git add src/adapters/asc-skills.ts tests/adapters/asc-skills.test.ts tests/fixtures.test.ts tests/fixtures/asc-cli-skills
git commit -m "feat: add asc skills upstream adapter"
```

---

### Task 3: 让生成器正确产出 community 来源插件

**Files:**
- Modify: `src/generator/vscode-plugin.ts`
- Modify: `tests/generator/vscode-plugin.test.ts`

- [ ] **Step 1: 先写生成器失败测试**

```ts
test("generates a community asc skills plugin", async () => {
	const ir = await new AscSkillsAdapter().parse(join(FIXTURES_DIR, "asc-cli-skills"));
	const outDir = join(OUTPUT_ROOT, "asc-community");

	await ensureCleanDir(outDir);
	await new VsCodePluginGenerator().generate(ir, outDir);

	const manifest = await readJson(join(outDir, "plugin.json"));
	expect(manifest.name).toBe("community--asc-cli-skills");
	expect(manifest.skills).toBe("./skills/");
	expect(manifest.agents).toBeUndefined();

	const meta = await readJson(join(outDir, "_meta.json"));
	expect(meta.displayName).toBe("ASC CLI Skills (from Community)");

	const readme = await readFile(join(outDir, "README.md"), "utf-8");
	expect(readme).toContain("Requires the `asc` CLI");
});
```

- [ ] **Step 2: 运行测试，确认 `platformLabel()` 还不支持新平台**

Run: `bun test tests/generator/vscode-plugin.test.ts`

Expected: TypeScript 编译错误或 switch 分支不完整。

- [ ] **Step 3: 修改生成器的平台标签逻辑**

```ts
export function platformLabel(platform: PluginIR["source"]["platform"]) {
	switch (platform) {
		case "claude-code":
			return "Claude Code";
		case "codex":
			return "Codex";
		case "cursor":
			return "Cursor";
		case "community":
			return "Community";
	}
}
```

如果测试显示 `normalizeGeneratedPluginName()` 或 README 组装里仍有假设，也在同一任务内最小修复，不新开切片。

- [ ] **Step 4: 重新运行生成器测试**

Run: `bun test tests/generator/vscode-plugin.test.ts`

Expected: PASS

- [ ] **Step 5: 提交这一小步**

```bash
git add src/generator/vscode-plugin.ts tests/generator/vscode-plugin.test.ts
git commit -m "feat: support community plugin labels in generator"
```

---

### Task 4: 接通同步链路并加回归测试

**Files:**
- Modify: `tests/sync/pipeline.test.ts`
- Create: `tests/smoke/asc-cli-skills.test.ts`

- [ ] **Step 1: 先写 sync pipeline 失败测试**

在 `tests/sync/pipeline.test.ts` 增加一个 asc 专用场景，使用本地 bare repo 模拟 upstream：

```ts
test("run syncs the asc skills upstream into marketplace outputs", async () => {
	const upstream = await createLocalAscUpstream();
	const stateFile = join(workspaceDir, "data", "sync-state.json");

	const pipeline = new SyncPipeline({
		adapters: [new AscSkillsAdapter()],
		generator: new VsCodePluginGenerator(),
		marketplaceGen: new MarketplaceGenerator(createAscConfig(upstream.bareRepoUrl).marketplace),
		stateManager: new SyncStateManager(stateFile),
		config: createAscConfig(upstream.bareRepoUrl),
	});

	const report = await pipeline.run();

	expect(report).toEqual({
		updated: 1,
		total: 1,
		added: [{ name: "asc-cli-skills", platform: "community" }],
		removed: [],
		changed: [],
	});

	const pluginJson = JSON.parse(
		await readFile(
			join(workspaceDir, "output", "plugins", "community--asc-cli-skills", "plugin.json"),
			"utf-8",
		),
	);

	expect(pluginJson.name).toBe("community--asc-cli-skills");
	expect(pluginJson.skills).toBe("./skills/");
});
```

- [ ] **Step 2: 增加本地 upstream helper**

```ts
const ASC_FIXTURE = join(import.meta.dir, "..", "fixtures", "asc-cli-skills");

async function createLocalAscUpstream() {
	const upstreamRoot = join(workspaceDir, "asc-upstream");
	const bareRepo = join(upstreamRoot, "origin.git");
	const sourceRepo = join(upstreamRoot, "source");

	await mkdir(upstreamRoot, { recursive: true });
	await runGit(["init", "--bare", bareRepo]);
	await runGit(["init", sourceRepo]);
	await runGit(["config", "user.name", "Test User"], sourceRepo);
	await runGit(["config", "user.email", "test@example.com"], sourceRepo);
	await cp(ASC_FIXTURE, sourceRepo, { recursive: true });
	await runGit(["add", "."], sourceRepo);
	await runGit(["commit", "-m", "Initial asc skill pack"], sourceRepo);
	await runGit(["remote", "add", "origin", bareRepo], sourceRepo);
	await runGit(["push", "-u", "origin", "HEAD"], sourceRepo);

	return {
		bareRepoUrl: `file://${bareRepo}`,
		sourceRepo,
	};
}

function createAscConfig(repoUrl: string): SyncConfig {
	return {
		cacheDir: join(workspaceDir, "cache"),
		outputDir: join(workspaceDir, "output"),
		repoUrls: {
			community: repoUrl,
		},
		marketplace: {
			name: "agent-plugin-marketplace",
			owner: { name: "test-owner" },
			metadata: {
				description: "Cross-platform agent plugins converted for VS Code",
			},
		},
	};
}
```

- [ ] **Step 3: 新增生成产物 smoke test**

```ts
import { describe, expect, test } from "bun:test";
import { readFile } from "fs/promises";
import { join } from "path";

const REPO_ROOT = join(import.meta.dir, "../..");

describe("asc cli skills generated plugin", () => {
	test("marketplace includes the generated community plugin", async () => {
		const marketplace = JSON.parse(
			await readFile(join(REPO_ROOT, "marketplace.json"), "utf-8"),
		) as { plugins: Array<{ name: string }> };

		expect(marketplace.plugins.some((plugin) => plugin.name === "community--asc-cli-skills")).toBe(true);
	});

	test("generated plugin exposes skills only", async () => {
		const manifest = JSON.parse(
			await readFile(
				join(REPO_ROOT, "plugins", "community--asc-cli-skills", "plugin.json"),
				"utf-8",
			),
		) as Record<string, unknown>;

		expect(manifest.skills).toBe("./skills/");
		expect(manifest.agents).toBeUndefined();
		expect(manifest.mcpServers).toBeUndefined();
	});
});
```

- [ ] **Step 4: 跑聚焦测试并修到全绿**

Run: `bun test tests/sync/pipeline.test.ts tests/smoke/asc-cli-skills.test.ts`

Expected: PASS

- [ ] **Step 5: 提交这一小步**

```bash
git add tests/sync/pipeline.test.ts tests/smoke/asc-cli-skills.test.ts
git commit -m "test: cover asc upstream sync and generated artifacts"
```

---

### Task 5: 文档化、生成产物、全量验证

**Files:**
- Modify: `README.md`
- Generate: `plugins/community--asc-cli-skills/**`
- Generate: `marketplace.json`
- Generate: `.github/plugin/marketplace.json`
- Generate: `.claude-plugin/marketplace.json`
- Generate: `data/sync-state.json`

- [ ] **Step 1: 先补 README 文档说明**

在 `README.md` 里至少补这三处：

```md
| Platform | Upstream Repo | Adapter |
|----------|--------------|---------|
| Community | `https://github.com/rorkai/app-store-connect-cli-skills.git` | `AscSkillsAdapter` |
```

```md
| `ASC_SKILLS_REPO_URL` | `https://github.com/rorkai/app-store-connect-cli-skills.git` | Override the ASC skills upstream |
```

```md
### Community Upstreams

The marketplace now includes `community--asc-cli-skills`, generated from the `rorkai/app-store-connect-cli-skills` repository.

Runtime prerequisite: install the `asc` CLI separately. The plugin ships the skill pack and documentation, not the CLI binary itself.
```

- [ ] **Step 2: 跑真实 sync，生成受管产物**

Run: `bun run sync`

Expected:
- `plugins/community--asc-cli-skills/` 出现
- `marketplace.json` 出现 `community--asc-cli-skills`
- `data/sync-state.json` 新增 `community` source 记录

- [ ] **Step 3: 跑完整验证**

Run: `bun test && bun run build`

Expected:
- `bun test`: PASS
- `bun run build`: PASS

- [ ] **Step 4: 做一次人工产物核对**

人工检查以下内容：

```bash
cat plugins/community--asc-cli-skills/plugin.json
cat plugins/community--asc-cli-skills/_meta.json
cat plugins/community--asc-cli-skills/README.md
cat marketplace.json
```

Expected:
- `plugin.json` 只有官方字段，且只声明 `skills`
- `_meta.json` 里 `_source.platform === "community"`
- `README.md` 明确 `asc` CLI 是运行时前置条件
- `marketplace.json` 条目描述包含 `(from Community)`

- [ ] **Step 5: 提交最终实现批次**

```bash
git add README.md plugins/community--asc-cli-skills marketplace.json .github/plugin/marketplace.json .claude-plugin/marketplace.json data/sync-state.json
git commit -m "feat: sync asc cli skills as a permanent upstream plugin"
```

---

## 风险检查清单

- 如果 `app-store-connect-cli-skills` 上游新增了非 `skills/` 目录级的重要资产，这个专用 adapter 当前不会自动暴露；这次实现接受这个边界。
- 如果上游未来引入原生 `plugin.json`，应优先转向原生 manifest，而不是继续长期维护合成 manifest。
- `asc` CLI 是运行时依赖，不应被误导为插件自带能力；README、_meta warnings、marketplace 描述都要反复强调这一点。
- `community` 目前是单 upstream 来源；如果未来第二个社区 skills 仓库进入范围，再考虑把 `repoUrls.community` 提升为数组化 `upstreams[]`。

## 验收标准

- `bun run sync` 后生成 `plugins/community--asc-cli-skills/`
- `marketplace.json`、`.github/plugin/marketplace.json`、`.claude-plugin/marketplace.json` 都包含 `community--asc-cli-skills`
- 所有新增/修改测试通过
- `README.md` 清楚说明这是常驻 upstream，且 `asc` CLI 需要单独安装
- 生成的插件 README / `_meta.json` 保留 upstream 溯源与运行时警告

## Self-Review

- Spec coverage:
	- “全量接入，不做小插件版本”：通过真实 sync 生成整个 upstream skill pack，而不是手工挑选子集。
	- “作为常驻 upstream 接入”：通过 `createDefaultSyncConfig()` 的默认 repo URL 与 `createPipeline()` 的固定 adapter 注册实现。
	- “可 review 的详尽 implementation plan”：当前文档已给出文件、测试、命令、回归面与非目标。
- Placeholder scan:
	- 无 `TBD` / `TODO` / “稍后实现”。
	- 所有任务都绑定了具体文件、命令与预期结果。
- Type consistency:
	- 新平台统一使用 `community`。
	- 生成插件名统一使用 `community--asc-cli-skills`。
	- 环境变量统一使用 `ASC_SKILLS_REPO_URL`。

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-27-asc-upstream-integration.md`.

Two execution options:

**1. Subagent-Driven (recommended)** - 我按 task 拆成独立实现批次推进，每个批次后回来看 diff / tests。

**2. Inline Execution** - 直接在当前会话按这个计划实现，并在关键检查点停下来给你 review。

Which approach?
