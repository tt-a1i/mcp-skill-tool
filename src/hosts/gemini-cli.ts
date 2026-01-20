import path from "node:path";
import { type HostAdapter, type ImportResult, type ApplyOptions } from "./types.js";
import { mkdirp, pathExists, readJson, writeJson, backupFile } from "../lib/fs.js";
import { typedEntries } from "../lib/typed.js";
import { sanitizeRecord } from "../lib/redact.js";
import type { ToolchainSpec, McpServerSpec, SkillSpec } from "../spec.js";

type GeminiProjectSettings = {
  mcpServers?: Record<
    string,
    | {
        command: string;
        args?: string[];
        env?: Record<string, string>;
        cwd?: string;
        timeout?: number;
        trust?: boolean;
      }
    | {
        url: string;
        headers?: Record<string, string>;
      }
    | {
        httpUrl: string;
        headers?: Record<string, string>;
      }
  >;
};

const SETTINGS_PATH = path.join(".gemini", "settings.json");
const SKILLS_DIR = path.join(".gemini", "skills");

function toSpecServers(settings: GeminiProjectSettings): McpServerSpec[] {
  const out: McpServerSpec[] = [];
  for (const [name, server] of typedEntries(settings.mcpServers ?? {})) {
    if ("url" in server) {
      out.push({
        name,
        enabled: true,
        scope: "repo",
        transport: { kind: "remote", url: server.url, headers: sanitizeRecord(server.headers) },
      });
      continue;
    }
    if ("httpUrl" in server) {
      out.push({
        name,
        enabled: true,
        scope: "repo",
        transport: { kind: "remote", url: server.httpUrl, headers: sanitizeRecord(server.headers) },
      });
      continue;
    }
    out.push({
      name,
      enabled: true,
      scope: "repo",
      transport: {
        kind: "stdio",
        command: server.command,
        args: server.args ?? [],
        env: sanitizeRecord(server.env) ?? {},
        cwd: server.cwd,
      },
    });
  }
  return out;
}

function fromSpecServers(servers: McpServerSpec[]): GeminiProjectSettings {
  const mcpServers: NonNullable<GeminiProjectSettings["mcpServers"]> = {};
  for (const s of servers) {
    if (s.scope !== "repo") continue;
    if (s.transport.kind === "remote") {
      if (s.enabled) {
        // Gemini supports url (SSE) and httpUrl (streamable HTTP); we default to `url`.
        mcpServers[s.name] = { url: s.transport.url, headers: s.transport.headers };
      }
    } else {
      if (s.enabled) {
        mcpServers[s.name] = {
          command: s.transport.command,
          args: s.transport.args ?? [],
          env: s.transport.env ?? {},
          cwd: s.transport.cwd,
        };
      }
    }
  }
  return { mcpServers };
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
      logs.push(`[gemini-cli] would sync skill dir ${src} -> ${dest}`);
      continue;
    }
    await fsCpDir(src, dest);
    logs.push(`[gemini-cli] synced skill dir ${src} -> ${dest}`);
  }
  return logs;
}

export const geminiCliAdapter: HostAdapter = {
  id: "gemini-cli",
  async importFromSystem(repoRoot: string): Promise<ImportResult> {
    const notes: string[] = [];
    const mcpServers: McpServerSpec[] = [];
    const skills: SkillSpec[] = [];
    const abs = path.join(repoRoot, SETTINGS_PATH);
    if (await pathExists(abs)) {
      mcpServers.push(...toSpecServers(await readJson<GeminiProjectSettings>(abs)));
      notes.push(`found Gemini CLI project settings at ${SETTINGS_PATH}`);
    } else {
      notes.push(`Gemini CLI project settings not found at ${SETTINGS_PATH}`);
    }
    return { mcpServers, skills, notes };
  },
  async applyFromSpec(repoRoot: string, spec: ToolchainSpec, options: ApplyOptions): Promise<string[]> {
    const logs: string[] = [];
    const abs = path.join(repoRoot, SETTINGS_PATH);
    const existing: GeminiProjectSettings = (await pathExists(abs)) ? await readJson<GeminiProjectSettings>(abs) : {};
    const desired = fromSpecServers(spec.mcpServers);
    const merged: GeminiProjectSettings = { ...existing, mcpServers: { ...(existing.mcpServers ?? {}) } };
    for (const [name, server] of Object.entries(desired.mcpServers ?? {})) merged.mcpServers![name] = server as any;
    for (const s of spec.mcpServers) {
      if (s.scope !== "repo") continue;
      if (s.enabled) continue;
      delete merged.mcpServers?.[s.name];
    }
    if (options.dryRun) logs.push(`[gemini-cli] would write ${SETTINGS_PATH}`);
    else {
      await backupFile(abs);
      await writeJson(abs, merged);
      logs.push(`[gemini-cli] wrote ${SETTINGS_PATH}`);
    }
    logs.push(...(await applyRepoSkills(repoRoot, spec.skills, options)));
    return logs;
  },
};
