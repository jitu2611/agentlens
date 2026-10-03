import {
  ImportDiagnosticSchema,
  NormalizedEventSchema,
  TraceDescriptorSchema,
  type ImportItem,
  type Provider,
  type TraceDescriptor,
} from "./domain.js";
import { stableId } from "./ids.js";
import { claudeCodeAdapter } from "./adapters/claude-code.js";
import { codexAdapter } from "./adapters/codex.js";
import { piAdapter } from "./adapters/pi.js";
import type { EventDraft, TraceAdapter } from "./adapters/types.js";

const adapters: Record<Provider, TraceAdapter> = {
  pi: piAdapter,
  "claude-code": claudeCodeAdapter,
  codex: codexAdapter,
};

export interface ImportOptions {
  provider: Provider;
  traceKey: string;
}

async function* readLines(
  input: AsyncIterable<string | Uint8Array>,
): AsyncGenerator<string> {
  const decoder = new TextDecoder();
  let pending = "";
  for await (const chunk of input) {
    pending +=
      typeof chunk === "string"
        ? chunk
        : decoder.decode(chunk, { stream: true });
    let newline = pending.indexOf("\n");
    while (newline >= 0) {
      const line = pending.slice(0, newline).replace(/\r$/, "");
      pending = pending.slice(newline + 1);
      yield line;
      newline = pending.indexOf("\n");
    }
  }
  pending += decoder.decode();
  if (pending.length > 0) yield pending.replace(/\r$/, "");
}

function descriptor(options: ImportOptions): TraceDescriptor {
  return TraceDescriptorSchema.parse({
    schemaVersion: "1.0",
    id: stableId("trc", [options.provider, options.traceKey]),
    source: { provider: options.provider, traceKey: options.traceKey },
  });
}

function diagnostic(
  line: number,
  code: "malformed_json" | "unsupported_record" | "invalid_event",
  message: string,
): ImportItem {
  return {
    type: "diagnostic",
    diagnostic: ImportDiagnosticSchema.parse({ line, code, message }),
  };
}

function buildEvent(
  trace: TraceDescriptor,
  draft: EventDraft,
  sequence: number,
  line: number,
  eventIndex: number,
): ImportItem {
  const identity = draft.identity ?? [line, eventIndex];
  const event = NormalizedEventSchema.parse({
    schemaVersion: "1.0",
    id: stableId("evt", [trace.id, sequence, identity]),
    traceId: trace.id,
    sequence,
    source: {
      ...trace.source,
      ...(draft.externalSessionId === undefined
        ? {}
        : { externalSessionId: draft.externalSessionId }),
    },
    actor: draft.actor,
    kind: draft.kind,
    ...(draft.timestamp === undefined ? {} : { timestamp: draft.timestamp }),
    ...(draft.content === undefined ? {} : { content: draft.content }),
    ...(draft.tool === undefined ? {} : { tool: draft.tool }),
    ...(draft.metadata === undefined ? {} : { metadata: draft.metadata }),
  });
  return { type: "event", event };
}

export async function* streamTraceImport(
  input: AsyncIterable<string | Uint8Array>,
  options: ImportOptions,
): AsyncGenerator<ImportItem> {
  const trace = descriptor(options);
  const adapter = adapters[options.provider];
  let lineNumber = 0;
  let sequence = 0;

  for await (const line of readLines(input)) {
    lineNumber += 1;
    if (line.trim().length === 0) continue;

    let record: unknown;
    try {
      record = JSON.parse(line) as unknown;
    } catch {
      yield diagnostic(lineNumber, "malformed_json", "Line is not valid JSON");
      continue;
    }

    const result = adapter.adapt(record);
    if (!result.supported) {
      yield diagnostic(lineNumber, "unsupported_record", result.reason);
      continue;
    }

    for (const [eventIndex, draft] of result.events.entries()) {
      try {
        yield buildEvent(trace, draft, sequence, lineNumber, eventIndex);
        sequence += 1;
      } catch {
        yield diagnostic(
          lineNumber,
          "invalid_event",
          "Normalized event failed schema validation",
        );
      }
    }
  }
}

export async function collectImport(
  input: AsyncIterable<string | Uint8Array>,
  options: ImportOptions,
): Promise<ImportItem[]> {
  const items: ImportItem[] = [];
  for await (const item of streamTraceImport(input, options)) items.push(item);
  return items;
}
