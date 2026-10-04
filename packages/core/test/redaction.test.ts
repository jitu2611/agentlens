import { describe, expect, it } from "vitest";
import {
  NormalizedEventSchema,
  RedactionResultSchema,
  redactNormalizedEvent,
  stableId,
  type NormalizedEvent,
} from "../src/index.js";

function event(overrides: Partial<NormalizedEvent> = {}): NormalizedEvent {
  const traceId = stableId("trc", ["redaction-test"]);
  return NormalizedEventSchema.parse({
    schemaVersion: "1.0",
    id: stableId("evt", [traceId, 0]),
    traceId,
    sequence: 0,
    source: { provider: "pi", traceKey: "synthetic/redaction-test" },
    actor: "user",
    kind: "message",
    content: "No sensitive value.",
    ...overrides,
  });
}

describe("normalized event redaction", () => {
  it("redacts nested credentials without retaining their raw values", () => {
    const anthropicKey = `sk-ant-${"a".repeat(24)}`;
    const openAiKey = `sk-${"b".repeat(24)}`;
    const githubToken = `ghp_${"c".repeat(24)}`;
    const awsAccessKey = `AKIA${"D".repeat(16)}`;
    const privateKey = [
      "-----BEGIN PRIVATE KEY-----",
      "synthetic-material-for-tests-only",
      "-----END PRIVATE KEY-----",
    ].join("\n");
    const original = event({
      actor: "assistant",
      kind: "tool_call",
      content: `Use ${anthropicKey} and ${openAiKey}`,
      tool: {
        name: "synthetic_tool",
        status: "requested",
        input: { authorization: githubToken },
        output: ["account", awsAccessKey],
      },
      metadata: { signingMaterial: privateKey },
    });
    const snapshot = structuredClone(original);

    const result = redactNormalizedEvent(original);
    const serialized = JSON.stringify(result);

    expect(RedactionResultSchema.safeParse(result).success).toBe(true);
    expect(result.findings.map((finding) => finding.ruleId).sort()).toEqual([
      "anthropic_api_key",
      "aws_access_key_id",
      "github_token",
      "openai_api_key",
      "private_key",
    ]);
    expect(result.findings.map((finding) => finding.path)).toEqual(
      expect.arrayContaining([
        "$.content",
        '$.tool.input["authorization"]',
        "$.tool.output[1]",
        '$.metadata["signingMaterial"]',
      ]),
    );
    for (const secret of [
      anthropicKey,
      openAiKey,
      githubToken,
      awsAccessKey,
      privateKey,
    ]) {
      expect(serialized).not.toContain(secret);
    }
    expect(original).toEqual(snapshot);
  });

  it("leaves clean events semantically unchanged", () => {
    const original = event({ metadata: { environment: "synthetic" } });
    const result = redactNormalizedEvent(original);

    expect(result.event).toEqual(original);
    expect(result.findings).toEqual([]);
  });

  it("uses stable fingerprints without exposing the matched value", () => {
    const token = `gho_${"e".repeat(24)}`;
    const result = redactNormalizedEvent(
      event({ content: `${token} then ${token}` }),
    );

    expect(result.findings).toHaveLength(2);
    expect(result.findings[0]?.fingerprint).toBe(
      result.findings[1]?.fingerprint,
    );
    expect(
      result.findings.every(
        (finding) => !JSON.stringify(finding).includes(token),
      ),
    ).toBe(true);
  });

  it("does not redact short or ambiguous lookalikes", () => {
    const content =
      "Examples such as sk-short, github_token, and AKIA123 remain documentation text.";
    const result = redactNormalizedEvent(event({ content }));

    expect(result.event.content).toBe(content);
    expect(result.findings).toEqual([]);
  });
});
