// Removes internal runtime context from text shown back to users.
import { stripInternalRuntimeContext } from "../../agents/internal-runtime-context.ts";
import { stripEnvelope, stripMessageIdHints } from "../../shared/chat-envelope.ts";
import { stripInboundMetadata } from "./strip-inbound-meta.ts";

/** Removes internal runtime metadata before showing text to users. */
export function stripInternalMetadataForDisplay(text: string): string {
  return stripInboundMetadata(stripInternalRuntimeContext(text));
}

/** Removes user-envelope and message-id hints from display text. */
export function stripUserEnvelopeForDisplay(text: string): string {
  return stripMessageIdHints(stripEnvelope(stripInternalMetadataForDisplay(text)));
}
