// Control UI controller manages usage gateway state.
import type { GatewayBrowserClient } from "../gateway.ts";
import type { SessionsUsageResult, CostUsageSummary, SessionUsageTimeSeries } from "../types.ts";
import type { SessionLogEntry } from "../views/usage.ts";
import {
  formatMissingOperatorReadScopeMessage,
  isMissingOperatorReadScopeError,
} from "./scope-errors.ts";

export type UsageState = {
  client: GatewayBrowserClient | null;
  connected: boolean;
  usageLoading: boolean;
  usageResult: SessionsUsageResult | null;
  usageCostSummary: CostUsageSummary | null;
  usageError: string | null;
  usageStartDate: string;
  usageEndDate: string;
  usageScope: "instance" | "family";
  usageAgentId: string | null;
  usageQuery: string;
  usageSelectedSessions: string[];
  usageSelectedDays: string[];
  usageTimeSeries: SessionUsageTimeSeries | null;
  usageTimeSeriesLoading: boolean;
  usageTimeSeriesCursorStart: number | null;
  usageTimeSeriesCursorEnd: number | null;
  usageSessionLogs: SessionLogEntry[] | null;
  usageSessionLogsLoading: boolean;
  usageTimeZone: "local" | "utc";
  settings?: { gatewayUrl?: string };
};

export type UsageResponse = {
  costSummary?: {
    total: number;
    byProvider: Record<string, number>;
    byModel?: Record<string, number>;
  };
  usage?: Array<{
    provider: string;
    model: string;
    tokens: number;
    cost: number;
  }>;
  windows?: Array<{
    start: string;
    end: string;
    cost: number;
  }>;
};

const formatUtcOffset = (timezoneOffsetMinutes: number): string => {
  // `Date#getTimezoneOffset()` is minutes to add to local time to reach UTC.
  // Convert to UTC±H[:MM] where positive means east of UTC.
  const offsetFromUtcMinutes = -timezoneOffsetMinutes;
  const sign = offsetFromUtcMinutes >= 0 ? "+" : "-";
  const absMinutes = Math.abs(offsetFromUtcMinutes);
  const hours = Math.floor(absMinutes / 60);
  const minutes = absMinutes % 60;
  return minutes === 0
    ? `UTC${sign}${hours}`
    : `UTC${sign}${hours}:${minutes.toString().padStart(2, "0")}`;
};

const buildDateInterpretationParams = (timeZone: "local" | "utc") => {
  if (timeZone === "utc") {
    return { mode: "utc" };
  }
  return {
    mode: "specific",
    utcOffset: formatUtcOffset(new Date().getTimezoneOffset()),
  };
};

function toErrorMessage(err: unknown): string {
  if (typeof err === "string") {
    return err;
  }
  if (err instanceof Error && typeof err.message === "string" && err.message.trim()) {
    return err.message;
  }
  if (err && typeof err === "object") {
    try {
      return JSON.stringify(err) || "request failed";
    } catch {
      // ignore
    }
  }
  return "request failed";
}

export async function loadUsage(state: UsageState): Promise<void> {
  const client = state.client;
  if (!client || !state.connected || state.usageLoading) {
    return;
  }

  state.usageLoading = true;
  state.usageError = null;

  try {
    // Используем универсальный request
    const result = await client.request<any>('usage.get');
    state.usageResult = result as SessionsUsageResult;
    state.usageCostSummary = result?.costSummary as CostUsageSummary ?? null;
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    if (isMissingOperatorReadScopeError(error)) {
      state.usageResult = null;
      state.usageCostSummary = null;
      state.usageError = formatMissingOperatorReadScopeMessage("usage");
    } else {
      state.usageError = toErrorMessage(error);
    }
  } finally {
    state.usageLoading = false;
  }
}

export const testApi = {
  formatUtcOffset,
  buildDateInterpretationParams,
  toErrorMessage,
};
export { testApi as __test };

async function runOptionalUsageDetailRequest(
  state: UsageState,
  loadingKey: "usageTimeSeriesLoading" | "usageSessionLogsLoading",
  run: (client: GatewayBrowserClient) => Promise<void>,
) {
  const client = state.client;
  if (!client || !state.connected || state[loadingKey]) {
    return;
  }
  state[loadingKey] = true;
  try {
    await run(client);
  } catch {
    // Silently fail - optional detail endpoints
  } finally {
    state[loadingKey] = false;
  }
}

export async function loadSessionTimeSeries(state: UsageState, sessionKey: string) {
  await runOptionalUsageDetailRequest(state, "usageTimeSeriesLoading", async (client) => {
    state.usageTimeSeries = null;
    const res = await client.request("sessions.usage.timeseries", { key: sessionKey });
    state.usageTimeSeries = res ? (res as SessionUsageTimeSeries) : null;
  });
}

export async function loadSessionLogs(state: UsageState, sessionKey: string) {
  await runOptionalUsageDetailRequest(state, "usageSessionLogsLoading", async (client) => {
    state.usageSessionLogs = null;
    const payload = (await client.request("sessions.usage.logs", {
      key: sessionKey,
      limit: 1000,
    })) as { logs?: unknown } | null;
    const logs = payload?.logs;
    state.usageSessionLogs = Array.isArray(logs) ? (logs as SessionLogEntry[]) : null;
  });
}
