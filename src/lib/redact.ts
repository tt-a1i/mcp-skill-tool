const SECRET_KEY_LIKE = /(token|secret|password|api[_-]?key|access[_-]?token|refresh[_-]?token)/i;

function toEnvVarName(key: string): string {
  return key
    .trim()
    .replaceAll(/[^A-Za-z0-9]+/g, "_")
    .replaceAll(/^_+|_+$/g, "")
    .toUpperCase();
}

function looksSecretValue(value: string): boolean {
  if (/Bearer\s+\S+/i.test(value)) return true;
  if (/^figd_[A-Za-z0-9_-]+$/.test(value)) return true;
  if (/^(sk|rk|pk)_[A-Za-z0-9_-]+$/.test(value)) return true;
  if (/^sb_(publishable|secret)_[A-Za-z0-9_-]+$/.test(value)) return true;
  return false;
}

export function sanitizeKeyValue(key: string, value: string): string {
  if (value.startsWith("$") || value.startsWith("${")) return value;
  if (SECRET_KEY_LIKE.test(key) || /key$/i.test(key) || looksSecretValue(value)) {
    return "${" + toEnvVarName(key) + "}";
  }
  return value;
}

export function sanitizeRecord(record?: Record<string, string>): Record<string, string> | undefined {
  if (!record) return undefined;
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(record)) out[key] = sanitizeKeyValue(key, value);
  return out;
}

export function redactObject(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactObject);
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(obj)) {
      if (SECRET_KEY_LIKE.test(key)) out[key] = "***";
      else out[key] = redactObject(val);
    }
    return out;
  }
  if (typeof value === "string") {
    if (/Bearer\s+\S+/i.test(value)) return value.replace(/(Bearer)\s+\S+/gi, "$1 ***");
    return value;
  }
  return value;
}
