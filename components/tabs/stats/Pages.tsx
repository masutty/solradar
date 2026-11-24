/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "../../ui/choice.css";

import { React, Tooltip } from "@webpack/common";

import { JOIN_STEPS, STEP_CATS } from "../../../services/JoinTimeline";
import { SnipeEntry } from "../../../stores/SnipeStore";
import { Note } from "../../ui/Note";
import { COLORS } from "../../ui/styles";
import { BarItem, StackedBars } from "./charts";
import { Bin, Bucket, bucketLabel, BucketUnit, fmtSeconds, Measure, medianByBucket, OutcomeFilter, outcomeBins, pad2, peakWindow, plural, REQUEST_SENT_MEASURE, Stats, stepMedians, timingBins, TimingSample, timingSamples, TriggerRow, turningPoint, WEEKDAYS, whenBreakdown } from "./data";
import { SnipeTable } from "./Detail";
import { GroupTable, RESULT_COLOR, Section, TriggerIcon } from "./parts";

// --- Timing ---

const CHART_W = 540;
const CHART_H = 96;

function Histogram({ bins }: { bins: Bin[]; }) {
    const max = Math.max(1, ...bins.map(b => b.count));
    const bw = CHART_W / bins.length;
    const plotH = CHART_H - 18;
    return (
        <div className="vc-sora-stats-chart">
            <svg viewBox={`0 0 ${CHART_W} ${CHART_H}`} role="img" aria-label="How often each timing happened">
                <line className="vc-sora-stats-chart-grid" x1={0} x2={CHART_W} y1={plotH} y2={plotH} />
                {bins.map((b, i) => {
                    const h = b.count / max * (plotH - 6);
                    const tip = b.open ? `${fmtSeconds(b.from)} or slower: ${plural(b.count, "snipe")}` : `${fmtSeconds(b.from)} to ${fmtSeconds(b.to)}: ${plural(b.count, "snipe")}`;
                    return (
                        <Tooltip key={i} text={tip}>
                            {props => (
                                <g {...props}>
                                    <rect x={i * bw + 1} y={0} width={bw - 2} height={plotH} fill="transparent" />
                                    <rect x={i * bw + 1} y={plotH - (b.count ? Math.max(1.5, h) : 2)} width={bw - 2} height={b.count ? Math.max(1.5, h) : 2} rx={b.count ? 2 : 1} fill="var(--brand-500)" opacity={b.count ? 1 : 0.25} />
                                </g>
                            )}
                        </Tooltip>
                    );
                })}
                <text className="vc-sora-stats-chart-lbl" x={0} y={CHART_H - 2} textAnchor="start">{fmtSeconds(bins[0].from)}</text>
                <text className="vc-sora-stats-chart-lbl" x={CHART_W} y={CHART_H - 2} textAnchor="end">{fmtSeconds(bins[bins.length - 1].to)}+</text>
            </svg>
        </div>
    );
}

