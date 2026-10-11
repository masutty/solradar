/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./DonutChart.css";

import { React, Tooltip } from "@webpack/common";

export const DONUT_OTHER_COLOR = "#898781"; // neutral gray, "Other" is not a real label
export const DONUT_MAX_SLICES = 3;

/**
 * Hashes a label to a hue, so the same name always gets the same color everywhere.
 * Two different labels can still land on similar hues.
 */
export function hashLabelToColor(label: string): string {
    let hash = 0;
    for (let i = 0; i < label.length; i++) {
        hash = (hash * 31 + label.charCodeAt(i)) | 0;
    }
    const hue = Math.abs(hash) % 360;
    return `hsl(${hue}deg 65% 55%)`;
}

export interface DonutBreakdown {
    real: number;
    bait: number;
    timeout: number;
}

export interface DonutDatum {
    label: string;
    value: number;
    /** Optional real/bait/timeout split, shown as extra lines in the hover tooltip. */
    breakdown?: DonutBreakdown;
}

export interface DonutSlice extends DonutDatum {
    color: string;
}

const emptyBreakdown = (): DonutBreakdown => ({ real: 0, bait: 0, timeout: 0 });

function addBreakdown(a: DonutBreakdown, b?: DonutBreakdown): DonutBreakdown {
    if (!b) return a;
    return { real: a.real + b.real, bait: a.bait + b.bait, timeout: a.timeout + b.timeout };
}

/** Sorts by value desc, keeps the top N, folds the rest into a single "Other" slice. */
export function foldToTopSlices(items: DonutDatum[], max: number = DONUT_MAX_SLICES): DonutDatum[] {
    const sorted = [...items].sort((a, b) => b.value - a.value);
    const top = sorted.slice(0, max);
    const rest = sorted.slice(max);

    if (!rest.length) return top;

    const restTotal = rest.reduce((sum, x) => sum + x.value, 0);
    const restBreakdown = rest.some(x => x.breakdown)
        ? rest.reduce((sum, x) => addBreakdown(sum, x.breakdown), emptyBreakdown())
        : undefined;

    return [...top, { label: "Other", value: restTotal, breakdown: restBreakdown }];
}

/** Colors each slice by hashing its label; "Other" always stays neutral gray. */
export function withDonutColors(items: DonutDatum[]): DonutSlice[] {
    return items.map(item => ({
        ...item,
        color: item.label === "Other" ? DONUT_OTHER_COLOR : hashLabelToColor(item.label),
    }));
}

interface DonutChartProps {
    title: string;
    slices: DonutSlice[];
    centerLabel?: string;
    size?: number;
}

const RING_THICKNESS = 16;
const RING_THICKNESS_HOVER = 20;
const SEGMENT_GAP_DEG = 2.5; // an angle, so the gap scales with the ring

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
    const rad = (angleDeg * Math.PI) / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

/**
 * Filled ring-segment path for one slice.
 * A stroked arc showed seams on very wide slices (worse on hover), so the shape is drawn
 * directly, like d3's arc generator does.
 */
function describeRingSegment(
    cx: number, cy: number,
    innerR: number, outerR: number,
    startAngleDeg: number, endAngleDeg: number
): string {
    const startOuter = polarToCartesian(cx, cy, outerR, startAngleDeg);
    const endOuter = polarToCartesian(cx, cy, outerR, endAngleDeg);
    const endInner = polarToCartesian(cx, cy, innerR, endAngleDeg);
    const startInner = polarToCartesian(cx, cy, innerR, startAngleDeg);

    const largeArcFlag = endAngleDeg - startAngleDeg > 180 ? 1 : 0;

    return [
        `M ${startOuter.x} ${startOuter.y}`,
        `A ${outerR} ${outerR} 0 ${largeArcFlag} 1 ${endOuter.x} ${endOuter.y}`,
        `L ${endInner.x} ${endInner.y}`,
        `A ${innerR} ${innerR} 0 ${largeArcFlag} 0 ${startInner.x} ${startInner.y}`,
        "Z",
    ].join(" ");
}

function TooltipContent({ seg }: { seg: DonutSlice & { fraction: number; }; }) {
    return (
        <div className="vc-sora-donut-tooltip">
            <div className="vc-sora-donut-tooltip-head">
                {seg.label} · {seg.value} ({Math.round(seg.fraction * 100)}%)
            </div>
            {seg.breakdown && (
                <div className="vc-sora-donut-tooltip-breakdown">
                    <div>Real: {seg.breakdown.real}</div>
                    <div>Bait: {seg.breakdown.bait}</div>
                    <div>Timeout: {seg.breakdown.timeout}</div>
                </div>
            )}
        </div>
    );
}

export function DonutChart({ title, slices, centerLabel = "Snipes", size = 132 }: DonutChartProps) {
    const [hovered, setHovered] = React.useState<number | null>(null);

    const outerRadius = size / 2;
    const total = slices.reduce((sum, s) => sum + s.value, 0);

    let cumulativeAngle = -90; // start at 12 o'clock
    const segments = slices.map(slice => {
        const fraction = total > 0 ? slice.value / total : 0;
        const startAngle = cumulativeAngle;
        const sweep = fraction * 360;
        cumulativeAngle += sweep;
        const endAngle = Math.max(startAngle, startAngle + sweep - SEGMENT_GAP_DEG);
        return { ...slice, fraction, startAngle, endAngle };
    });

    return (
        <div className="vc-sora-donut-base">
            <div className="vc-sora-donut-title">{title}</div>

            {total === 0 ? (
                <div className="vc-sora-donut-empty">No data</div>
            ) : (
                <div className="vc-sora-donut-body">
                    <div className="vc-sora-donut-svg-wrap" style={{ width: size, height: size }}>
                        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
                            {segments.map((seg, i) => {
                                const thickness = hovered === i ? RING_THICKNESS_HOVER : RING_THICKNESS;
                                return (
                                    <Tooltip key={seg.label} text={<TooltipContent seg={seg} />}>
                                        {({ onMouseEnter, onMouseLeave }) => (
                                            <path
                                                d={describeRingSegment(
                                                    size / 2, size / 2,
                                                    outerRadius - thickness, outerRadius,
                                                    seg.startAngle, seg.endAngle
                                                )}
                                                fill={seg.color}
                                                className="vc-sora-donut-segment"
                                                onMouseEnter={() => { setHovered(i); onMouseEnter(); }}
                                                onMouseLeave={() => { setHovered(null); onMouseLeave(); }}
                                            />
                                        )}
                                    </Tooltip>
                                );
                            })}
                        </svg>
                        <div className="vc-sora-donut-center">
                            <span className="vc-sora-donut-center-value">{total}</span>
                            <span className="vc-sora-donut-center-label">{centerLabel}</span>
                        </div>
                    </div>

                    <div className="vc-sora-donut-legend">
                        {segments.map((seg, i) => (
                            <Tooltip key={seg.label} text={`${seg.label} · ${seg.value} (${Math.round(seg.fraction * 100)}%)`}>
                                {({ onMouseEnter, onMouseLeave }) => (
                                    <div
                                        className="vc-sora-donut-legend-row"
                                        onMouseEnter={() => { setHovered(i); onMouseEnter(); }}
                                        onMouseLeave={() => { setHovered(null); onMouseLeave(); }}
                                    >
                                        <span className="vc-sora-donut-legend-swatch" style={{ background: seg.color }} />
                                        <span className="vc-sora-donut-legend-label">{seg.label}</span>
                                        <span className="vc-sora-donut-legend-value">{seg.value} · {Math.round(seg.fraction * 100)}%</span>
                                    </div>
                                )}
                            </Tooltip>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
