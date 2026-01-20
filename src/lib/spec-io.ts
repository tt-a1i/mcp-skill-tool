import fs from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";
import { ToolchainSpec, type ToolchainSpec as ToolchainSpecType } from "../spec.js";
import { mkdirp, pathExists, readText, writeTextAtomic } from "./fs.js";

export const DEFAULT_SPEC_PATH = "mcp-skill-tool.yaml";

export async function loadSpec(specPath: string): Promise<ToolchainSpecType> {
  const raw = await readText(specPath);
  const parsed = YAML.parse(raw);
  return ToolchainSpec.parse(parsed);
}

export async function saveSpec(specPath: string, spec: ToolchainSpecType): Promise<void> {
  const doc = new YAML.Document(spec);
  doc.contents = spec as any;
  const out = doc.toString({ lineWidth: 0 });
  await writeTextAtomic(specPath, out);
}

export async function initSpecIfMissing(specPath: string): Promise<{ created: boolean }> {
  if (await pathExists(specPath)) return { created: false };
  await mkdirp(path.dirname(specPath));
  const initial: ToolchainSpecType = { version: 1, mcpServers: [], skills: [] };
  await saveSpec(specPath, initial);
  // also create conventional skill dir
  const skillsDir = path.join(path.dirname(specPath), "skills");
  await fs.mkdir(skillsDir, { recursive: true });
  return { created: true };
}