function Trend({ buckets, unit, medians }: { buckets: Bucket[]; unit: BucketUnit; medians: (number | null)[]; }) {
    const pts = medians.map((v, i) => ({ v, i })).filter((p): p is { v: number; i: number; } => p.v != null);
    if (pts.length < 2) return <span className="vc-sora-stats-low">Needs timings on at least two {unit}s.</span>;

    const lo = Math.min(...pts.map(p => p.v));
    const hi = Math.max(...pts.map(p => p.v));
    const span = hi - lo || 1;
    const padL = 4;
    const plotH = CHART_H - 20;
    const x = (i: number) => padL + (i + 0.5) / buckets.length * (CHART_W - padL);
    const y = (v: number) => 8 + (1 - (v - lo) / span) * (plotH - 16);

    const baseline = plotH - 4;
    const dim = (i: number) => medians[i] == null;

    return (
        <div className="vc-sora-stats-chart">
            <svg viewBox={`0 0 ${CHART_W} ${CHART_H}`} role="img" aria-label="Median timing over time">
                <line className="vc-sora-stats-chart-grid" x1={0} x2={CHART_W} y1={plotH} y2={plotH} />
                {buckets.slice(1).map((_, k) => {
                    // One line through every bucket; the parts that touch a bucket without a timing are faint
                    const i = k + 1;
                    const both = !dim(k) && !dim(i);
                    return <line key={i} x1={x(k)} y1={dim(k) ? baseline : y(medians[k]!)} x2={x(i)} y2={dim(i) ? baseline : y(medians[i]!)} stroke="var(--brand-500)" strokeWidth={2} strokeLinecap="round" opacity={both ? 1 : 0.3} />;
                })}
                {buckets.map((b, i) => dim(i) && <circle key={b.start} cx={x(i)} cy={baseline} r={2.5} fill="var(--brand-500)" opacity={0.3} />)}
                {pts.map(p => <circle key={p.i} cx={x(p.i)} cy={y(p.v)} r={4} fill="var(--brand-500)" />)}
                {buckets.map((b, i) => (
                    // A full-height column per bucket, so the tooltip is easy to hit
                    <Tooltip key={b.start} text={`${bucketLabel(unit, b.start, true)}: ${medians[i] == null ? "no timing" : `median ${fmtSeconds(medians[i])}`}`}>
                        {props => <rect {...props} x={padL + i * ((CHART_W - padL) / buckets.length)} y={0} width={(CHART_W - padL) / buckets.length} height={plotH} fill="transparent" />}
                    </Tooltip>
                ))}
                <text className="vc-sora-stats-chart-lbl" x={0} y={CHART_H - 2} textAnchor="start">{bucketLabel(unit, buckets[0].start)}</text>
                <text className="vc-sora-stats-chart-lbl" x={CHART_W} y={CHART_H - 2} textAnchor="end">{bucketLabel(unit, buckets[buckets.length - 1].start)}</text>
            </svg>
        </div>
    );
}

function Lane({ label, ms, max, strong }: { label: string; ms: number; max: number; strong?: boolean; }) {
    return (
        <div className="vc-sora-stats-lane">
            <span>{label}</span>
            <span className="vc-sora-stats-lane-bar"><i style={{ width: `${Math.max(1, ms / max * 100)}%`, opacity: strong ? 1 : 0.45 }} /></span>
            <b>{fmtSeconds(ms)}</b>
        </div>
    );
}

/** The median timing of each trigger that has enough joins, fastest first. */
function TriggerTimings({ rows }: { rows: TriggerRow[]; }) {
    const withTiming = rows.filter(r => r.stats.timing && r.stats.timing.n >= 5).sort((a, b) => a.stats.timing!.p50 - b.stats.timing!.p50);
    if (!withTiming.length) return <span className="vc-sora-stats-low">No trigger has 5 snipes with this timing yet.</span>;
    const max = Math.max(...withTiming.map(r => r.stats.timing!.p50));
    return (
        <div className="vc-sora-stats-table">
            <div className="vc-sora-stats-who react head">
                <span className="vc-sora-stats-who-name">Trigger</span>
                <span />
                <span>Median</span>
                <span>Joins</span>
            </div>
            {withTiming.map(r => (
                <div key={r.name} className="vc-sora-stats-who react">
                    <span className="vc-sora-stats-who-name"><TriggerIcon src={r.iconUrl} /><span>{r.name}</span></span>
                    <span className="vc-sora-stats-lane-bar"><i style={{ width: `${Math.max(2, r.stats.timing!.p50 / max * 100)}%` }} /></span>
                    <span className="vc-sora-stats-who-rate">{fmtSeconds(r.stats.timing!.p50)}</span>
                    <span className="vc-sora-stats-who-n">{r.stats.timing!.n}</span>
                </div>
            ))}
        </div>
    );
}

