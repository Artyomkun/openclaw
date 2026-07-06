#!/usr/bin/env node
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { parseArgs } from "node:util";

const execFileAsync = promisify(execFile);
const logger = {
    info: (...args: unknown[]) => console.log("[INFO]", ...args),
    warn: (...args: unknown[]) => console.warn("[WARN]", ...args),
    error: (...args: unknown[]) => console.error("[ERROR]", ...args),
    debug: (...args: unknown[]) => {
        if (process.env.DEBUG === "1") {
            console.debug("[DEBUG]", ...args);
        }
    },
};

type CostEntry = {
    date: string;
    modelBreakdowns?: Array<{ modelName: string; cost: number }>;
    modelsUsed?: string[];
};

type CostPayload = {
    daily?: CostEntry[];
    provider?: string;
};

type ModelCost = { model: string; cost: number };

type Args = {
    provider: "codex" | "claude";
    mode: "current" | "all";
    model?: string;
    input?: string;
    days?: number;
    format: "text" | "json";
    pretty: boolean;
};

function parseArgsCLI(): Args {
    const args = parseArgs({
        options: {
            provider: { type: "string", default: "codex" },
            mode: { type: "string", default: "current" },
            model: { type: "string" },
            input: { type: "string" },
            days: { type: "string" },
            format: { type: "string", default: "text" },
            pretty: { type: "boolean", default: false },
        },
    });

    let days: number | undefined;
    if (args.values.days) {
        const parsed = parseInt(args.values.days, 10);
        if (!isNaN(parsed) && parsed > 0) {
            days = parsed;
        } else {
            logger.warn("Invalid --days value, ignoring", { value: args.values.days });
        }
    }

    return {
        provider: args.values.provider as "codex" | "claude",
        mode: args.values.mode as "current" | "all",
        model: args.values.model,
        input: args.values.input,
        days,
        format: args.values.format as "text" | "json",
        pretty: !!args.values.pretty,
    };
}

async function runCodexbarCost(provider: string, timeoutMs = 30000): Promise<CostPayload> {
    try {
        const { stdout } = await execFileAsync("codexbar", ["cost", "--format", "json", "--provider", provider], {
            timeout: timeoutMs,
        });
        return JSON.parse(stdout);
    } catch (err) {
        if ((err as NodeJS.ErrnoException).code === "ENOENT") {
            throw new Error("codexbar not found on PATH. Install CodexBar CLI first.");
        }
        if ((err as NodeJS.ErrnoException).code === "ETIMEDOUT") {
            throw new Error(`codexbar cost timed out after ${timeoutMs}ms`);
        }
        throw new Error(`codexbar cost failed: ${err}`);
    }
}

async function loadPayload(inputPath?: string, provider?: string): Promise<CostPayload> {
    try {
        let raw: string;
        if (inputPath) {
            if (inputPath === "-") {
                const rl = createInterface({ input: process.stdin });
                const lines: string[] = [];
                for await (const line of rl) {
                lines.push(line);
                }
                raw = lines.join("\n");
            } else {
                raw = readFileSync(inputPath, "utf-8");
            }
        } else {
            return await runCodexbarCost(provider!);
        }

        const data = JSON.parse(raw);
        if (Array.isArray(data)) {
        const found = data.find((entry) => entry.provider === provider);
        if (!found) throw new Error(`Provider '${provider}' not found in payload.`);
        return found;
        }
        return data;
    } catch (err) {
        if (err instanceof SyntaxError) {
        throw new Error(`Invalid JSON: ${err.message}`);
        }
        throw err;
    }
}

function parseDate(value: string): Date | null {
    const parsed = Date.parse(value);
    return isNaN(parsed) ? null : new Date(parsed);
}

function filterByDays(entries: CostEntry[], days?: number): CostEntry[] {
    if (!days) return entries;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - (days - 1));
    return entries.filter((entry) => {
        const parsed = parseDate(entry.date);
        return parsed && parsed >= cutoff;
    });
}

function coerceCost(value: unknown): number | null {
    if (typeof value === "boolean") return null;
    if (typeof value === "number") {
        if (!Number.isFinite(value)) return null;
        return value;
    }
    if (typeof value === "string") {
        const num = parseFloat(value);
        if (isNaN(num) || !isFinite(num)) return null;
        return num;
    }
    return null;
}

function aggregateCosts(entries: CostEntry[]): Record<string, number> {
    const totals: Record<string, number> = {};
    for (const entry of entries) {
        const breakdowns = entry.modelBreakdowns;
        if (!Array.isArray(breakdowns)) continue;
        for (const item of breakdowns) {
            if (typeof item !== "object" || item === null) continue;
            const model = item.modelName;
            const cost = coerceCost(item.cost);
            if (typeof model !== "string" || cost === null) continue;
            totals[model] = (totals[model] || 0) + cost;
        }
    }
    return totals;
}

