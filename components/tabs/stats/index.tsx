/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./stats.css";

import { Button } from "@components/Button";
import { Paragraph } from "@components/Paragraph";
import { Alerts, React, Tooltip } from "@webpack/common";

import { settings } from "../../../settings";
import { SnipeEntry, SnipeStore, useSnipeHistory } from "../../../stores/SnipeStore";
import { Note } from "../../ui/Note";
import { card, COLORS, descriptionText, labelText, rowCard, sectionTitle, tabColumn } from "../../ui/styles";
import { FallbackImage } from "../recentJoins/components";
import { DONUT_MAX_SLICES, DonutBreakdown, DonutChart, DonutDatum, foldToTopSlices, withDonutColors } from "./DonutChart";

// --- Types ---

type Period = "7d" | "30d" | "all";
type BiomeResult = "real" | "bait" | "timeout";

interface BiomeAggregate {
    trigger: string;
    iconUrl?: string;
    real: number;
    bait: number;
    timeout: number;
    total: number;
    avgDurationMs: number | null;
}

interface ServerAggregate {
    key: string;
    displayName: string;
    count: number;
    breakdown: DonutBreakdown;
}

const RESULT_COLOR: Record<BiomeResult, string> = {
    real: COLORS.positive,
    bait: COLORS.danger,
    timeout: COLORS.warning,
};

// --- Helpers ---

function getBiomeResult(entry: SnipeEntry): BiomeResult | null {
    if (entry.tags.includes("biome-verified-real")) return "real";
    if (entry.tags.includes("biome-verified-bait")) return "bait";
    if (entry.tags.includes("biome-verified-timeout")) return "timeout";
    return null;
}

function periodToSince(period: Period): number | undefined {
    if (period === "all") return undefined;
    return Date.now() - (period === "7d" ? 7 : 30) * 24 * 60 * 60 * 1000;
}

function percent(n: number, total: number): number {
    return total > 0 ? Math.round((n / total) * 100) : 0;
}

function aggregateByTrigger(entries: SnipeEntry[]): BiomeAggregate[] {
    const map = new Map<string, { iconUrl?: string; real: number; bait: number; timeout: number; durations: number[]; }>();

    for (const entry of entries) {
        const result = getBiomeResult(entry);
        if (!result) continue;

        let agg = map.get(entry.triggerName);
        if (!agg) {
            agg = { real: 0, bait: 0, timeout: 0, durations: [] };
            map.set(entry.triggerName, agg);
        }
        agg.iconUrl ??= entry.iconUrl; // entries are newest first, so this is the latest icon
        agg[result]++;
        if (result === "real" && entry.biomeDurationMs != null) agg.durations.push(entry.biomeDurationMs);
    }

    return Array.from(map.entries())
        .map(([trigger, d]) => ({
            trigger,
            iconUrl: d.iconUrl,
            real: d.real,
            bait: d.bait,
            timeout: d.timeout,
            total: d.real + d.bait + d.timeout,
            avgDurationMs: d.durations.length
                ? Math.round(d.durations.reduce((a, b) => a + b, 0) / d.durations.length)
                : null,
        }))
        .sort((a, b) => b.total - a.total);
}

/** Groups by guildId when available, falling back to guildName for older entries. */
function aggregateByServer(entries: SnipeEntry[]): ServerAggregate[] {
    const map = new Map<string, ServerAggregate>();

    for (const entry of entries) {
        const key = entry.guildId ?? (entry.guildName ? `name:${entry.guildName}` : "unknown");
        const result = getBiomeResult(entry);

        let agg = map.get(key);
        if (!agg) {
            agg = { key, displayName: entry.guildName ?? "Unknown Server", count: 0, breakdown: { real: 0, bait: 0, timeout: 0 } };
            map.set(key, agg);
        }
        agg.count++;
        if (result) agg.breakdown[result]++;
    }

    return Array.from(map.values()).sort((a, b) => b.count - a.count);
}

