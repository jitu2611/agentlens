import { describe, expect, it } from "vitest";
import {
  NormalizedEventSchema,
  TraceDescriptorSchema,
  stableId,
} from "../src/index.js";

describe("normalized trace domain", () => {
  it("validates trace descriptors and tool events", () => {
    const traceId = stableId("trc", ["pi", "fixture"]);
    expect(
      TraceDescriptorSchema.safeParse({
        schemaVersion: "1.0",
        id: traceId,
        source: { provider: "pi", traceKey: "fixture" },
      }).success,
    ).toBe(true);

    expect(
      NormalizedEventSchema.safeParse({
        schemaVersion: "1.0",
        id: stableId("evt", [traceId, 0]),
        traceId,
        sequence: 0,
        source: { provider: "pi", traceKey: "fixture" },
        actor: "assistant",
        kind: "tool_call",
      }).success,
    ).toBe(false);
  });

  it("creates stable IDs independent of object key order", () => {
    const left = stableId("evt", [{ alpha: 1, beta: 2 }]);
    const right = stableId("evt", [{ beta: 2, alpha: 1 }]);
    expect(left).toBe(right);
    expect(stableId("evt", ["first"])).not.toBe(stableId("evt", ["second"]));
  });
});
