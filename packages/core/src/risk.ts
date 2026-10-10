import { z } from "zod";
import { type JsonValue, type NormalizedEvent } from "./domain.js";

const RiskRuleIdSchema = z.enum([
  "destructive_file_removal",
  "force_push",
  "credential_file_access",
  "remote_script_execution",
]);
export type RiskRuleId = z.infer<typeof RiskRuleIdSchema>;

export const RiskFindingSchema = z.object({
  ruleId: RiskRuleIdSchema,
  severity: z.enum(["high", "critical"]),
  path: z.string().min(1),
  message: z.string().min(1),
});
export type RiskFinding = z.infer<typeof RiskFindingSchema>;

const shellToolNames = new Set([
  "bash",
  "shell",
  "sh",
  "terminal",
  "exec",
  "run_command",
]);

interface RiskRule {
  id: RiskRuleId;
  severity: RiskFinding["severity"];
  pattern: RegExp;
  message: string;
}

const rules: RiskRule[] = [
  {
    id: "destructive_file_removal",
    severity: "critical",
    pattern:
      /(?:^|[;&|]\s*)rm\s+(?:--(?:recursive|force)(?:\s+--\w+)*\s+|-[a-z]*[rf][a-z]*\s+).+/i,
    message: "Command recursively and forcibly removes files.",
  },
  {
    id: "force_push",
    severity: "high",
    pattern: /\bgit\s+push\b[^\n]*(?:\s--force(?:-with-lease)?\b|\s-f\b)/i,
    message:
      "Command force-pushes Git history and can overwrite remote commits.",
  },
  {
    id: "credential_file_access",
    severity: "high",
    pattern:
      /\b(?:cat|less|more|head|tail|sed|awk)\b[^\n]*(?:~\/?\.ssh(?:\/|\b)|\.env(?:\b|[./]))/i,
    message: "Command reads a likely credential-bearing file.",
  },
  {
    id: "remote_script_execution",
    severity: "critical",
    pattern: /\b(?:curl|wget)\b[^\n]*\|\s*(?:ba)?sh\b/i,
    message:
      "Command downloads remote content and executes it through a shell.",
  },
];

function propertyPath(parent: string, key: string): string {
  return `${parent}[${JSON.stringify(key)}]`;
}

function stringValues(value: JsonValue, path: string): Array<[string, string]> {
  if (typeof value === "string") return [[path, value]];
  if (Array.isArray(value)) {
    return value.flatMap((item, index) =>
      stringValues(item, `${path}[${String(index)}]`),
    );
  }
  if (value !== null && typeof value === "object") {
    return Object.entries(value).flatMap(([key, item]) =>
      stringValues(item, propertyPath(path, key)),
    );
  }
  return [];
}

/**
 * Checks shell-tool inputs against a small, high-confidence rule set. The
 * function is deterministic and never executes or transmits the command.
 */
export function analyzeShellRisks(event: NormalizedEvent): RiskFinding[] {
  if (
    event.kind !== "tool_call" ||
    event.tool?.input === undefined ||
    !shellToolNames.has(event.tool.name.toLowerCase())
  ) {
    return [];
  }

  return stringValues(event.tool.input, "$.tool.input").flatMap(
    ([path, command]) =>
      rules.flatMap((rule) =>
        rule.pattern.test(command)
          ? [
              RiskFindingSchema.parse({
                ruleId: rule.id,
                severity: rule.severity,
                path,
                message: rule.message,
              }),
            ]
          : [],
      ),
  );
}
