/**
 * Public barrel for descriptor-driven tool planning.
 *
 * Runtime owners import this surface to define tools, evaluate availability,
 * build visible/hidden plans, and convert descriptors to protocol payloads.
 */
export { evaluateToolAvailability } from "./availability.ts";
export { defineToolDescriptor, defineToolDescriptors } from "./descriptors.ts";
export { ToolPlanContractError } from "./diagnostics.ts";
export { formatToolExecutorRef } from "./execution.ts";
export { buildToolPlan } from "./planner.ts";
export { toToolProtocolDescriptor, toToolProtocolDescriptors } from "./protocol.ts";
export type {
  BuildToolPlanOptions,
  HiddenToolPlanEntry,
  JsonObject,
  JsonPrimitive,
  JsonValue,
  ToolAvailabilityContext,
  ToolAvailabilityDiagnostic,
  ToolAvailabilityExpression,
  ToolAvailabilitySignal,
  ToolDescriptor,
  ToolExecutorRef,
  ToolOwnerRef,
  ToolPlan,
  ToolPlanEntry,
  ToolUnavailableReason,
} from "./types.ts";
