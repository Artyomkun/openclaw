import { redactSecrets } from "../logging/redact.ts";
import { sanitizeDiagnosticPayload } from "./payload-redaction.ts";

export function redactAgentDiagnosticPayload<T>(value: T): T {
  return redactSecrets(sanitizeDiagnosticPayload(value)) as T;
}
