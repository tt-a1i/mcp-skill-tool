import fs from "node:fs/promises";
import path from "node:path";
import { parse as parseJsonc, printParseErrorCode } from "jsonc-parser/lib/esm/main.js";

export async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function mkdirp(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

export async function readText(filePath: string): Promise<string> {
  return fs.readFile(filePath, "utf8");
}

export async function writeTextAtomic(filePath: string, contents: string): Promise<void> {
  await mkdirp(path.dirname(filePath));
  const tmpPath = `${filePath}.tmp.${Date.now()}`;
  await fs.writeFile(tmpPath, contents, "utf8");
  await fs.rename(tmpPath, filePath);
}

export async function backupFile(filePath: string): Promise<string | null> {
  if (!(await pathExists(filePath))) return null;
  const backupPath = `${filePath}.bak.${new Date().toISOString().replaceAll(":", "").replaceAll(".", "")}`;
  await fs.copyFile(filePath, backupPath);
  return backupPath;
}

export async function readJson<T>(filePath: string): Promise<T> {
  const raw = await readText(filePath);
  return JSON.parse(raw) as T;
}

export async function readJsonc<T>(filePath: string): Promise<T> {
  const raw = await readText(filePath);
  const errors: any[] = [];
  const value = parseJsonc(raw, errors, { allowTrailingComma: true, disallowComments: false });
  if (errors.length) {
    const first = errors[0];
    throw new Error(
      `Failed to parse JSONC: ${filePath} (${printParseErrorCode(first.error)} at offset ${first.offset})`,
    );
  }
  return value as T;
}

export async function writeJson(filePath: string, value: unknown): Promise<void> {
  await writeTextAtomic(filePath, JSON.stringify(value, null, 2) + "\n");
}