/** The median time of each step of the join, in join order. */
function StepLanes({ entries }: { entries: SnipeEntry[]; }) {
    const steps = React.useMemo(() => stepMedians(entries), [entries]);
    if (!steps.length) return <span className="vc-sora-stats-low">No join in this period has its steps read yet.</span>;
    const max = Math.max(...steps.map(s => s.p50), 1);
    return (
        <div className="vc-sora-stats-lanes">
            {steps.map(s => {
                const info = JOIN_STEPS[s.key];
                return (
                    <Tooltip key={s.key} text={info.tip}>
                        {props => (
                            <div {...props} className="vc-sora-stats-lane">
                                <span>{info.name}</span>
                                <span className="vc-sora-stats-lane-bar"><i style={{ width: `${Math.max(1, s.p50 / max * 100)}%`, background: STEP_CATS[info.cat].color }} /></span>
                                <b>{fmtSeconds(s.p50)}</b>
                            </div>
                        )}
                    </Tooltip>
                );
            })}
        </div>
    );
}

const OUTCOME_PILLS: { id: OutcomeFilter; label: string; color?: string; tip?: string; }[] = [
    { id: "all", label: "All" },
    { id: "got", label: "Got in", color: COLORS.positive, tip: "Real or bait" },
    { id: "timeout", label: "Timed out", color: RESULT_COLOR.timeout, tip: "Usually stuck in the queue" },
    { id: "unknown", label: "Unknown", color: RESULT_COLOR.unverified, tip: "Biome not checked" },
];

export function OutcomePills({ value, counts, onChange }: { value: OutcomeFilter; counts: Record<OutcomeFilter, number>; onChange: (v: OutcomeFilter) => void; }) {
    return (
        <div className="vc-sora-stats-segrow vc-sora-stats-outcomes" role="group" aria-label="Which snipes">
            {OUTCOME_PILLS.map(p => {
                const empty = p.id !== "all" && counts[p.id] === 0;
                return (
                    <Tooltip key={p.id} text={empty ? "None in this period" : p.tip ?? `${counts.all} snipes`}>
                        {props => (
                            <button {...props} type="button" className="vc-sora-seg vc-sora-stats-outcome" aria-pressed={value === p.id} disabled={empty} onClick={() => onChange(p.id)}>
                                {p.color && <i style={{ background: p.color }} />}
                                {p.label}
                                <span>{counts[p.id]}</span>
                            </button>
                        )}
                    </Tooltip>
                );
            })}
        </div>
    );
}

// Enough decimals to tell bins apart
const secs = (ms: number, step = 500) => `${(ms / 1000).toFixed(step % 100 ? 2 : step % 1000 ? 1 : 0)} s`;
const OTL_H = 110;

function Tile({ label, value, color, tip }: { label: string; value: string; color?: string; tip: string; }) {
    return (
        <Tooltip text={`${tip}. ${REQUEST_SENT_MEASURE.tip}`}>
            {props => (
                <div {...props} className="vc-sora-stats-otl-tile">
                    <span>{color && <i style={{ background: color }} />}{label}</span>
                    <b>{value}</b>
                </div>
            )}
        </Tooltip>
    );
}

const median = (samples: TimingSample[]) => {
    if (!samples.length) return "-";
    const ms = samples.map(s => s.ms).sort((a, b) => a - b);
    const mid = ms.length >> 1;
    return fmtSeconds(ms.length % 2 ? ms[mid] : (ms[mid - 1] + ms[mid]) / 2);
};

