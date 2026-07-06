// Daemon service summary helpers for status output.
// Gateway and node service state share the same normalized shape.

import { resolveNodeService } from "../daemon/node-service.ts";
import { resolveGatewayService } from "../daemon/service.ts";
import { formatDaemonRuntimeShort } from "./status.format.ts";
import { readServiceStatusSummary } from "./status.service-summary.ts";

type DaemonStatusSummary = {
  label: string;
  installed: boolean | null;
  loaded: boolean;
  managedByOpenClaw: boolean;
  externallyManaged: boolean;
  loadedText: string;
  runtime: Awaited<ReturnType<typeof readServiceStatusSummary>>["runtime"];
  runtimeShort: string | null;
  layout: Awaited<ReturnType<typeof readServiceStatusSummary>>["layout"];
  wrapperPath: Awaited<ReturnType<typeof readServiceStatusSummary>>["wrapperPath"];
};

async function buildDaemonStatusSummary(
  serviceLabel: "gateway" | "node",
): Promise<DaemonStatusSummary> {
  const service = serviceLabel === "gateway" ? resolveGatewayService() : resolveNodeService();
  const fallbackLabel = serviceLabel === "gateway" ? "Daemon" : "Node";
  const summary = await readServiceStatusSummary(service, fallbackLabel);
  return {
    label: summary.label,
    installed: summary.installed,
    loaded: summary.loaded,
    managedByOpenClaw: summary.managedByOpenClaw,
    externallyManaged: summary.externallyManaged,
    loadedText: summary.loadedText,
    runtime: summary.runtime,
    runtimeShort: formatDaemonRuntimeShort(summary.runtime),
    layout: summary.layout,
    wrapperPath: summary.wrapperPath,
  };
}

/** Returns the gateway daemon status summary. */
export async function getDaemonStatusSummary(): Promise<DaemonStatusSummary> {
  return await buildDaemonStatusSummary("gateway");
}

/** Returns the node service status summary. */
export async function getNodeDaemonStatusSummary(): Promise<DaemonStatusSummary> {
  return await buildDaemonStatusSummary("node");
}
