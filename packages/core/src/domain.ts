import { z } from "zod";

export const ProviderSchema = z.enum(["pi", "claude-code", "codex"]);
export type Provider = z.infer<typeof ProviderSchema>;

export const JsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(JsonValueSchema),
    z.record(z.string(), JsonValueSchema),
  ]),
);
export type JsonValue =
  string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export const TraceSourceSchema = z.object({
  provider: ProviderSchema,
  traceKey: z.string().trim().min(1),
  externalSessionId: z.string().trim().min(1).optional(),
});

export const ToolObservationSchema = z.object({
  name: z.string().trim().min(1),
  callId: z.string().trim().min(1).optional(),
  input: JsonValueSchema.optional(),
  output: JsonValueSchema.optional(),
  status: z.enum(["requested", "succeeded", "failed"]).optional(),
});

export const NormalizedEventSchema = z
  .object({
    schemaVersion: z.literal("1.0"),
    id: z.string().regex(/^evt_[a-f0-9]{24}$/),
    traceId: z.string().regex(/^trc_[a-f0-9]{24}$/),
    sequence: z.number().int().nonnegative(),
    timestamp: z.iso.datetime({ offset: true }).optional(),
    source: TraceSourceSchema,
    actor: z.enum(["user", "assistant", "tool", "system"]),
    kind: z.enum(["message", "tool_call", "tool_result", "system"]),
    content: z.string().optional(),
    tool: ToolObservationSchema.optional(),
    metadata: z.record(z.string(), JsonValueSchema).optional(),
  })
  .superRefine((event, context) => {
    const needsTool =
      event.kind === "tool_call" || event.kind === "tool_result";
    if (needsTool && event.tool === undefined) {
      context.addIssue({
        code: "custom",
        path: ["tool"],
        message: `${event.kind} requires tool details`,
      });
    }
    if (!needsTool && event.tool !== undefined) {
      context.addIssue({
        code: "custom",
        path: ["tool"],
        message: `${event.kind} cannot contain tool details`,
      });
    }
  });
export type NormalizedEvent = z.infer<typeof NormalizedEventSchema>;

export const TraceDescriptorSchema = z.object({
  schemaVersion: z.literal("1.0"),
  id: z.string().regex(/^trc_[a-f0-9]{24}$/),
  source: TraceSourceSchema,
});
export type TraceDescriptor = z.infer<typeof TraceDescriptorSchema>;

export const ImportDiagnosticSchema = z.object({
  line: z.number().int().positive(),
  code: z.enum(["malformed_json", "unsupported_record", "invalid_event"]),
  message: z.string().min(1),
});
export type ImportDiagnostic = z.infer<typeof ImportDiagnosticSchema>;

export type ImportItem =
  | { type: "event"; event: NormalizedEvent }
  | { type: "diagnostic"; diagnostic: ImportDiagnostic };
