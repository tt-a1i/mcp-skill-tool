import path from "node:path";
import { type HostAdapter, type ImportResult, type ApplyOptions } from "./types.js";
import { mkdirp, pathExists, readJson, writeJson, backupFile } from "../lib/fs.js";
import { typedEntries } from "../lib/typed.js";
import { sanitizeRecord } from "../lib/redact.js";
import type { ToolchainSpec, McpServerSpec, SkillSpec } from "../spec.js";

type ClaudeMcpConfig = Record<
  string,
  | {
      command: string;
      args?: string[];
      env?: Record<string, string>;
    }
  | {
      type: "sse" | "http";
      url: string;
      headers?: Record<string, string>;
    }
>;

const MCP_CONFIG_PATH = ".mcp.json";
const SKILLS_DIR = ".claude/skills";

function toSpecServers(cfg: ClaudeMcpConfig): McpServerSpec[] {
  const out: McpServerSpec[] = [];
  for (const [name, server] of typedEntries(cfg)) {
    if ("url" in server) {
      out.push({
        name,
        enabled: true,
        scope: "repo",
        transport: { kind: "remote", url: server.url, headers: sanitizeRecord(server.headers) },
      });
      continue;
    }
    out.push({
      name,
      enabled: true,
      scope: "repo",
      transport: { kind: "stdio", command: server.command, args: server.args ?? [], env: sanitizeRecord(server.env) ?? {} },
    });
  }
  return out;
}

function fromSpecServers(servers: McpServerSpec[]): ClaudeMcpConfig {
  const cfg: ClaudeMcpConfig = {};
  for (const s of servers) {
    if (s.scope !== "repo") continue;
    if (s.transport.kind === "remote") {
      if (s.enabled) cfg[s.name] = { type: "sse", url: s.transport.url, headers: s.transport.headers };
    } else {
      if (s.enabled) cfg[s.name] = { command: s.transport.command, args: s.transport.args ?? [], env: s.transport.env ?? {} };
    }
  }
  return cfg;
}

async function fsCpDir(srcDir: string, destDir: string): Promise<void> {
  const fs = await import("node:fs/promises");
  await fs.rm(destDir, { recursive: true, force: true });
  await fs.cp(srcDir, destDir, { recursive: true });
}

async function applyRepoSkills(repoRoot: string, skills: SkillSpec[], opts: ApplyOptions): Promise<string[]> {
  const logs: string[] = [];
  const destDir = path.join(repoRoot, SKILLS_DIR);
  await mkdirp(destDir);
  for (const skill of skills) {
    if (skill.scope !== "repo") continue;
    if (!skill.enabled) continue;
    const src = path.isAbsolute(skill.path) ? skill.path : path.join(repoRoot, skill.path);
    const dest = path.join(destDir, path.basename(src));
    if (opts.dryRun) {
      logs.push(`[claude-code] would sync skill dir ${src} -> ${dest}`);
      continue;
    }
    await fsCpDir(src, dest);
    logs.push(`[claude-code] synced skill dir ${src} -> ${dest}`);
  }
  return logs;
}

export const claudeCodeAdapter: HostAdapter = {
  id: "claude-code",
  async importFromSystem(repoRoot: string): Promise<ImportResult> {
    const notes: string[] = [];
    const mcpServers: McpServerSpec[] = [];
    const skills: SkillSpec[] = [];
    const abs = path.join(repoRoot, MCP_CONFIG_PATH);
    if (await pathExists(abs)) {
      mcpServers.push(...toSpecServers(await readJson<ClaudeMcpConfig>(abs)));
      notes.push(`found Claude Code MCP config at ${MCP_CONFIG_PATH}`);
    } else {
      notes.push(`Claude Code MCP config not found at ${MCP_CONFIG_PATH}`);
    }
    return { mcpServers, skills, notes };
  },
  async applyFromSpec(repoRoot: string, spec: ToolchainSpec, options: ApplyOptions): Promise<string[]> {
    const logs: string[] = [];
    const abs = path.join(repoRoot, MCP_CONFIG_PATH);
    const existing: ClaudeMcpConfig = (await pathExists(abs)) ? await readJson<ClaudeMcpConfig>(abs) : {};
    const desired = fromSpecServers(spec.mcpServers);
    const merged: ClaudeMcpConfig = { ...existing, ...desired };
    for (const s of spec.mcpServers) {
      if (s.scope !== "repo") continue;
      if (s.enabled) continue;
      delete merged[s.name];
    }
    if (options.dryRun) logs.push(`[claude-code] would write ${MCP_CONFIG_PATH}`);
    else {
      await backupFile(abs);
      await writeJson(abs, merged);
      logs.push(`[claude-code] wrote ${MCP_CONFIG_PATH}`);
    }
    logs.push(...(await applyRepoSkills(repoRoot, spec.skills, options)));
    return logs;
  },
};
