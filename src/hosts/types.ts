import type { McpServerSpec, SkillSpec, ToolchainSpec } from "../spec.js";

export type ImportResult = {
  mcpServers: McpServerSpec[];
  skills: SkillSpec[];
  notes: string[];
};

export type ApplyOptions = {
  repoRoot: string;
  dryRun: boolean;
};

export type HostAdapter = {
  id: "antigravity" | "claude-code" | "gemini-cli" | "codex" | "opencode";
  importFromSystem(repoRoot: string): Promise<ImportResult>;
  applyFromSpec(repoRoot: string, spec: ToolchainSpec, options: ApplyOptions): Promise<string[]>;
};

