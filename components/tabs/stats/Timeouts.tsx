/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { React, Tooltip } from "@webpack/common";

import { SnipeEntry } from "../../../stores/SnipeStore";
import { COLORS } from "../../ui/styles";
import { fmtSeconds, OutcomeFilter, outcomeBins, REQUEST_SENT_MEASURE, TimingSample, turningPoint } from "./data";
import { RESULT_COLOR } from "./parts";
import { SnipeTable } from "./SnipeTable";

const CHART_W = 540;

/** The fixed timing the chart uses, named, with why in the tooltip. */
export function TimeoutsHint() {
    return (
        <Tooltip text={`Always this timing, whatever is picked for the ⚡. ${REQUEST_SENT_MEASURE.tip}`}>
            {props => <span {...props} className="vc-sora-stats-hint">{REQUEST_SENT_MEASURE.label}</span>}
        </Tooltip>
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
export function TimeoutByTiming({ entries, anonymize, focus = "all" }: { entries: SnipeEntry[]; anonymize: boolean; focus?: OutcomeFilter; }) {
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
