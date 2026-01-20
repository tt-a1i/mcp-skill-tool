import type { McpServerSpec, SkillSpec, ToolchainSpec } from "../spec.js";
import { sanitizeRecord } from "./redact.js";

function mcpKey(s: McpServerSpec): string {
  return `${s.scope}:${s.name}`;
}

function skillKey(s: SkillSpec): string {
  return `${s.scope}:${s.name}`;
}

export function mergeSpec(base: ToolchainSpec, incoming: Partial<ToolchainSpec>): ToolchainSpec {
  const mcpMap = new Map<string, McpServerSpec>();
  for (const s of base.mcpServers) mcpMap.set(mcpKey(s), s);
  for (const s of incoming.mcpServers ?? []) {
    const key = mcpKey(s);
    if (!mcpMap.has(key)) mcpMap.set(key, s);
  }

  const skillMap = new Map<string, SkillSpec>();
  for (const s of base.skills) skillMap.set(skillKey(s), s);
  for (const s of incoming.skills ?? []) {
    const key = skillKey(s);
    if (!skillMap.has(key)) skillMap.set(key, s);
  }

  return {
    version: 1,
    mcpServers: [...mcpMap.values()].sort((a, b) => a.name.localeCompare(b.name)),
    skills: [...skillMap.values()].sort((a, b) => a.name.localeCompare(b.name)),
  };
}

export function setMcpEnabled(spec: ToolchainSpec, name: string, enabled: boolean): ToolchainSpec {
  return {
    ...spec,
    mcpServers: spec.mcpServers.map((s) => (s.name === name ? { ...s, enabled } : s)),
  };
}

export function setSkillEnabled(spec: ToolchainSpec, name: string, enabled: boolean): ToolchainSpec {
  return {
    ...spec,
    skills: spec.skills.map((s) => (s.name === name ? { ...s, enabled } : s)),
  };
}

export function sanitizeSpecSecrets(spec: ToolchainSpec): ToolchainSpec {
  // Keep this conservative: only transform env/headers values; do not guess URLs.
  return {
    ...spec,
    mcpServers: spec.mcpServers.map((s) => {
      if (s.transport.kind === "remote") {
        return {
          ...s,
          transport: { ...s.transport, headers: sanitizeRecord(s.transport.headers) },
        };
      }
      return {
        ...s,
        transport: { ...s.transport, env: sanitizeRecord(s.transport.env) },
      };
    }),
  };
}
