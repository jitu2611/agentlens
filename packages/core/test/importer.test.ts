import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  NormalizedEventSchema,
  collectImport,
  type ImportItem,
  type Provider,
} from "../src/index.js";

async function* chunks(...values: string[]): AsyncGenerator<string> {
  for (const value of values) yield await Promise.resolve(value);
}

async function fixture(name: string): Promise<string> {
  return readFile(new URL(`./fixtures/${name}.jsonl`, import.meta.url), "utf8");
}

function events(items: ImportItem[]) {
  return items
    .filter((item) => item.type === "event")
    .map((item) => item.event);
}

function diagnostics(items: ImportItem[]) {
  return items
    .filter((item) => item.type === "diagnostic")
    .map((item) => item.diagnostic);
}

describe.each([
  ["pi", "pi", 4],
  ["claude-code", "claude-code", 4],
  ["codex", "codex", 4],
] as const)("%s importer", (_label, provider, expectedEvents) => {
  it("streams synthetic JSONL into schema-valid normalized events", async () => {
    const input = await fixture(provider);
    const items = await collectImport(chunks(input), {
      provider,
      traceKey: `${provider}-fixture`,
    });
    const importedEvents = events(items);

    expect(importedEvents).toHaveLength(expectedEvents);
    expect(diagnostics(items)).toEqual([]);
    expect(
      importedEvents.every(
        (event) => NormalizedEventSchema.safeParse(event).success,
      ),
    ).toBe(true);
    expect(new Set(importedEvents.map((event) => event.traceId)).size).toBe(1);
    expect(importedEvents.map((event) => event.sequence)).toEqual(
      Array.from({ length: expectedEvents }, (_, index) => index),
    );
  });
});

describe("streaming import behavior", () => {
  it("continues after malformed JSON and unsupported records with line-scoped diagnostics", async () => {
    const input = [
      "{not-json}",
      JSON.stringify({ type: "future_record", value: 1 }),
      JSON.stringify({
        type: "message",
        id: "valid-1",
        role: "user",
        content: "Continue importing.",
      }),
    ].join("\n");

    const items = await collectImport(chunks(input), {
      provider: "pi",
      traceKey: "recovery-test",
    });

    expect(diagnostics(items)).toEqual([
      { line: 1, code: "malformed_json", message: "Line is not valid JSON" },
      {
        line: 2,
        code: "unsupported_record",
        message: "Unsupported Pi record type: future_record",
      },
    ]);
    expect(events(items)).toHaveLength(1);
    expect(events(items)[0]?.content).toBe("Continue importing.");
  });

  it("handles records split across arbitrary input chunks", async () => {
    const line = JSON.stringify({
      type: "message",
      id: "split-1",
      role: "assistant",
      content: "Chunk safe.",
    });
    const items = await collectImport(
      chunks(line.slice(0, 12), line.slice(12, 31), `${line.slice(31)}\n`),
      {
        provider: "pi",
        traceKey: "chunk-test",
      },
    );

    expect(events(items)).toHaveLength(1);
    expect(diagnostics(items)).toEqual([]);
  });

  it("generates repeatable IDs and distinguishes event identity", async () => {
    const providers: Provider[] = ["pi", "claude-code", "codex"];
    for (const provider of providers) {
      const input = await fixture(provider);
      const first = events(
        await collectImport(chunks(input), {
          provider,
          traceKey: "stable-source",
        }),
      );
      const second = events(
        await collectImport(chunks(input), {
          provider,
          traceKey: "stable-source",
        }),
      );
      expect(first.map((event) => event.id)).toEqual(
        second.map((event) => event.id),
      );
      expect(new Set(first.map((event) => event.id)).size).toBe(first.length);
    }
  });
});
