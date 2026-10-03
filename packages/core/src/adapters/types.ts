import type { JsonValue, NormalizedEvent } from "../domain.js";

type EventFields = Pick<NormalizedEvent, "actor" | "kind"> &
  Partial<Pick<NormalizedEvent, "timestamp" | "content" | "tool" | "metadata">>;

export type EventDraft = EventFields & {
  externalSessionId?: string;
  identity?: JsonValue;
};

export type AdaptResult =
  | { supported: true; events: EventDraft[] }
  | { supported: false; reason: string };

export interface TraceAdapter {
  adapt(record: unknown): AdaptResult;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export function asJsonValue(value: unknown): JsonValue | undefined {
  if (value === null || ["string", "number", "boolean"].includes(typeof value))
    return value as JsonValue;
  if (Array.isArray(value)) {
    const items = value.map(asJsonValue);
    return items.every((item) => item !== undefined) ? items : undefined;
  }
  if (isRecord(value)) {
    const output: Record<string, JsonValue> = {};
    for (const [key, item] of Object.entries(value)) {
      const normalized = asJsonValue(item);
      if (normalized === undefined) return undefined;
      output[key] = normalized;
    }
    return output;
  }
  return undefined;
}
