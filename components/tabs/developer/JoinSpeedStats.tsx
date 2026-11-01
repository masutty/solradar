/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// Join speed stats (developer only): averages and percentiles of every join phase,
// split by the things being tested (launch method, Discord focused, warm/cold Roblox).

import { Button } from "@components/Button";
import { copyToClipboard } from "@utils/clipboard";
import { React, showToast, Tooltip } from "@webpack/common";

import { captureRobloxTimeline, isTimelineComplete, joinedEntries, joinSpeedCsv, PHASES, phasesOf, summarize } from "../../../services/JoinTimeline";
import { SnipeEntry, useSnipeHistory } from "../../../stores/SnipeStore";
import { card, COLORS, descriptionText } from "../../ui/styles";

type Range = "20" | "100" | "all";
type GroupBy = "none" | "method" | "focused" | "mode";

const GROUPS: { id: GroupBy; label: string; of: (e: SnipeEntry) => string; }[] = [
    { id: "none", label: "All together", of: () => "all" },
    { id: "method", label: "Launch method", of: e => e.metrics?.launchMethod ?? "unknown" },
    { id: "focused", label: "Discord focused", of: e => e.metrics?.discordFocused == null ? "unknown" : e.metrics.discordFocused ? "focused" : "not focused" },
    { id: "mode", label: "Roblox warm/cold", of: e => e.robloxTimeline?.mode ?? "no log" },
];

const fmt = (n: number) => `${Math.round(n)}`;
const th: React.CSSProperties = { textAlign: "right", fontSize: 11, fontWeight: 700, color: COLORS.muted, padding: "4px 6px", textTransform: "uppercase", letterSpacing: "0.04em" };
const td: React.CSSProperties = { textAlign: "right", fontSize: 13, color: COLORS.text, padding: "3px 6px", fontVariantNumeric: "tabular-nums" };

function Seg<T extends string>({ value, options, onChange }: { value: T; options: { id: T; label: string; }[]; onChange: (v: T) => void; }) {
    return (
        <div style={{ display: "flex", gap: 2, padding: 2, borderRadius: 6, background: "var(--background-mod-strong)", flexWrap: "wrap" }}>
            {options.map(o => (
                <button
                    key={o.id}
                    type="button"
                    className="vc-sora-seg"
                    aria-pressed={value === o.id}
                    onClick={() => onChange(o.id)}
                    style={{
                        border: "none", borderRadius: 4, padding: "3px 10px", fontSize: 12, fontWeight: 600, cursor: "pointer",
                        ...(value === o.id && { color: COLORS.text, background: "var(--background-mod-subtle)" }),
                    }}
                >
                    {o.label}
                </button>
            ))}
        </div>
    );
}

function StatsTable({ entries }: { entries: SnipeEntry[]; }) {
    const all = entries.map(phasesOf);
    return (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
                <tr>
                    <th style={{ ...th, textAlign: "left" }}>Phase (ms)</th>
                    <th style={th}>n</th>
                    <th style={th}>mean</th>
                    <th style={th}>p50</th>
                    <th style={th}>p90</th>
                    <th style={th}>min</th>
                    <th style={th}>max</th>
                </tr>
            </thead>
            <tbody>
                {PHASES.map(p => {
                    const s = summarize(all.map(x => x[p.key]).filter((v): v is number => v !== undefined));
                    const headline = p.key === "toServer";
                    return (
                        <tr key={p.key} style={{ borderTop: "1px solid var(--background-mod-strong)", ...(headline && { background: "color-mix(in srgb, var(--text-brand) 8%, transparent)" }) }}>
                            <Tooltip text={p.tip}>
                                {props => <td {...props} style={{ ...td, textAlign: "left", color: COLORS.label, fontWeight: headline ? 700 : 400 }}>{p.label}</td>}
                            </Tooltip>
                            {s
                                ? <>
                                    <td style={{ ...td, color: COLORS.muted }}>{s.n}</td>
                                    <td style={td}>{fmt(s.mean)}</td>
                                    <td style={{ ...td, fontWeight: 700 }}>{fmt(s.p50)}</td>
                                    <td style={td}>{fmt(s.p90)}</td>
                                    <td style={{ ...td, color: COLORS.muted }}>{fmt(s.min)}</td>
                                    <td style={{ ...td, color: COLORS.muted }}>{fmt(s.max)}</td>
                                </>
                                : <td style={{ ...td, color: COLORS.muted }} colSpan={6}>no data</td>}
                        </tr>
                    );
                })}
            </tbody>
        </table>
    );
}

