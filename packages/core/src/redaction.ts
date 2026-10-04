import { createHash } from "node:crypto";
import { z } from "zod";
import {
  NormalizedEventSchema,
  type JsonValue,
  type NormalizedEvent,
} from "./domain.js";

const RuleIdSchema = z.enum([
  "anthropic_api_key",
  "openai_api_key",
  "github_token",
  "aws_access_key_id",
  "private_key",
]);
export type RedactionRuleId = z.infer<typeof RuleIdSchema>;

export const RedactionFindingSchema = z.object({
  ruleId: RuleIdSchema,
  path: z.string().min(1),
  fingerprint: z.string().regex(/^sha256:[a-f0-9]{16}$/),
  replacement: z.string().regex(/^\[REDACTED:[a-z_]+\]$/),
});
export type RedactionFinding = z.infer<typeof RedactionFindingSchema>;

export const RedactionResultSchema = z.object({
  event: NormalizedEventSchema,
  findings: z.array(RedactionFindingSchema),
});
export type RedactionResult = z.infer<typeof RedactionResultSchema>;

interface RedactionRule {
  id: RedactionRuleId;
  pattern: RegExp;
}

const rules: RedactionRule[] = [
  {
    id: "private_key",
    pattern:
      /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g,
  },
  { id: "anthropic_api_key", pattern: /\bsk-ant-[A-Za-z0-9_-]{20,}\b/g },
  { id: "github_token", pattern: /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g },
  { id: "aws_access_key_id", pattern: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g },
  { id: "openai_api_key", pattern: /\bsk-(?!ant-)[A-Za-z0-9_-]{20,}\b/g },
];

function fingerprint(value: string): string {
  return `sha256:${createHash("sha256").update(value).digest("hex").slice(0, 16)}`;
}

function sanitizeString(
  value: string,
  path: string,
  findings: RedactionFinding[],
): string {
  let sanitized = value;
  for (const rule of rules) {
    sanitized = sanitized.replace(rule.pattern, (match) => {
      const replacement = `[REDACTED:${rule.id}]`;
      findings.push(
        RedactionFindingSchema.parse({
          ruleId: rule.id,
          path,
          fingerprint: fingerprint(match),
          replacement,
        }),
      );
      return replacement;
    });
  }
  return sanitized;
}

function propertyPath(parent: string, key: string): string {
  return `${parent}[${JSON.stringify(key)}]`;
}

function sanitizeJson(
  value: JsonValue,
  path: string,
  findings: RedactionFinding[],
): JsonValue {
  if (typeof value === "string") return sanitizeString(value, path, findings);
  if (Array.isArray(value)) {
    return value.map((item, index) =>
      sanitizeJson(item, `${path}[${String(index)}]`, findings),
    );
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        sanitizeJson(item, propertyPath(path, key), findings),
      ]),
    );
  }
  return value;
}

export function redactNormalizedEvent(input: NormalizedEvent): RedactionResult {
  const event = NormalizedEventSchema.parse(input);
  const findings: RedactionFinding[] = [];
  const content =
    event.content === undefined
      ? undefined
      : sanitizeString(event.content, "$.content", findings);
  const tool =
    event.tool === undefined
      ? undefined
      : {
          ...event.tool,
          ...(event.tool.input === undefined
            ? {}
            : {
                input: sanitizeJson(event.tool.input, "$.tool.input", findings),
              }),
          ...(event.tool.output === undefined
            ? {}
            : {
                output: sanitizeJson(
                  event.tool.output,
                  "$.tool.output",
                  findings,
                ),
              }),
        };
  const metadata =
    event.metadata === undefined
      ? undefined
      : (sanitizeJson(event.metadata, "$.metadata", findings) as Record<
          string,
          JsonValue
        >);

  const sanitizedEvent = NormalizedEventSchema.parse({
    ...event,
    ...(content === undefined ? {} : { content }),
    ...(tool === undefined ? {} : { tool }),
    ...(metadata === undefined ? {} : { metadata }),
  });

  return RedactionResultSchema.parse({ event: sanitizedEvent, findings });
}
