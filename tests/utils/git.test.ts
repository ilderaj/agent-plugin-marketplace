import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, readFile, rm, writeFile } from "fs/promises";
import { randomUUID } from "crypto";
import { join } from "path";
import { cloneOrPull, getFileCommitSha, getHeadSha } from "../../src/utils/git";

const GENERATED_ROOT = join(import.meta.dir, "..", ".generated", "git-utils");
const createdDirs: string[] = [];

async function createWorkspace(name: string): Promise<string> {
  await mkdir(GENERATED_ROOT, { recursive: true });
  const dir = join(GENERATED_ROOT, `${name}-${randomUUID()}`);
  await mkdir(dir, { recursive: true });
  createdDirs.push(dir);
  return dir;
}

async function runGit(args: string[], cwd?: string): Promise<string> {
  const proc = Bun.spawn({
    cmd: ["git", ...args],
    cwd,
    stderr: "pipe",
    stdout: "pipe",
  });

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);

  if (exitCode !== 0) {
    throw new Error(stderr.trim() || stdout.trim() || `git ${args.join(" ")} failed`);
  }

  return stdout.trim();
}

async function createRemoteWithInitialCommit() {
  const workspace = await createWorkspace("remote");
  const bareRepo = join(workspace, "origin.git");
  const bareRepoUrl = `file://${bareRepo}`;
  const sourceRepo = join(workspace, "source");

  await runGit(["init", "--bare", bareRepo]);
  await runGit(["init", sourceRepo]);
  await runGit(["config", "user.name", "Test User"], sourceRepo);
  await runGit(["config", "user.email", "test@example.com"], sourceRepo);
  await writeFile(join(sourceRepo, "README.md"), "hello\n");
  await runGit(["add", "README.md"], sourceRepo);
  await runGit(["commit", "-m", "Initial commit"], sourceRepo);
  await runGit(["remote", "add", "origin", bareRepo], sourceRepo);
  await runGit(["push", "-u", "origin", "HEAD"], sourceRepo);

  return { bareRepo, bareRepoUrl, sourceRepo };
}

afterEach(async () => {
  await Promise.all(createdDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("git utilities", () => {
  test("cloneOrPull clones from a local bare repo into a missing directory", async () => {
    const { bareRepoUrl } = await createRemoteWithInitialCommit();
    const cloneDir = join(await createWorkspace("clone"), "checkout");

    await cloneOrPull(bareRepoUrl, cloneDir);

    await expect(readFile(join(cloneDir, "README.md"), "utf-8")).resolves.toBe("hello\n");
    await expect(getHeadSha(cloneDir)).resolves.toMatch(/^[0-9a-f]{40}$/);
  });

  test("cloneOrPull pulls the latest commit into an existing clone", async () => {
    const { bareRepoUrl, sourceRepo } = await createRemoteWithInitialCommit();
    const cloneDir = join(await createWorkspace("pull"), "checkout");

    await cloneOrPull(bareRepoUrl, cloneDir);
    await writeFile(join(cloneDir, ".marker"), "keep-me\n");
    await writeFile(join(sourceRepo, "README.md"), "updated\n");
    await runGit(["add", "README.md"], sourceRepo);
    await runGit(["commit", "-m", "Update readme"], sourceRepo);
    await runGit(["push", "origin", "HEAD"], sourceRepo);
    const latestSha = await runGit(["rev-parse", "HEAD"], sourceRepo);

    await cloneOrPull(bareRepoUrl, cloneDir);

    await expect(readFile(join(cloneDir, "README.md"), "utf-8")).resolves.toBe("updated\n");
    await expect(readFile(join(cloneDir, ".marker"), "utf-8")).resolves.toBe("keep-me\n");
    await expect(getHeadSha(cloneDir)).resolves.toBe(latestSha);
  });

  test("cloneOrPull fails clearly when the existing clone points at a different origin", async () => {
    const { bareRepoUrl: firstRepoUrl } = await createRemoteWithInitialCommit();
    const { bareRepoUrl: secondRepoUrl } = await createRemoteWithInitialCommit();
    const cloneDir = join(await createWorkspace("mismatched-remote"), "checkout");

    await cloneOrPull(firstRepoUrl, cloneDir);

    await expect(cloneOrPull(secondRepoUrl, cloneDir)).rejects.toThrow(/origin|remote/i);
  });

  test("getHeadSha returns the current HEAD commit sha", async () => {
    const { bareRepoUrl, sourceRepo } = await createRemoteWithInitialCommit();
    const cloneDir = join(await createWorkspace("head-sha"), "checkout");

    await cloneOrPull(bareRepoUrl, cloneDir);

    const expectedSha = await runGit(["rev-parse", "HEAD"], sourceRepo);
    const actualSha = await getHeadSha(cloneDir);
    expect(actualSha).toBe(expectedSha);
  });

  test("getFileCommitSha returns the last commit touching a file", async () => {
    const { bareRepoUrl, sourceRepo } = await createRemoteWithInitialCommit();
    const cloneDir = join(await createWorkspace("file-sha"), "checkout");

    await writeFile(join(sourceRepo, "notes.md"), "first\n");
    await runGit(["add", "notes.md"], sourceRepo);
    await runGit(["commit", "-m", "Add notes"], sourceRepo);
    const fileCommitSha = await runGit(["rev-parse", "HEAD"], sourceRepo);
    await writeFile(join(sourceRepo, "README.md"), "second update\n");
    await runGit(["add", "README.md"], sourceRepo);
    await runGit(["commit", "-m", "Update readme again"], sourceRepo);
    await runGit(["push", "origin", "HEAD"], sourceRepo);

    await cloneOrPull(bareRepoUrl, cloneDir);

    await expect(getFileCommitSha(cloneDir, "notes.md")).resolves.toBe(fileCommitSha);
  });

  test("git command failures surface stderr when operating on an invalid repository directory", async () => {
    const plainDir = await createWorkspace("plain-dir");
    await writeFile(join(plainDir, ".git"), "gitdir: missing-repo\n");

    await expect(cloneOrPull("ignored", plainDir)).rejects.toThrow(/git repository|gitdir/i);
  });
});
