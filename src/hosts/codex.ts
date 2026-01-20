import path from "node:path";
import TOML from "@iarna/toml";
import { type HostAdapter, type ImportResult, type ApplyOptions } from "./types.js";
import { codexHome } from "../lib/paths.js";
import { backupFile, mkdirp, pathExists, readText, writeTextAtomic } from "../lib/fs.js";
import { sanitizeRecord } from "../lib/redact.js";
import type { ToolchainSpec, McpServerSpec, SkillSpec } from "../spec.js";

type CodexConfig = Record<string, any>;

const CONFIG_PATH = path.join(codexHome(), "config.toml");
const SKILLS_DIR = path.join(codexHome(), "skills");

function toSpecServers(cfg: CodexConfig): McpServerSpec[] {
  const out: McpServerSpec[] = [];
  const mcp = cfg.mcp_servers ?? cfg.mcpServers ?? {};
  if (typeof mcp !== "object" || !mcp) return out;
  for (const [name, server] of Object.entries(mcp as Record<string, any>)) {
    if (server?.url) {
      out.push({
        name,
        enabled: true,
        scope: "user",
        transport: { kind: "remote", url: String(server.url) },
      });
      continue;
    }
    if (server?.command) {
      out.push({
        name,
        enabled: true,
        scope: "user",
        transport: {
          kind: "stdio",
          command: String(server.command),
          args: Array.isArray(server.args) ? server.args.map(String) : [],
          env:
            sanitizeRecord(
              typeof server.env === "object" && server.env
                ? Object.fromEntries(Object.entries(server.env).map(([k, v]) => [k, String(v)]))
                : undefined,
            ) ?? {},
        },
      });
    }
  }
  return out;
}

function fromSpecServers(servers: McpServerSpec[]): Record<string, any> {
  const out: Record<string, any> = {};
  for (const s of servers) {
    if (s.transport.kind === "remote") {
      if (s.enabled) out[s.name] = { url: s.transport.url };
    } else {
      if (s.enabled) {
        out[s.name] = {
          command: s.transport.command,
          args: s.transport.args ?? [],
          env: s.transport.env ?? {},
        };
      }
    }
  }
  return out;
}

async function fsCpDir(srcDir: string, destDir: string): Promise<void> {
  const fs = await import("node:fs/promises");
  await fs.rm(destDir, { recursive: true, force: true });
  await fs.cp(srcDir, destDir, { recursive: true });
}

async function applyUserSkills(repoRoot: string, skills: SkillSpec[], opts: ApplyOptions): Promise<string[]> {
  const logs: string[] = [];
  await mkdirp(SKILLS_DIR);
  for (const skill of skills) {
    if (skill.scope !== "repo") continue;
    if (!skill.enabled) continue;
    const src = path.isAbsolute(skill.path) ? skill.path : path.join(repoRoot, skill.path);
    const dest = path.join(SKILLS_DIR, path.basename(src));
    if (opts.dryRun) {
      logs.push(`[codex] would sync skill dir ${src} -> ${dest}`);
      continue;
    }
    await fsCpDir(src, dest);
    logs.push(`[codex] synced skill dir ${src} -> ${dest}`);
  }
  return logs;
}

export const codexAdapter: HostAdapter = {
  id: "codex",
  async importFromSystem(_repoRoot: string): Promise<ImportResult> {
    const notes: string[] = [];
    const mcpServers: McpServerSpec[] = [];
    const skills: SkillSpec[] = [];
    if (await pathExists(CONFIG_PATH)) {
      const cfg = TOML.parse(await readText(CONFIG_PATH)) as CodexConfig;
      mcpServers.push(...toSpecServers(cfg));
      notes.push(`found Codex config at ${CONFIG_PATH}`);
    } else {
      notes.push(`Codex config not found at ${CONFIG_PATH}`);
    }
    return { mcpServers, skills, notes };
  },
  async applyFromSpec(repoRoot: string, spec: ToolchainSpec, options: ApplyOptions): Promise<string[]> {
    const logs: string[] = [];
    if (!(await pathExists(CONFIG_PATH))) {
      if (options.dryRun) logs.push(`[codex] would create ${CONFIG_PATH}`);
      else await mkdirp(path.dirname(CONFIG_PATH));
    }

    const base = (await pathExists(CONFIG_PATH)) ? (TOML.parse(await readText(CONFIG_PATH)) as CodexConfig) : ({} as CodexConfig);
    const existing: Record<string, any> = typeof base.mcp_servers === "object" && base.mcp_servers ? base.mcp_servers : {};
    const desired = fromSpecServers(spec.mcpServers);
    const merged: Record<string, any> = { ...existing, ...desired };
    for (const s of spec.mcpServers) {
      if (s.enabled) continue;
      delete merged[s.name];
    }
    base.mcp_servers = merged;

    if (options.dryRun) logs.push(`[codex] would write ${CONFIG_PATH}`);
    else {
      await backupFile(CONFIG_PATH);
      await writeTextAtomic(CONFIG_PATH, TOML.stringify(base));
      logs.push(`[codex] wrote ${CONFIG_PATH}`);
    }

    logs.push(...(await applyUserSkills(repoRoot, spec.skills, options)));
    return logs;
  },
};
