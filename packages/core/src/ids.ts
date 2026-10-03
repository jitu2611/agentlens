import { createHash } from "node:crypto";
import type { JsonValue } from "./domain.js";

function canonicalize(value: JsonValue): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;

  const entries = Object.entries(value).sort(([left], [right]) =>
    left.localeCompare(right),
  );
  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalize(item)}`).join(",")}}`;
}

export function stableId(prefix: "trc" | "evt", parts: JsonValue[]): string {
  const hash = createHash("sha256")
    .update(canonicalize(parts))
    .digest("hex")
    .slice(0, 24);
  return `${prefix}_${hash}`;
}
