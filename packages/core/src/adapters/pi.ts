import type { EventDraft, TraceAdapter } from "./types.js";
import { asJsonValue, asString, isRecord } from "./types.js";

function common(
  record: Record<string, unknown>,
): Pick<EventDraft, "timestamp" | "externalSessionId"> {
  const timestamp = asString(record.timestamp);
  const externalSessionId = asString(record.sessionId);
  return {
    ...(timestamp === undefined ? {} : { timestamp }),
    ...(externalSessionId === undefined ? {} : { externalSessionId }),
  };
}

export const piAdapter: TraceAdapter = {
  adapt(value) {
    if (!isRecord(value))
      return { supported: false, reason: "Pi record must be an object" };
    const type = asString(value.type);
    const base = common(value);

    if (type === "message") {
      const role = asString(value.role);
      const content = asString(value.content);
      if (
        !content ||
        !role ||
        !["user", "assistant", "system"].includes(role)
      ) {
        return { supported: false, reason: "Unsupported Pi message shape" };
      }
      return {
        supported: true,
        events: [
          {
            ...base,
            actor: role as "user" | "assistant" | "system",
            kind: role === "system" ? "system" : "message",
            content,
            identity: asJsonValue(value.id) ?? content,
          },
        ],
      };
    }

    if (type === "tool_call") {
      const name = asString(value.name);
      if (!name)
        return { supported: false, reason: "Pi tool call is missing a name" };
      const callId = asString(value.id);
      const input = asJsonValue(value.arguments);
      return {
        supported: true,
        events: [
          {
            ...base,
            actor: "assistant",
            kind: "tool_call",
            tool: {
              name,
              status: "requested",
              ...(callId === undefined ? {} : { callId }),
              ...(input === undefined ? {} : { input }),
            },
            identity: callId ?? name,
          },
        ],
      };
    }

    if (type === "tool_result") {
      const callId = asString(value.toolCallId);
      if (!callId)
        return {
          supported: false,
          reason: "Pi tool result is missing a toolCallId",
        };
      const output = asJsonValue(value.result);
      const failed = value.isError === true;
      return {
        supported: true,
        events: [
          {
            ...base,
            actor: "tool",
            kind: "tool_result",
            tool: {
              name: asString(value.name) ?? "unknown",
              callId,
              status: failed ? "failed" : "succeeded",
              ...(output === undefined ? {} : { output }),
            },
            identity: callId,
          },
        ],
      };
    }

    return {
      supported: false,
      reason: `Unsupported Pi record type: ${type ?? "missing"}`,
    };
  },
};
