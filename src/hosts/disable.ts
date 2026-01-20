import path from "node:path";
import fs from "node:fs/promises";
import TOML from "@iarna/toml";
import { antigravityDir, claudeHome, codexHome, geminiHome } from "../lib/paths.js";
import { backupFile, mkdirp, pathExists, readJson, readJsonc, readText, writeJson, writeTextAtomic } from "../lib/fs.js";

export type HostId = "antigravity" | "claude-code" | "gemini-cli" | "codex" | "opencode";

export async function disableMcpOnHost(opts: {
  repoRoot: string;
  host: HostId;
  name: string;
  dryRun: boolean;
}): Promise<string[]> {
  const { repoRoot, host, name, dryRun } = opts;
  const logs: string[] = [];

  if (host === "antigravity") {
    const cfgPath = path.join(antigravityDir(), "mcp_config.json");
    if (!(await pathExists(cfgPath))) return [`[antigravity] no mcp_config.json at ${cfgPath}`];
    const cfg = await readJson<any>(cfgPath);
    if (!cfg?.mcpServers?.[name]) return [`[antigravity] mcp server not found: ${name}`];
    delete cfg.mcpServers[name];
    if (dryRun) return [`[antigravity] would remove ${name} from ${cfgPath}`];
    await backupFile(cfgPath);
    await writeJson(cfgPath, cfg);
    return [`[antigravity] removed ${name} from ${cfgPath}`];
  }

  if (host === "claude-code") {
    const cfgPath = path.join(repoRoot, ".mcp.json");
    if (!(await pathExists(cfgPath))) return [`[claude-code] no .mcp.json in repo`];
    const cfg = await readJson<any>(cfgPath);
    if (!cfg?.[name]) return [`[claude-code] mcp server not found: ${name}`];
    delete cfg[name];
    if (dryRun) return [`[claude-code] would remove ${name} from .mcp.json`];
    await backupFile(cfgPath);
    await writeJson(cfgPath, cfg);
    return [`[claude-code] removed ${name} from .mcp.json`];
  }

  if (host === "gemini-cli") {
    const cfgPath = path.join(repoRoot, ".gemini", "settings.json");
    if (!(await pathExists(cfgPath))) return [`[gemini-cli] no .gemini/settings.json in repo`];
    const cfg = await readJson<any>(cfgPath);
    if (!cfg?.mcpServers?.[name]) return [`[gemini-cli] mcp server not found: ${name}`];
    delete cfg.mcpServers[name];
    if (dryRun) return [`[gemini-cli] would remove ${name} from .gemini/settings.json`];
    await backupFile(cfgPath);
    await writeJson(cfgPath, cfg);
    return [`[gemini-cli] removed ${name} from .gemini/settings.json`];
  }

  if (host === "codex") {
    const cfgPath = path.join(codexHome(), "config.toml");
    if (!(await pathExists(cfgPath))) return [`[codex] no config.toml at ${cfgPath}`];
    const base = TOML.parse(await readText(cfgPath)) as any;
    if (!base?.mcp_servers?.[name]) return [`[codex] mcp server not found: ${name}`];
    delete base.mcp_servers[name];
    if (dryRun) return [`[codex] would remove ${name} from ${cfgPath}`];
    await backupFile(cfgPath);
    await writeTextAtomic(cfgPath, TOML.stringify(base));
    return [`[codex] removed ${name} from ${cfgPath}`];
  }

  // opencode: prefer native enable flag rather than deletion
  if (host === "opencode") {
    const cfgPath = path.join(repoRoot, "opencode.json");
    if (!(await pathExists(cfgPath))) return [`[opencode] no opencode.json in repo`];
    const cfg = await readJsonc<any>(cfgPath);
    if (!cfg?.mcp?.[name]) return [`[opencode] mcp server not found: ${name}`];
    cfg.mcp[name].enabled = false;
    if (dryRun) return [`[opencode] would set mcp.${name}.enabled=false in opencode.json`];
    await backupFile(cfgPath);
    await writeJson(cfgPath, cfg);
    return [`[opencode] disabled ${name} in opencode.json`];
  }

  return logs;
}

function skillBaseDir(repoRoot: string, host: HostId, scope: "repo" | "user"): string {
  if (host === "antigravity") return scope === "repo" ? path.join(repoRoot, ".agent", "skills") : path.join(antigravityDir(), "skills");
  if (host === "claude-code") return scope === "repo" ? path.join(repoRoot, ".claude", "skills") : path.join(claudeHome(), "skills");
  if (host === "gemini-cli") return scope === "repo" ? path.join(repoRoot, ".gemini", "skills") : path.join(geminiHome(), "skills");
  return path.join(codexHome(), "skills");
}

export async function disableSkillOnHost(opts: {
  repoRoot: string;
  host: Exclude<HostId, "opencode">;
  name: string;
  scope?: "repo" | "user";
  dryRun: boolean;
}): Promise<string[]> {
  const { repoRoot, host, name, dryRun } = opts;
  const scope = host === "codex" ? "user" : (opts.scope ?? "repo");
  const base = skillBaseDir(repoRoot, host, scope);
  const src = path.join(base, name);
  if (!(await pathExists(src))) return [`[${host}] skill not found: ${scope}:${name}`];

  const disabledDir = path.join(base, ".disabled");
  const dest = path.join(disabledDir, name);
  if (dryRun) return [`[${host}] would move skill ${src} -> ${dest}`];

  await mkdirp(disabledDir);
  await fs.rm(dest, { recursive: true, force: true });
  await fs.rename(src, dest);
  return [`[${host}] disabled skill ${scope}:${name}`];
}