export function JoinSpeedStats() {
    const history = useSnipeHistory();
    const [range, setRange] = React.useState<Range>("100");
    const [groupBy, setGroupBy] = React.useState<GroupBy>("method");
    const [progress, setProgress] = React.useState<string | null>(null);

    const joined = joinedEntries(history).sort((a, b) => b.timestamp - a.timestamp);
    const scoped = range === "all" ? joined : joined.slice(0, Number(range));
    const withNewMetrics = scoped.filter(e => e.metrics?.launchedAt);
    const missing = withNewMetrics.filter(e => !isTimelineComplete(e.robloxTimeline) && Date.now() - e.metrics!.launchedAt! > 5_000);

    const group = GROUPS.find(g => g.id === groupBy)!;
    const buckets = new Map<string, SnipeEntry[]>();
    for (const e of scoped) {
        const k = group.of(e);
        if (!buckets.has(k)) buckets.set(k, []);
        buckets.get(k)!.push(e);
    }

    const readMissing = async () => {
        let done = 0, found = 0;
        for (const e of missing) {
            setProgress(`Reading Roblox logs… ${done}/${missing.length}`);
            if (isTimelineComplete(await captureRobloxTimeline(e.id) ?? undefined)) found++;
            done++;
        }
        setProgress(null);
        showToast({ text: `Read ${done} snipes, ${found} with a full Roblox timeline.` });
    };

    const copyCsv = () => {
        copyToClipboard(joinSpeedCsv(scoped));
        showToast({ text: `Copied ${scoped.length} rows as CSV.`, variant: "success" });
    };

    return (
        <div style={{ ...card, display: "flex", flexDirection: "column", gap: 10 }}>
            <span style={descriptionText}>
                Every phase of your joins, from the Discord message to the game server. "Message → server" is the number that wins or loses a full server.
                Roblox phases come from Roblox's own logs and only exist for snipes made with this build.
                Discord delivery depends on your clock: if it is negative or huge, sync your clock (Windows Settings, Time, Sync now).
            </span>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <Seg<Range> value={range} onChange={setRange} options={[{ id: "20", label: "Last 20" }, { id: "100", label: "Last 100" }, { id: "all", label: "All" }]} />
                <Seg<GroupBy> value={groupBy} onChange={setGroupBy} options={GROUPS.map(g => ({ id: g.id, label: g.label }))} />
            </div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <Button size="small" variant="secondary" disabled={!!progress || missing.length === 0} onClick={readMissing}>
                    {progress ?? `Read Roblox logs (${missing.length} missing)`}
                </Button>
                <Button size="small" variant="secondary" disabled={scoped.length === 0} onClick={copyCsv}>Copy CSV</Button>
                <span style={{ fontSize: 12, color: COLORS.muted }}>
                    {scoped.length} joins, {withNewMetrics.length} with join-speed data
                </span>
            </div>

            {scoped.length === 0
                ? <span style={{ fontSize: 13, color: COLORS.muted }}>No joins yet.</span>
                : [...buckets.entries()].map(([name, list]) => (
                    <div key={name} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        {groupBy !== "none" && (
                            <span style={{ fontSize: 13, fontWeight: 700, color: COLORS.text }}>{name} <span style={{ fontWeight: 400, color: COLORS.muted }}>({list.length})</span></span>
                        )}
                        <StatsTable entries={list} />
                    </div>
                ))}
        </div>
    );
}