/** Top servers for the donut, the rest folded into "Other". Anonymized as "Server 1", "Server 2"... */
function buildServerDonutData(entries: SnipeEntry[], anonymize: boolean): DonutDatum[] {
    const all = aggregateByServer(entries);
    const top = all.slice(0, DONUT_MAX_SLICES);
    const rest = all.slice(DONUT_MAX_SLICES);

    const data: DonutDatum[] = top.map((s, i) => ({
        label: anonymize ? `Server ${i + 1}` : s.displayName,
        value: s.count,
        breakdown: s.breakdown,
    }));

    const otherTotal = rest.reduce((sum, s) => sum + s.count, 0);
    if (otherTotal > 0) {
        data.push({
            label: "Other",
            value: otherTotal,
            breakdown: rest.reduce((sum, s) => ({
                real: sum.real + s.breakdown.real,
                bait: sum.bait + s.breakdown.bait,
                timeout: sum.timeout + s.breakdown.timeout,
            }), { real: 0, bait: 0, timeout: 0 }),
        });
    }
    return data;
}

// --- Pieces ---

function PeriodSelector({ period, onChange }: { period: Period; onChange: (p: Period) => void; }) {
    const options: { label: string; value: Period; }[] = [
        { label: "7 days", value: "7d" },
        { label: "30 days", value: "30d" },
        { label: "All time", value: "all" },
    ];

    return (
        <div style={{ display: "flex", gap: 2, padding: 3, borderRadius: 8, background: "var(--background-mod-strong)" }}>
            {options.map(opt => {
                const active = period === opt.value;
                return (
                    <button
                        key={opt.value}
                        type="button"
                        onClick={() => onChange(opt.value)}
                        style={{
                            padding: "4px 10px",
                            borderRadius: 6,
                            border: "none",
                            cursor: "pointer",
                            fontSize: 13,
                            fontWeight: 500,
                            color: active ? COLORS.text : COLORS.muted,
                            background: active ? "var(--background-mod-normal)" : "none",
                        }}
                    >
                        {opt.label}
                    </button>
                );
            })}
        </div>
    );
}

function StatTile({ value, label, color, hint }: { value: React.ReactNode; label: string; color?: string; hint?: string; }) {
    const tile = (
        <div style={{ ...card, display: "flex", flexDirection: "column", gap: 2 }}>
            <span style={{ fontSize: 20, fontWeight: 600, lineHeight: 1.2, color: color ?? COLORS.text }}>{value}</span>
            <span style={descriptionText}>{label}</span>
        </div>
    );
    if (!hint) return tile;
    return <Tooltip text={hint}>{props => <div {...props}>{tile}</div>}</Tooltip>;
}