/** From which timing joins start timing out. Click a column to list its joins. */
function TimeoutByTiming({ entries, anonymize, focus }: { entries: SnipeEntry[]; anonymize: boolean; focus: OutcomeFilter; }) {
    const bins = React.useMemo(() => outcomeBins(entries), [entries]);
    const [open, setOpen] = React.useState<number | null>(null);
    if (bins.length < 2) return <span className="vc-sora-stats-low">Needs joins that got in or timed out, with their steps read.</span>;

    const tp = turningPoint(bins);
    const max = Math.max(...bins.map(b => b.got.length + b.out.length), 1);
    const bw = CHART_W / bins.length;
    const plotH = OTL_H - 18;
    const y = (n: number) => n / max * (plotH - 8);
    const dimGot = focus === "timeout" ? 0.3 : 1;
    const dimOut = focus === "got" ? 0.3 : 1;
    const tpIndex = tp ? bins.findIndex(b => b.from === tp.at) : -1;
    const step = bins[0].to - bins[0].from;

    const picked = open == null ? null : bins.find(b => b.from === open) ?? null;
    const pickedSamples = picked ? [...picked.got, ...picked.out].sort((a, b) => a.ms - b.ms) : [];
    const times = new Map(pickedSamples.map(s => [s.entry, s.ms]));

    return (
        <>
            <div className="vc-sora-stats-otl-tiles">
                <Tile label="Got in" color={COLORS.positive} value={median(bins.flatMap(b => b.got))} tip="Median of joins that got in" />
                <Tile label="Timed out" color={RESULT_COLOR.timeout} value={median(bins.flatMap(b => b.out))} tip="Median of joins that timed out" />
                <Tile label="Timeouts start at" value={tp ? secs(tp.at, step) : "-"} tip={tp ? `${tp.out} of ${tp.total} joins from here up timed out` : "No clear point yet"} />
            </div>
            <div className="vc-sora-stats-chart">
                <svg viewBox={`0 0 ${CHART_W} ${OTL_H}`} role="img" aria-label="Joins that got in and timed out, by timing">
                    <line className="vc-sora-stats-chart-grid" x1={0} x2={CHART_W} y1={plotH} y2={plotH} />
                    {tpIndex >= 0 && <line x1={tpIndex * bw} x2={tpIndex * bw} y1={0} y2={plotH} stroke={RESULT_COLOR.timeout} strokeDasharray="3 3" opacity={0.7} />}
                    {bins.map((b, i) => {
                        const total = b.got.length + b.out.length;
                        const hGot = y(b.got.length);
                        const hOut = y(b.out.length);
                        const on = open === b.from;
                        return (
                            <Tooltip key={b.from} text={total ? `${secs(b.from, step)}${b.open ? "+" : ""} · ${b.got.length} got in · ${b.out.length} timed out` : `${secs(b.from, step)} · none`}>
                                {props => (
                                    <g {...props} style={{ cursor: total ? "pointer" : "default" }} onClick={() => total && setOpen(on ? null : b.from)}>
                                        <rect x={i * bw} y={0} width={bw} height={plotH} fill={on ? "var(--background-mod-normal)" : "transparent"} rx={3} />
                                        {total === 0 && <rect x={i * bw + 2} y={plotH - 2} width={bw - 4} height={2} rx={1} fill="var(--text-muted)" opacity={0.25} />}
                                        {b.got.length > 0 && <rect x={i * bw + 2} y={plotH - hGot} width={bw - 4} height={hGot} rx={2} fill={COLORS.positive} opacity={dimGot} />}
                                        {b.out.length > 0 && <rect x={i * bw + 2} y={plotH - hGot - hOut} width={bw - 4} height={hOut} rx={2} fill={RESULT_COLOR.timeout} opacity={dimOut} />}
                                    </g>
                                )}
                            </Tooltip>
                        );
                    })}
                    <text className="vc-sora-stats-chart-lbl" x={0} y={OTL_H - 2} textAnchor="start">{secs(bins[0].from, step)}</text>
                    {tpIndex > 0 && tpIndex < bins.length - 1 && <text className="vc-sora-stats-chart-lbl" x={tpIndex * bw} y={OTL_H - 2} textAnchor="middle" style={{ fill: RESULT_COLOR.timeout }}>{secs(bins[tpIndex].from, step)}</text>}
                    <text className="vc-sora-stats-chart-lbl" x={CHART_W} y={OTL_H - 2} textAnchor="end">{secs(bins[bins.length - 1].from, step)}+</text>
                </svg>
            </div>

            {picked && (
                <div className="vc-sora-stats-otl-list">
                    <SnipeTable entries={pickedSamples.map(s => s.entry)} anonymize={anonymize} measure={REQUEST_SENT_MEASURE} time={e => times.get(e) ?? null} />
                </div>
            )}
        </>
    );
}

