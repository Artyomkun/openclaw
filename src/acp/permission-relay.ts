/**
 * Gateway Exec Approval Bridge - ACP
 */

export function parseEvent(data: any) {
  if (data.phase !== "requested" || data.status !== "pending") return null;
  return {
    id: data.approvalId,
    command: data.command || data.commandPreview,
    host: data.host,
  };
}

export function buildRequest(sessionId: string, event: any): any {
  return {
    sessionId,
    toolCall: {
      toolCallId: event.id,
      title: event.title || "Command approval",
      kind: "execute",
      status: "pending",
      rawInput: {
        command: event.command,
        host: event.host,
      },
    },
    options: [
      { optionId: "allow-once", name: "Allow once", kind: "allow_once" },
      { optionId: "deny", name: "Deny", kind: "reject_once" },
    ],
  };
}

export function resolveDecision(response: any): string | undefined {
  const selected = response?.outcome;
  if (selected?.outcome !== "selected") return undefined;
  return selected.optionId === "allow-once" ? "allow-once" : "deny";
}