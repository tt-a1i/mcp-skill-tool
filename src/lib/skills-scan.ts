import fs from "node:fs/promises";
import path from "node:path";
import { pathExists } from "./fs.js";
import type { SkillSpec } from "../spec.js";

export async function scanRepoSkills(repoRoot: string): Promise<SkillSpec[]> {
  const dir = path.join(repoRoot, "skills");
  if (!(await pathExists(dir))) return [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const out: SkillSpec[] = [];
  for (const ent of entries) {
    if (!ent.isDirectory()) continue;
    const skillDir = path.join("skills", ent.name);
    const skillMd = path.join(repoRoot, skillDir, "SKILL.md");
    if (!(await pathExists(skillMd))) continue;
    out.push({ name: ent.name, enabled: true, scope: "repo", path: skillDir });
  }
  return out;
}

