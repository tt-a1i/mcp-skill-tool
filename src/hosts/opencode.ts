import path from "node:path";
import { type HostAdapter, type ImportResult, type ApplyOptions } from "./types.js";
import { pathExists, readJsonc, writeJson, backupFile } from "../lib/fs.js";
import { typedEntries } from "../lib/typed.js";
import { sanitizeRecord } from "../lib/redact.js";
import type { ToolchainSpec, McpServerSpec, SkillSpec } from "../spec.js";

type OpencodeConfig = {
  mcp?: Record<
    string,
    | {
        type: "local";
        command: string[];
        enabled?: boolean;
        environment?: Record<string, string>;
      }
    | {
        type: "remote";
        url: string;
        enabled?: boolean;
        headers?: Record<string, string>;
      }
  >;
};

const CONFIG_FILES = ["opencode.jsonc", "opencode.json"];

function toSpecServers(cfg: OpencodeConfig): McpServerSpec[] {
  const out: McpServerSpec[] = [];
  for (const [name, server] of typedEntries(cfg.mcp ?? {})) {
    const enabled = server.enabled ?? true;
    if (server.type === "remote") {
      out.push({
        name,
        enabled,
        scope: "repo",
        transport: { kind: "remote", url: server.url, headers: sanitizeRecord(server.headers) },
      });
    } else {
      const [command, ...args] = server.command;
      out.push({
        name,
        enabled,
        scope: "repo",
        transport: { kind: "stdio", command, args, env: sanitizeRecord(server.environment) },
      });
    }
  }
  return out;
}

function fromSpecServers(servers: McpServerSpec[]): OpencodeConfig["mcp"] {
  const out: NonNullable<OpencodeConfig["mcp"]> = {};
  for (const s of servers) {
    if (s.scope !== "repo") continue;
    if (s.transport.kind === "remote") {
      out[s.name] = { type: "remote", url: s.transport.url, enabled: s.enabled, headers: s.transport.headers };
    } else {
      out[s.name] = {
        type: "local",
        command: [s.transport.command, ...(s.transport.args ?? [])],
        enabled: s.enabled,
        environment: s.transport.env ?? {},
      };
    }
  }
  return out;
}

async function findConfigFile(repoRoot: string): Promise<string | null> {
  for (const file of CONFIG_FILES) {
    const abs = path.join(repoRoot, file);
    if (await pathExists(abs)) return abs;
  }
  return null;
}

export const opencodeAdapter: HostAdapter = {
  id: "opencode",
  async importFromSystem(repoRoot: string): Promise<ImportResult> {
    const notes: string[] = [];
    const mcpServers: McpServerSpec[] = [];
    const skills: SkillSpec[] = [];
    const configPath = await findConfigFile(repoRoot);
    if (!configPath) {
      notes.push(`opencode config not found (checked: ${CONFIG_FILES.join(", ")})`);
      return { mcpServers, skills, notes };
    }
    const cfg = await readJsonc<OpencodeConfig>(configPath);
    mcpServers.push(...toSpecServers(cfg));
    notes.push(`found opencode config at ${path.basename(configPath)}`);
    return { mcpServers, skills, notes };
  },
  async applyFromSpec(repoRoot: string, spec: ToolchainSpec, options: ApplyOptions): Promise<string[]> {
    const logs: string[] = [];
    const targetPath = path.join(repoRoot, "opencode.json");
    const base: OpencodeConfig = (await pathExists(targetPath)) ? await readJsonc<OpencodeConfig>(targetPath) : {};
    const desired = fromSpecServers(spec.mcpServers) ?? {};
    const merged: OpencodeConfig = { ...base, mcp: { ...(base.mcp ?? {}) } };
    for (const [name, server] of Object.entries(desired)) {
      if (server.enabled === false) delete merged.mcp?.[name];
      else merged.mcp![name] = server as any;
    }

    if (options.dryRun) logs.push(`[opencode] would write opencode.json`);
    else {
      await backupFile(targetPath);
      await writeJson(targetPath, merged);
      logs.push(`[opencode] wrote opencode.json`);
    }
    return logs;
  },
};