function formatDuration(ms: number | null): string {
    if (ms == null) return "-";
    const s = Math.round(ms / 1000);
    return s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`;
}

const RESULT_LABEL: Record<BiomeResult, string> = { real: "real", bait: "bait", timeout: "timed out" };
const RESULTS: BiomeResult[] = ["real", "bait", "timeout"];

function Legend() {
    return (
        <div style={{ ...descriptionText, display: "flex", gap: 14 }}>
            {RESULTS.map(r => (
                <span key={r} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <span style={{ width: 9, height: 9, borderRadius: 2, background: RESULT_COLOR[r] }} />
                    {r === "timeout" ? "Timed out" : r === "real" ? "Real" : "Bait"}
                </span>
            ))}
        </div>
    );
}

function TriggerSummary({ agg }: { agg: BiomeAggregate; }) {
    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <strong>{agg.trigger}</strong>
            <span>{agg.total} {agg.total === 1 ? "snipe" : "snipes"} · {percent(agg.real, agg.total)}% real</span>
            <span>{agg.real} real · {agg.bait} bait · {agg.timeout} timed out</span>
            <span>Real biomes lasted {formatDuration(agg.avgDurationMs)} on average</span>
        </div>
    );
}

/** One bar per trigger: its length is the trigger's snipe count, its colors the real/bait/timeout split. */
function TriggerList({ aggregates }: { aggregates: BiomeAggregate[]; }) {
    const max = Math.max(...aggregates.map(a => a.total), 1);
    return (
        <div style={{ ...card, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
            <Legend />
            {aggregates.map(agg => (
                <div key={agg.trigger} style={{ display: "grid", gridTemplateColumns: "minmax(0, 140px) 1fr 34px", alignItems: "center", gap: 10 }}>
                    <Tooltip text={<TriggerSummary agg={agg} />}>
                        {props => (
                            <div {...props} style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                                <FallbackImage src={agg.iconUrl} style={{ width: 22, height: 22, borderRadius: 5, flexShrink: 0, objectFit: "cover" }} />
                                <span style={{ ...labelText, fontSize: 13, fontWeight: 600, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{agg.trigger}</span>
                            </div>
                        )}
                    </Tooltip>
                    <div style={{ height: 16, display: "flex" }}>
                        <div style={{ width: `${(agg.total / max) * 100}%`, display: "flex", gap: 2 }}>
                            {RESULTS.filter(r => agg[r] > 0).map(r => (
                                <Tooltip key={r} text={`${agg[r]} ${RESULT_LABEL[r]} (${percent(agg[r], agg.total)}%)`}>
                                    {props => <div {...props} className="vc-sora-stats-seg" style={{ flex: agg[r], background: RESULT_COLOR[r] }} />}
                                </Tooltip>
                            ))}
                        </div>
                    </div>
                    <span style={{ ...labelText, fontSize: 13, fontWeight: 700, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{agg.total}</span>
                </div>
            ))}
        </div>
    );
}

function confirmClearHistory() {
    Alerts.show({
        title: "Clear snipe history?",
        body: <Paragraph>This deletes every snipe in Snipe History and resets these stats. It can't be undone.</Paragraph>,
        confirmText: "Clear history",
        cancelText: "Cancel",
        onConfirm: () => SnipeStore.clear(),
    });
}

// --- StatsTab ---

export function StatsTab() {
    const [period, setPeriod] = React.useState<Period>("7d");
    const allEntries = useSnipeHistory();
    const { anonymizeEverything } = settings.use(["anonymizeEverything"]);

    const entries = React.useMemo(() => {
        const since = periodToSince(period);
        return since ? allEntries.filter(e => e.timestamp >= since) : allEntries;
    }, [allEntries, period]);

    // Biome-verified entries only, so the donut totals match the "Snipes" tile
    const verifiedEntries = React.useMemo(() => entries.filter(e => getBiomeResult(e) !== null), [entries]);
    const aggregates = React.useMemo(() => aggregateByTrigger(entries), [entries]);

    const totals = aggregates.reduce(
        (sum, a) => ({ real: sum.real + a.real, bait: sum.bait + a.bait, timeout: sum.timeout + a.timeout }),
        { real: 0, bait: 0, timeout: 0 }
    );
    const total = totals.real + totals.bait + totals.timeout;

    const serverSlices = React.useMemo(
        () => withDonutColors(buildServerDonutData(verifiedEntries, anonymizeEverything)),
        [verifiedEntries, anonymizeEverything]
    );
    const triggerSlices = React.useMemo(
        () => withDonutColors(foldToTopSlices(aggregates.map(a => ({
            label: a.trigger,
            value: a.total,
            breakdown: { real: a.real, bait: a.bait, timeout: a.timeout },
        })))),
        [aggregates]
    );

    return (
        <div style={tabColumn}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginTop: 4 }}>
                <span style={{ ...sectionTitle, margin: 0 }}>Overview</span>
                <PeriodSelector period={period} onChange={setPeriod} />
            </div>

            {total === 0 ? (
                <Note>No biome results in this period yet. Snipes show up here once biome detection confirms or rejects them.</Note>
            ) : (
                <>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 4 }}>
                        <StatTile value={`${percent(totals.real, total)}%`} label="Real" color={RESULT_COLOR.real} />
                        <StatTile value={`${percent(totals.bait, total)}%`} label="Bait" color={RESULT_COLOR.bait} />
                        <StatTile value={`${percent(totals.timeout, total)}%`} label="Timeout" color={RESULT_COLOR.timeout} />
                        <StatTile value={total} label="Snipes" />
                    </div>

                    <p style={sectionTitle}>Breakdown</p>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <DonutChart title="By server" slices={serverSlices} />
                        <DonutChart title="By trigger" slices={triggerSlices} />
                    </div>

                    <p style={sectionTitle}>Triggers</p>
                    <TriggerList aggregates={aggregates} />
                </>
            )}

            <p style={sectionTitle}>History</p>
            <div style={rowCard}>
                <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                    <span style={labelText}>Clear snipe history</span>
                    <span style={descriptionText}>Deletes every snipe in Snipe History and resets these stats.</span>
                </div>
                <Button size="small" variant="dangerPrimary" onClick={confirmClearHistory}>Clear</Button>
            </div>
        </div>
    );
}
