/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { React, Tooltip } from "@webpack/common";

import { Bucket, bucketLabel, bucketTotal, Counts, pad2, plural, RESULT_KINDS, Stats } from "./data";
import { BucketTip, CountsTip, Legend, RESULT_COLOR } from "./parts";

// --- Activity ---

/** The top of an axis that holds `max`, on a round number. */
function niceTop(max: number): number {
    const step = max <= 4 ? 1 : max <= 10 ? 5 : max <= 20 ? 10 : max <= 40 ? 20 : max <= 100 ? 50 : max <= 400 ? 100 : 500;
    return Math.ceil(max / step) * step;
}

const W = 540;
const H = 120;
const PAD_L = 26;
const PAD_B = 16;
const PAD_T = 8;

/** Snipes per hour, day, week or month, each bar stacked by result. */
export function ActivityChart({ stats }: { stats: Stats; }) {
    const b = stats.buckets;
    const max = Math.max(1, ...b.map(bucketTotal));
    const top = niceTop(max);
    const plotH = H - PAD_B - PAD_T;
    const bw = (W - PAD_L) / b.length;
    const y = (v: number) => PAD_T + plotH - v / top * plotH;

    const label = (i: number, anchor: "start" | "middle" | "end") => (
        <text
            className="vc-sora-stats-chart-lbl"
            x={PAD_L + i * bw + (anchor === "start" ? 0 : anchor === "end" ? bw : bw / 2)}
            y={H - 2}
            textAnchor={anchor}
        >
            {bucketLabel(stats.unit, b[i].start)}
        </text>
    );

    return (
        <div className="vc-sora-stats-chart">
            <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Snipes per ${stats.unit}`}>
                {[0, top / 2, top].map(v => (
                    <React.Fragment key={v}>
                        <line className="vc-sora-stats-chart-grid" x1={PAD_L} x2={W} y1={y(v)} y2={y(v)} />
                        <text className="vc-sora-stats-chart-lbl" x={PAD_L - 6} y={y(v) + 3.5} textAnchor="end">{Number.isInteger(v) ? v : ""}</text>
                    </React.Fragment>
                ))}
                {b.map((x, i) => {
                    let acc = 0;
                    const bx = PAD_L + i * bw + 1;
                    const width = Math.max(2, bw - 2);
                    return (
                        <React.Fragment key={x.start}>
                            {RESULT_KINDS.filter(k => x[k] > 0).map(k => {
                                const height = x[k] / top * plotH;
                                const rect = <rect key={k} x={bx} y={y(acc + x[k])} width={width} height={Math.max(1, height - (acc ? 0.5 : 0))} rx={1.5} fill={RESULT_COLOR[k]} />;
                                acc += x[k];
                                return rect;
                            })}
                            <Tooltip text={<BucketTip unit={stats.unit} bucket={x} />}>
                                {props => <rect {...props} x={bx} y={PAD_T} width={width} height={plotH} fill="transparent" />}
                            </Tooltip>
                        </React.Fragment>
                    );
                })}
                {label(0, "start")}
                {b.length > 8 && label(Math.floor(b.length / 2), "middle")}
                {b.length > 1 && label(b.length - 1, "end")}
            </svg>
            <Legend />
        </div>
    );
}

// --- Sparkline ---

/** A tiny activity chart for a table row. */
export function Spark({ buckets }: { buckets: Bucket[]; }) {
    const w = 72;
    const h = 20;
    const max = Math.max(1, ...buckets.map(bucketTotal));
    const bw = w / buckets.length;
    return (
        <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden>
            {buckets.map((b, i) => {
                // Empty buckets still get a dot, so the chart always spans its full width
                const total = bucketTotal(b);
                const height = total ? Math.max(2, total / max * h) : 1.5;
                return <rect key={b.start} x={i * bw + 0.5} y={h - height} width={Math.max(1, bw - 1)} height={height} rx={0.75} fill="currentColor" opacity={total ? 0.75 : 0.3} />;
            })}
        </svg>
    );
}

// --- Hours ---

/** The 24 hours of the day, darker where more snipes landed. */
export function HoursStrip({ hours, axis }: { hours: number[]; axis?: boolean; }) {
    const max = Math.max(...hours, 1);
    return (
        <>
            <div className="vc-sora-stats-hours">
                {hours.map((v, h) => (
                    <Tooltip key={h} text={`${pad2(h)}:00, ${plural(v, "snipe")}`}>
                        {props => <i {...props} style={{ opacity: v ? 0.22 + 0.78 * v / max : 0.08 }} />}
                    </Tooltip>
                ))}
            </div>
            {axis && (
                <div className="vc-sora-stats-hours-axis">
                    <span>00</span><span>06</span><span>12</span><span>18</span><span>23</span>
                </div>
            )}
        </>
    );
}

// --- Stacked bars ---

export interface BarItem { key: string; label: string; title: string; counts: Counts; }

/** Any fixed set of categories (hours, weekdays) as bars stacked by result. `labelAt` picks which ones get a label. */
export function StackedBars({ items, labelAt }: { items: BarItem[]; labelAt: (index: number) => boolean; }) {
    const max = Math.max(1, ...items.map(i => bucketTotal(i.counts)));
    const top = niceTop(max);
    const plotH = H - PAD_B - PAD_T;
    const bw = (W - PAD_L) / items.length;
    const y = (v: number) => PAD_T + plotH - v / top * plotH;

    return (
        <div className="vc-sora-stats-chart">
            <svg viewBox={`0 0 ${W} ${H}`} role="img">
                {[0, top / 2, top].map(v => (
                    <React.Fragment key={v}>
                        <line className="vc-sora-stats-chart-grid" x1={PAD_L} x2={W} y1={y(v)} y2={y(v)} />
                        <text className="vc-sora-stats-chart-lbl" x={PAD_L - 6} y={y(v) + 3.5} textAnchor="end">{Number.isInteger(v) ? v : ""}</text>
                    </React.Fragment>
                ))}
                {items.map((item, i) => {
                    let acc = 0;
                    const bx = PAD_L + i * bw + 1;
                    const width = Math.max(2, bw - 2);
                    return (
                        <React.Fragment key={item.key}>
                            {RESULT_KINDS.filter(k => item.counts[k] > 0).map(k => {
                                const height = item.counts[k] / top * plotH;
                                const rect = <rect key={k} x={bx} y={y(acc + item.counts[k])} width={width} height={Math.max(1, height - (acc ? 0.5 : 0))} rx={1.5} fill={RESULT_COLOR[k]} />;
                                acc += item.counts[k];
                                return rect;
                            })}
                            <Tooltip text={<CountsTip counts={item.counts} title={item.title} />}>
                                {props => <rect {...props} x={bx} y={PAD_T} width={width} height={plotH} fill="transparent" />}
                            </Tooltip>
                            {labelAt(i) && <text className="vc-sora-stats-chart-lbl" x={bx + width / 2} y={H - 2} textAnchor="middle">{item.label}</text>}
                        </React.Fragment>
                    );
                })}
            </svg>
            <Legend />
        </div>
    );
}
