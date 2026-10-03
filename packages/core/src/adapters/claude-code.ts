import type { EventDraft, TraceAdapter } from "./types.js";
import { asJsonValue, asString, isRecord } from "./types.js";

export const claudeCodeAdapter: TraceAdapter = {
  adapt(value) {
    if (!isRecord(value))
      return {
        supported: false,
        reason: "Claude Code record must be an object",
      };
    const recordType = asString(value.type);
    if (!recordType || !["user", "assistant", "system"].includes(recordType)) {
      return {
        supported: false,
        reason: `Unsupported Claude Code record type: ${recordType ?? "missing"}`,
      };
    }

    const message = isRecord(value.message) ? value.message : undefined;
    const role = (asString(message?.role) ?? recordType) as
      "user" | "assistant" | "system";
    const content = message?.content ?? value.content;
    const timestamp = asString(value.timestamp);
    const externalSessionId = asString(value.sessionId);
    const recordId = asString(value.uuid);
    const base = {
      ...(timestamp === undefined ? {} : { timestamp }),
      ...(externalSessionId === undefined ? {} : { externalSessionId }),
    };
    const events: EventDraft[] = [];

    if (typeof content === "string" && content.length > 0) {
      events.push({
        ...base,
        actor: role,
        kind: role === "system" ? "system" : "message",
        content,
        identity: recordId ?? content,
      });
    } else if (Array.isArray(content)) {
      content.forEach((block, index) => {
        if (!isRecord(block)) return;
        const blockType = asString(block.type);
        if (blockType === "text") {
          const text = asString(block.text);
          if (text) {
            events.push({
              ...base,
              actor: role,
              kind: role === "system" ? "system" : "message",
              content: text,
              identity: [recordId ?? "record", index, "text"],
            });
          }
        } else if (blockType === "tool_use") {
          const name = asString(block.name);
          if (!name) return;
          const callId = asString(block.id);
          const input = asJsonValue(block.input);
          events.push({
            ...base,
            actor: "assistant",
            kind: "tool_call",
            tool: {
              name,
              status: "requested",
              ...(callId === undefined ? {} : { callId }),
              ...(input === undefined ? {} : { input }),
            },
            identity: callId ?? [recordId ?? "record", index, name],
          });
        } else if (blockType === "tool_result") {
          const callId = asString(block.tool_use_id);
          if (!callId) return;
          const output = asJsonValue(block.content);
          events.push({
            ...base,
            actor: "tool",
            kind: "tool_result",
            tool: {
              name: asString(block.name) ?? "unknown",
              callId,
              status: block.is_error === true ? "failed" : "succeeded",
              ...(output === undefined ? {} : { output }),
            },
            identity: callId,
          });
        }
      });
    }

    return events.length > 0
      ? { supported: true, events }
      : {
          supported: false,
          reason: "Claude Code record contained no supported content blocks",
        };
  },
};
