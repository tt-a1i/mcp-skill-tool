import { antigravityAdapter } from "./antigravity.js";
import { claudeCodeAdapter } from "./claude-code.js";
import { geminiCliAdapter } from "./gemini-cli.js";
import { codexAdapter } from "./codex.js";
import { opencodeAdapter } from "./opencode.js";
import type { HostAdapter } from "./types.js";

export const HOSTS: HostAdapter[] = [antigravityAdapter, claudeCodeAdapter, geminiCliAdapter, codexAdapter, opencodeAdapter];

export function resolveHosts(ids?: string[]): HostAdapter[] {
  if (!ids?.length) return HOSTS;
  const want = new Set(ids);
  const chosen = HOSTS.filter((h) => want.has(h.id));
  const missing = [...want].filter((id) => !HOSTS.some((h) => h.id === id));
  if (missing.length) throw new Error(`Unknown host(s): ${missing.join(", ")}. Valid: ${HOSTS.map((h) => h.id).join(", ")}`);
  return chosen;
}