/** One measure of the join for a trigger or server, or for every trigger when `rows` is given: the spread, how it moved, where the time goes, and the fastest and slowest joins. */
export function TimingPage({ entries, stats, anonymize, rows, measure, allEntries, outcome }: {
    entries: SnipeEntry[];
    stats: Stats;
    anonymize: boolean;
    rows?: TriggerRow[];
    measure: Measure;
    /** Every snipe on the page before the outcome filter, for the timeout chart */
    allEntries: SnipeEntry[];
    outcome: OutcomeFilter;
}) {
    const samples = React.useMemo(() => timingSamples(entries, measure.steps), [entries, measure]);
    const bins = React.useMemo(() => timingBins(samples), [samples]);
    const medians = React.useMemo(() => medianByBucket(samples, stats.buckets), [samples, stats.buckets]);
    const byEntry = React.useMemo(() => new Map(samples.map((s: TimingSample) => [s.entry, s.ms])), [samples]);
    const ordered = React.useMemo(() => samples.slice().sort((a, b) => a.ms - b.ms), [samples]);

    const r = stats.timing;
    // Unknown joins are never in this chart, so it would show nothing that belongs to the filter
    const timeouts = outcome !== "unknown" && (
        <>
            <Section title="Timeouts by timing" />
            <div className="vc-sora-stats-card vc-sora-stats-panel"><TimeoutByTiming entries={allEntries} anonymize={anonymize} focus={outcome} /></div>
        </>
    );
    if (!r || r.n < 5) {
        return (
            <>
                <Note>{measure.label} needs at least 5 snipes with this timing in this period.</Note>
                {timeouts}
            </>
        );
    }

    return (
        <>
            <div className="vc-sora-stats-card vc-sora-stats-summary">
                <div className="vc-sora-stats-headline">
                    <span className="vc-sora-stats-big" style={{ color: COLORS.text }}>{fmtSeconds(r.p50)}</span>
                    <span className="vc-sora-stats-what">median of {plural(r.n, "joined snipe")}</span>
                </div>
                <div className="vc-sora-stats-lanes">
                    <Lane label="Fastest" ms={r.min} max={r.max} />
                    <Lane label="Median" ms={r.p50} max={r.max} strong />
                    <Lane label="90th percentile" ms={r.p90} max={r.max} />
                    <Lane label="Slowest" ms={r.max} max={r.max} />
                </div>
                <span className="vc-sora-stats-bn-s">{measure.tip}</span>
            </div>

            {timeouts}

            <Section title="Where the time goes" right={<span className="vc-sora-stats-hint">Median of each step of the join</span>} />
            <div className="vc-sora-stats-card vc-sora-stats-panel"><StepLanes entries={entries} /></div>

            {rows && rows.length > 1 && (
                <>
                    <Section title="By trigger" />
                    <div className="vc-sora-stats-card vc-sora-stats-panel">
                        <TriggerTimings rows={rows} />
                    </div>
                </>
            )}

            <Section title="How often" />
            <div className="vc-sora-stats-card vc-sora-stats-panel"><Histogram bins={bins} /></div>

            <Section title="Median over time" />
            <div className="vc-sora-stats-card vc-sora-stats-panel"><Trend buckets={stats.buckets} unit={stats.unit} medians={medians} /></div>

            <Section title="Fastest joins" />
            <div className="vc-sora-stats-card vc-sora-stats-panel">
                <SnipeTable entries={ordered.slice(0, 5).map(s => s.entry)} anonymize={anonymize} measure={measure} time={e => byEntry.get(e) ?? null} />
            </div>

            <Section title="Slowest joins" />
            <div className="vc-sora-stats-card vc-sora-stats-panel">
                <SnipeTable entries={ordered.slice(-5).reverse().map(s => s.entry)} anonymize={anonymize} measure={measure} time={e => byEntry.get(e) ?? null} />
            </div>
        </>
    );
}

// --- Who and where ---

type WhoTab = "authors" | "channels" | "servers";

