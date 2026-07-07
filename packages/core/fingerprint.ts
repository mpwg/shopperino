import { createHash } from "node:crypto";

type FingerprintPart = string | number | null | undefined;

export function stableFingerprint(parts: Record<string, FingerprintPart>): string {
  const canonical = Object.keys(parts)
    .sort()
    .map((key) => `${key}=${normalizePart(parts[key])}`)
    .join("|");

  return createHash("sha256").update(canonical).digest("hex");
}

function normalizePart(part: FingerprintPart): string {
  if (part === null || part === undefined) {
    return "";
  }

  return String(part).trim().toLowerCase().replace(/\s+/g, " ");
}
