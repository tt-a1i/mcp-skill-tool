import { z } from "zod";

const Scope = z.enum(["repo", "user"]);

const McpServerTransport = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("stdio"),
    command: z.string(),
    args: z.array(z.string()).optional(),
    env: z.record(z.string(), z.string()).optional(),
    cwd: z.string().optional(),
  }),
  z.object({
    kind: z.literal("remote"),
    // We keep this generic across hosts. Adapters will map to sse/http/httpUrl/etc.
    url: z.string().url(),
    headers: z.record(z.string(), z.string()).optional(),
  }),
]);

export const McpServerSpec = z.object({
  name: z.string().min(1),
  enabled: z.boolean().default(true),
  scope: Scope.default("repo"),
  transport: McpServerTransport,
});

export const SkillSpec = z.object({
  name: z.string().min(1),
  enabled: z.boolean().default(true),
  scope: Scope.default("repo"),
  // In-repo canonical location to the skill directory (contains SKILL.md).
  path: z.string().min(1),
});

export const ToolchainSpec = z.object({
  version: z.literal(1),
  mcpServers: z.array(McpServerSpec).default([]),
  skills: z.array(SkillSpec).default([]),
});

export type ToolchainSpec = z.infer<typeof ToolchainSpec>;
export type McpServerSpec = z.infer<typeof McpServerSpec>;
export type SkillSpec = z.infer<typeof SkillSpec>;