const WHO_TABS: { id: WhoTab; label: string; }[] = [
    { id: "authors", label: "Authors" },
    { id: "channels", label: "Channels" },
    { id: "servers", label: "Servers" },
];

/** Who sent the snipes, and in which channels and servers, with each one's real rate. */
export function WhoPage({ stats, anonymize }: { stats: Stats; anonymize: boolean; }) {
    const [tab, setTab] = React.useState<WhoTab>("authors");
    const groups = tab === "authors" ? stats.authors : tab === "channels" ? stats.channels : stats.servers;

    return (
        <>
            <div className="vc-sora-stats-segrow">
                {WHO_TABS.map(t => {
                    const active = tab === t.id;
                    return (
                        <button
                            key={t.id}
                            type="button"
                            className="vc-sora-seg"
                            aria-pressed={active}
                            onClick={() => setTab(t.id)}
                            style={{ padding: "4px 12px", borderRadius: 6, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 500, ...(active && { color: COLORS.text, background: "var(--background-mod-normal)" }) }}
                        >
                            {t.label}
                        </button>
                    );
                })}
            </div>
            <div className="vc-sora-stats-card vc-sora-stats-panel">
                <GroupTable groups={groups} kind={tab === "authors" ? "Author" : tab === "channels" ? "Channel" : "Server"} anonymize={anonymize} />
            </div>
        </>
    );
}

// --- When ---

function Heatmap({ grid }: { grid: number[][]; }) {
    const max = Math.max(1, ...grid.flat());
    return (
        <div className="vc-sora-stats-heat">
            {grid.map((row, d) => (
                <React.Fragment key={d}>
                    <span className="vc-sora-stats-heat-day">{WEEKDAYS[d]}</span>
                    {row.map((v, h) => (
                        <Tooltip key={h} text={`${WEEKDAYS[d]} ${pad2(h)}:00: ${plural(v, "snipe")}`}>
                            {props => <i {...props} style={{ opacity: v ? 0.22 + 0.78 * v / max : 0.07 }} />}
                        </Tooltip>
                    ))}
                </React.Fragment>
            ))}
            <span />
            <div className="vc-sora-stats-hours-axis vc-sora-stats-heat-axis">
                <span>00</span><span>06</span><span>12</span><span>18</span><span>23</span>
            </div>
        </div>
    );
}

/** When the snipes of one trigger or server land: by hour, by weekday, and both together. */
export function WhenPage({ entries, stats }: { entries: SnipeEntry[]; stats: Stats; }) {
    const when = React.useMemo(() => whenBreakdown(entries), [entries]);
    const peak = peakWindow(stats.hours);

    const hourItems: BarItem[] = when.hours.map((counts, h) => ({ key: String(h), label: pad2(h), title: `${pad2(h)}:00 to ${pad2((h + 1) % 24)}:00`, counts }));
    const dayItems: BarItem[] = when.days.map((counts, d) => ({ key: WEEKDAYS[d], label: WEEKDAYS[d], title: WEEKDAYS[d], counts }));

    if (!peak) return <Note>When needs at least 5 snipes in this period.</Note>;

    return (
        <>
            <div className="vc-sora-stats-card vc-sora-stats-summary">
                <span className="vc-sora-stats-bn-l">Busiest hours</span>
                <div className="vc-sora-stats-headline">
                    <span className="vc-sora-stats-big" style={{ color: COLORS.text }}>{peak.range}</span>
                    <span className="vc-sora-stats-what">{peak.count} of {plural(stats.n, "snipe")}</span>
                </div>
            </div>

            <Section title="By hour" />
            <div className="vc-sora-stats-card vc-sora-stats-panel">
                <StackedBars items={hourItems} labelAt={i => i % 6 === 0 || i === 23} />
            </div>

            <Section title="By weekday" />
            <div className="vc-sora-stats-card vc-sora-stats-panel">
                <StackedBars items={dayItems} labelAt={() => true} />
            </div>

            <Section title="Day and hour" />
            <div className="vc-sora-stats-card vc-sora-stats-panel">
                <Heatmap grid={when.grid} />
            </div>
        </>
    );
}