function pickCurrentModel(entries: CostEntry[]): { model: string | null; date: string | null } {
    if (entries.length === 0) return { model: null, date: null };
    const sorted = [...entries].sort((a, b) => (a.date || "").localeCompare(b.date || ""));
    for (let i = sorted.length - 1; i >= 0; i--) {
        const entry = sorted[i];
        const breakdowns = entry.modelBreakdowns;
        if (Array.isArray(breakdowns)) {
            const scored: ModelCost[] = [];
            for (const item of breakdowns) {
                if (typeof item !== "object" || item === null) continue;
                const model = item.modelName;
                const cost = coerceCost(item.cost);
                if (typeof model === "string" && cost !== null) {
                    scored.push({ model, cost });
                }
            }
            if (scored.length > 0) {
                scored.sort((a, b) => b.cost - a.cost);
                return { model: scored[0].model, date: entry.date || null };
            }
        }
        const modelsUsed = entry.modelsUsed;
        if (Array.isArray(modelsUsed)) {
            const last = modelsUsed[modelsUsed.length - 1];
            if (typeof last === "string") {
                return { model: last, date: entry.date || null };
            }
        }
    }
    return { model: null, date: null };
}

function latestDayCost(entries: CostEntry[], model: string): { date: string | null; cost: number | null } {
    const sorted = [...entries].sort((a, b) => (a.date || "").localeCompare(b.date || ""));
    for (let i = sorted.length - 1; i >= 0; i--) {
        const entry = sorted[i];
        const breakdowns = entry.modelBreakdowns;
        if (!Array.isArray(breakdowns)) continue;
        for (const item of breakdowns) {
            if (typeof item !== "object" || item === null) continue;
            if (item.modelName === model) {
                const cost = coerceCost(item.cost);
                return { date: entry.date || null, cost };
            }
        }
    }
    return { date: null, cost: null };
}

function usd(value: number | null): string {
    return value === null ? "—" : `$${value.toFixed(2)}`;
}

function renderTextCurrent(
    provider: string,
    model: string,
    latestDate: string | null,
    totalCost: number | null,
    latestCost: number | null,
    latestCostDate: string | null,
    entryCount: number,
): string {
    return [
        `Provider: ${provider}`,
        `Current model: ${model}`,
        latestDate ? `Latest model date: ${latestDate}` : "",
        `Total cost (rows): ${usd(totalCost)}`,
        latestCostDate ? `Latest day cost: ${usd(latestCost)} (${latestCostDate})` : "",
        `Daily rows: ${entryCount}`,
    ].filter(Boolean).join("\n");
}

function renderTextAll(provider: string, totals: Record<string, number>): string {
    const lines = [`Provider: ${provider}`, "Models:"];
    for (const [model, cost] of Object.entries(totals).sort(([, a], [, b]) => b - a)) {
        lines.push(`- ${model}: ${usd(cost)}`);
    }
    return lines.join("\n");
}

async function main(): Promise<number> {
    const args = parseArgsCLI();
    const startTime = Date.now();

    try {
        logger.info("Fetching codexbar cost data", { provider: args.provider, mode: args.mode });

        const payload = await loadPayload(args.input, args.provider);
        let entries = (payload.daily || []).filter((e): e is CostEntry => typeof e === "object" && e !== null);
        entries = filterByDays(entries, args.days);

        if (args.mode === "current") {
            let model = args.model;
            let latestDate: string | null = null;
            if (!model) {
                const result = pickCurrentModel(entries);
                model = result.model || undefined;
                latestDate = result.date;
            }
            if (!model) {
                logger.error("No model data found in codexbar cost payload");
                return 2;
            }

            const totals = aggregateCosts(entries);
            const totalCost = totals[model] || null;
            const { date: latestCostDate, cost: latestCost } = latestDayCost(entries, model);

            if (args.format === "json") {
                const output = {
                    provider: args.provider,
                    mode: "current",
                    model,
                    latestModelDate: latestDate,
                    totalCostUSD: totalCost,
                    latestDayCostUSD: latestCost,
                    latestDayCostDate: latestCostDate,
                    dailyRowCount: entries.length,
                    durationMs: Date.now() - startTime,
                };
                const indent = args.pretty ? 2 : undefined;
                console.log(JSON.stringify(output, null, indent));
            } else {
                console.log(renderTextCurrent(
                    args.provider,
                    model,
                    latestDate,
                    totalCost,
                    latestCost,
                    latestCostDate,
                    entries.length,
                ));
                logger.info("Codexbar cost summary completed", {
                    provider: args.provider,
                    model,
                    totalCost,
                    durationMs: Date.now() - startTime,
                });
            }
            return 0;
        }

        const totals = aggregateCosts(entries);
        if (Object.keys(totals).length === 0) {
            logger.error("No model breakdowns found in codexbar cost payload");
            return 2;
        }

        if (args.format === "json") {
            const output = {
                provider: args.provider,
                mode: "all",
                models: Object.entries(totals)
                .sort(([, a], [, b]) => b - a)
                .map(([model, totalCostUSD]) => ({ model, totalCostUSD })),
                durationMs: Date.now() - startTime,
            };
            const indent = args.pretty ? 2 : undefined;
            console.log(JSON.stringify(output, null, indent));
        } else {
            console.log(renderTextAll(args.provider, totals));
            logger.info("Codexbar cost summary completed", {
                provider: args.provider,
                models: Object.keys(totals).length,
                durationMs: Date.now() - startTime,
            });
        }
        return 0;
    } catch (err) {
        logger.error("Codexbar cost failed", {
            error: err instanceof Error ? err.message : String(err),
            durationMs: Date.now() - startTime,
        });
        console.error(err instanceof Error ? err.message : String(err));
        return 1;
    }
}

if (import.meta.url === `file://${process.argv[1]}`) {
    process.exit(await main());
}