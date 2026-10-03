import type { TraceAdapter } from "./types.js";
import { asJsonValue, asString, isRecord } from "./types.js";

function textFromContent(content: unknown): string | undefined {
  if (typeof content === "string") return content || undefined;
  if (!Array.isArray(content)) return undefined;
  const text = content
    .filter(isRecord)
    .filter((item) =>
      ["input_text", "output_text", "text"].includes(asString(item.type) ?? ""),
    )
    .map((item) => asString(item.text))
    .filter((item): item is string => item !== undefined)
    .join("\n");
  return text || undefined;
}

export const codexAdapter: TraceAdapter = {
  adapt(value) {
    if (!isRecord(value))
      return { supported: false, reason: "Codex record must be an object" };
    const type = asString(value.type);
    const payload = isRecord(value.payload) ? value.payload : value;
    const payloadType = asString(payload.type);
    const timestamp = asString(value.timestamp);
    const externalSessionId =
      asString(payload.id) ?? asString(value.session_id);
    const base = {
      ...(timestamp === undefined ? {} : { timestamp }),
      ...(externalSessionId === undefined ? {} : { externalSessionId }),
    };

    if (type === "session_meta") return { supported: true, events: [] };

    if (
      type === "event_msg" &&
      ["user_message", "agent_message"].includes(payloadType ?? "")
    ) {
      const content = asString(payload.message);
      if (!content)
        return { supported: false, reason: "Codex message is missing text" };
      return {
        supported: true,
        events: [
          {
            ...base,
            actor: payloadType === "user_message" ? "user" : "assistant",
            kind: "message",
            content,
            identity: asJsonValue(payload.id) ?? content,
          },
        ],
      };
    }

    if (type === "response_item" && payloadType === "message") {
      const role = asString(payload.role);
      const content = textFromContent(payload.content);
      if (
        !content ||
        !role ||
        !["user", "assistant", "system"].includes(role)
      ) {
        return {
          supported: false,
          reason: "Unsupported Codex response message shape",
        };
      }
      return {
        supported: true,
        events: [
          {
            ...base,
            actor: role as "user" | "assistant" | "system",
            kind: role === "system" ? "system" : "message",
            content,
            identity: asJsonValue(payload.id) ?? content,
          },
        ],
      };
    }

    if (type === "response_item" && payloadType === "function_call") {
      const name = asString(payload.name);
      if (!name)
        return {
          supported: false,
          reason: "Codex function call is missing a name",
        };
      const callId = asString(payload.call_id);
      let input = asJsonValue(payload.arguments);
      if (typeof payload.arguments === "string") {
        try {
          input = asJsonValue(JSON.parse(payload.arguments));
        } catch {
          input = payload.arguments;
        }
      }
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

    if (type === "response_item" && payloadType === "function_call_output") {
      const callId = asString(payload.call_id);
      if (!callId)
        return {
          supported: false,
          reason: "Codex function result is missing a call_id",
        };
      const output = asJsonValue(payload.output);
      return {
        supported: true,
        events: [
          {
            ...base,
            actor: "tool",
            kind: "tool_result",
            tool: {
              name: asString(payload.name) ?? "unknown",
              callId,
              status: "succeeded",
              ...(output === undefined ? {} : { output }),
            },
            identity: callId,
          },
        ],
      };
    }

    return {
      supported: false,
      reason: `Unsupported Codex record type: ${type ?? "missing"}/${payloadType ?? "missing"}`,
    };
  },
};
