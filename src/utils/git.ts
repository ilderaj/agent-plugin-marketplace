import { stat } from "fs/promises";

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return false;
    }

    throw error;
  }
}

async function runGit(args: string[], cwd?: string): Promise<string> {
  const proc = Bun.spawn({
    cmd: ["git", ...args],
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);

  if (exitCode !== 0) {
    throw new Error(stderr.trim() || stdout.trim() || `git ${args.join(" ")} failed with exit code ${exitCode}`);
  }

  return stdout.trim();
}

export async function cloneOrPull(repoUrl: string, localDir: string): Promise<void> {
  if (await pathExists(localDir)) {
    const originUrl = await runGit(["remote", "get-url", "origin"], localDir);
    if (originUrl !== repoUrl) {
      throw new Error(`Existing repository origin mismatch: expected ${repoUrl}, found ${originUrl}`);
    }

    const branch = await runGit(["rev-parse", "--abbrev-ref", "HEAD"], localDir);
    if (!branch || branch === "HEAD") {
      throw new Error(`Cannot pull without an active branch in ${localDir}`);
    }

    await runGit(["pull", "--ff-only", "origin", branch], localDir);
    return;
  }

  await runGit(["clone", repoUrl, localDir]);
}

export async function getHeadSha(dir: string): Promise<string> {
  return runGit(["rev-parse", "HEAD"], dir);
}

export async function getFileCommitSha(dir: string, filePath: string): Promise<string> {
  const sha = await runGit(["log", "-n", "1", "--format=%H", "--", filePath], dir);

  if (!sha) {
    throw new Error(`No commit found for ${filePath}`);
  }

  return sha;
}
