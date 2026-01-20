import os from "node:os";
import path from "node:path";

export type Platform = NodeJS.Platform;

export function repoRoot(cwd = process.cwd()): string {
  return cwd;
}

export function userHome(): string {
  return os.homedir();
}

export function ensurePosixSlashes(p: string): string {
  return p.replaceAll("\\", "/");
}

export function codexHome(): string {
  return path.join(userHome(), ".codex");
}

export function geminiHome(): string {
  return path.join(userHome(), ".gemini");
}

export function antigravityDir(): string {
  return path.join(geminiHome(), "antigravity");
}

export function claudeHome(): string {
  return path.join(userHome(), ".claude");
}

export function opencodeGlobalConfigDir(): string {
  // opencode follows XDG_CONFIG_HOME; we align with default "~/.config/opencode".
  return path.join(userHome(), ".config", "opencode");
}

