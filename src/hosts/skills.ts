import fs from "node:fs/promises";
import path from "node:path";
import { antigravityDir, claudeHome, codexHome, geminiHome } from "../lib/paths.js";
import { mkdirp, pathExists } from "../lib/fs.js";

export type SkillLocation = {
  host: "antigravity" | "claude-code" | "gemini-cli" | "codex";
  scope: "user" | "repo";
  name: string;
  dir: string;
};

async function listSkillDirs(baseDir: string, host: SkillLocation["host"], scope: SkillLocation["scope"]): Promise<SkillLocation[]> {
  if (!(await pathExists(baseDir))) return [];
  const entries = await fs.readdir(baseDir, { withFileTypes: true });
  const out: SkillLocation[] = [];
  for (const ent of entries) {
    if (!ent.isDirectory()) continue;
    const dir = path.join(baseDir, ent.name);
    const skillMd = path.join(dir, "SKILL.md");
    if (!(await pathExists(skillMd))) continue;
    out.push({ host, scope, name: ent.name, dir });
  }
  return out;
}

export async function listSkills(repoRoot: string, host?: SkillLocation["host"]): Promise<SkillLocation[]> {
  const all: SkillLocation[] = [];
  if (!host || host === "antigravity") {
    // Antigravity skills:
    // - workspace: <repo>/.agent/skills
    // - global: ~/.gemini/antigravity/skills
    all.push(...(await listSkillDirs(path.join(repoRoot, ".agent", "skills"), "antigravity", "repo")));
    all.push(...(await listSkillDirs(path.join(antigravityDir(), "skills"), "antigravity", "user")));
  }
  if (!host || host === "claude-code") {
    all.push(...(await listSkillDirs(path.join(repoRoot, ".claude", "skills"), "claude-code", "repo")));
    all.push(...(await listSkillDirs(path.join(claudeHome(), "skills"), "claude-code", "user")));
  }
  if (!host || host === "gemini-cli") {
    all.push(...(await listSkillDirs(path.join(repoRoot, ".gemini", "skills"), "gemini-cli", "repo")));
    all.push(...(await listSkillDirs(path.join(geminiHome(), "skills"), "gemini-cli", "user")));
  }
  if (!host || host === "codex") {
    all.push(...(await listSkillDirs(path.join(codexHome(), "skills"), "codex", "user")));
  }
  return all.sort((a, b) => (a.host + ":" + a.scope + ":" + a.name).localeCompare(b.host + ":" + b.scope + ":" + b.name));
}

async function fsCpDir(srcDir: string, destDir: string): Promise<void> {
  await fs.rm(destDir, { recursive: true, force: true });
  await fs.cp(srcDir, destDir, { recursive: true });
}

export async function installSkillToHost(opts: {
  repoRoot: string;
  host: SkillLocation["host"];
  destScope: SkillLocation["scope"];
  srcDir: string;
  name: string;
  dryRun: boolean;
}): Promise<string> {
  const { repoRoot, host, destScope, srcDir, name, dryRun } = opts;

  let destBase: string;
  if (host === "antigravity") {
    destBase = destScope === "repo" ? path.join(repoRoot, ".agent", "skills") : path.join(antigravityDir(), "skills");
  } else if (host === "claude-code") {
    destBase = destScope === "repo" ? path.join(repoRoot, ".claude", "skills") : path.join(claudeHome(), "skills");
  } else if (host === "gemini-cli") {
    destBase = destScope === "repo" ? path.join(repoRoot, ".gemini", "skills") : path.join(geminiHome(), "skills");
  } else {
    // codex only supports user scope
    destBase = path.join(codexHome(), "skills");
  }

  const destDir = path.join(destBase, name);
  if (dryRun) return `[${host}] would install skill ${name} -> ${destDir}`;

  await mkdirp(destBase);
  await fsCpDir(srcDir, destDir);
  return `[${host}] installed skill ${name} -> ${destDir}`;
}

