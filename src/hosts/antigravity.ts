import path from "node:path";
import { type HostAdapter, type ImportResult, type ApplyOptions } from "./types.js";
import { antigravityDir } from "../lib/paths.js";
import { backupFile, pathExists, readJson, writeJson, mkdirp } from "../lib/fs.js";
import { typedEntries } from "../lib/typed.js";
import { sanitizeRecord } from "../lib/redact.js";
import type { ToolchainSpec, McpServerSpec, SkillSpec } from "../spec.js";

type AntigravityMcpConfig = {
  mcpServers?: Record<
    string,
    {
      command?: string;
      args?: string[];
      env?: Record<string, string>;
      url?: string;
      headers?: Record<string, string>;
      type?: string;
    }
  >;
};

const MCP_CONFIG_PATH = path.join(antigravityDir(), "mcp_config.json");

function toSpecServers(cfg: AntigravityMcpConfig): McpServerSpec[] {
  const out: McpServerSpec[] = [];
  for (const [name, server] of typedEntries(cfg.mcpServers ?? {})) {
    if (server.url) {
      out.push({
        name,
        enabled: true,
        scope: "user",
        transport: { kind: "remote", url: server.url, headers: sanitizeRecord(server.headers) },
      });
      continue;
    }
    if (server.command) {
      out.push({
        name,
        enabled: true,
        scope: "user",
        transport: { kind: "stdio", command: server.command, args: server.args, env: sanitizeRecord(server.env) },
      });
    }
  }
  return out;
}

function fromSpecServers(servers: McpServerSpec[]): AntigravityMcpConfig {
  const mcpServers: NonNullable<AntigravityMcpConfig["mcpServers"]> = {};
  for (const s of servers) {
    if (s.scope !== "user") continue; // Antigravity MCP is user-scoped on disk
    if (s.transport.kind === "remote") {
      if (s.enabled) mcpServers[s.name] = { url: s.transport.url, headers: s.transport.headers };
    } else {
      if (s.enabled) {
        mcpServers[s.name] = {
          command: s.transport.command,
          args: s.transport.args ?? [],
          env: s.transport.env ?? {},
        };
      }
    }
  }
  return { mcpServers };
}

function discoverRepoSkills(repoRoot: string): SkillSpec[] {
  // Canonical skills live under repo `skills/<name>/SKILL.md`.
  // For now, we don't auto-scan to avoid expensive traversal; `init/import` can add explicitly later.
  void repoRoot;
  return [];
}

function antigravityWorkspaceSkillsDir(repoRoot: string): string {
  return path.join(repoRoot, ".agent", "skills");
}

async function applyWorkspaceSkills(repoRoot: string, skills: SkillSpec[], opts: ApplyOptions): Promise<string[]> {
  const logs: string[] = [];
  const destDir = antigravityWorkspaceSkillsDir(repoRoot);
  await mkdirp(destDir);

  for (const skill of skills) {
    if (skill.scope !== "repo") continue;
    if (!skill.enabled) continue;
    const src = path.isAbsolute(skill.path) ? skill.path : path.join(repoRoot, skill.path);
    const dest = path.join(destDir, path.basename(src));
    if (opts.dryRun) {
      logs.push(`[antigravity] would sync skill dir ${src} -> ${dest}`);
      continue;
    }
    // naive copy: keep minimal for MVP. (recursive copy requires Node 16.7+)
    await fsCpDir(src, dest);
    logs.push(`[antigravity] synced skill dir ${src} -> ${dest}`);
  }

  return logs;
}

async function fsCpDir(srcDir: string, destDir: string): Promise<void> {
  const fs = await import("node:fs/promises");
  await fs.rm(destDir, { recursive: true, force: true });
  await fs.cp(srcDir, destDir, { recursive: true });
}

export const antigravityAdapter: HostAdapter = {
  id: "antigravity",
  async importFromSystem(repoRoot: string): Promise<ImportResult> {
    const notes: string[] = [];
    const mcpServers: McpServerSpec[] = [];
    if (await pathExists(MCP_CONFIG_PATH)) {
      const cfg = await readJson<AntigravityMcpConfig>(MCP_CONFIG_PATH);
      mcpServers.push(...toSpecServers(cfg));
      notes.push(`found Antigravity MCP config at ${MCP_CONFIG_PATH}`);
    } else {
      notes.push(`Antigravity MCP config not found at ${MCP_CONFIG_PATH}`);
    }
    const skills = discoverRepoSkills(repoRoot);
    return { mcpServers, skills, notes };
  },
  async applyFromSpec(repoRoot: string, spec: ToolchainSpec, options: ApplyOptions): Promise<string[]> {
    const logs: string[] = [];
    const existing: AntigravityMcpConfig = (await pathExists(MCP_CONFIG_PATH))
      ? await readJson<AntigravityMcpConfig>(MCP_CONFIG_PATH)
      : { mcpServers: {} };
    const desiredCfg = fromSpecServers(spec.mcpServers);
    const merged: AntigravityMcpConfig = { mcpServers: { ...(existing.mcpServers ?? {}) } };
    for (const [name, server] of Object.entries(desiredCfg.mcpServers ?? {})) merged.mcpServers![name] = server;
    for (const s of spec.mcpServers) {
      if (s.scope !== "user") continue;
      if (s.enabled) continue;
      delete merged.mcpServers?.[s.name];
    }
    if (options.dryRun) {
      logs.push(`[antigravity] would write ${MCP_CONFIG_PATH}`);
    } else {
      await backupFile(MCP_CONFIG_PATH);
      await writeJson(MCP_CONFIG_PATH, merged);
      logs.push(`[antigravity] wrote ${MCP_CONFIG_PATH}`);
    }
    logs.push(...(await applyWorkspaceSkills(repoRoot, spec.skills, options)));
    return logs;
  },
};
