/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./snipe.css";

import { React, Tooltip } from "@webpack/common";

import { SnipeEntry, SnipeLogEntry } from "../../../stores/SnipeStore";
import { COLORS } from "../../ui/styles";
import { formatClock } from "./components";
import { OutcomeIcon, phaseOf, PHASES, PhaseSpan, phaseSpans, processingTime, StepKey, stepOf, visibleLines } from "./steps";

// --- Helpers ---

const SLOW_MS = 5000;

export function formatSecs(ms: number): string {
    if (ms < 1000) return `${Math.round(ms)}ms`;
    return `${(ms / 1000).toFixed(ms < 10_000 ? 2 : 1)}s`;
}

const clockMs = (ts: number) => `${formatClock(ts, true)}.${String(new Date(ts).getMilliseconds()).padStart(3, "0")}`;

const LEVEL_COLOR: Record<SnipeLogEntry["level"], string> = {
    info: "var(--text-brand)",
    warn: COLORS.warning,
    error: COLORS.danger,
    debug: COLORS.muted,
};

function lineColor(line: SnipeLogEntry): string {
    if (line.level === "warn" || line.level === "error") return LEVEL_COLOR[line.level];
    const phase = phaseOf(stepOf(line));
    return phase ? PHASES[phase].color : LEVEL_COLOR.info;
}

/**
 * Time axis where long gaps are squeezed, so a 30s wait doesn't flatten the quick steps.
 * Gaps longer than CAP_MS shrink to CAP_MS and are reported as breaks to draw striped.
 */
export function traceAxis(times: number[]) {
    const CAP_MS = 500;
    const pts = [...new Set(times)].sort((a, b) => a - b);
    const mapped = [0];
    const raw: [number, number, number][] = [];
    for (let i = 1; i < pts.length; i++) {
        const gap = pts[i] - pts[i - 1];
        const w = Math.min(gap, CAP_MS);
        if (gap > CAP_MS * 2) raw.push([mapped[i - 1] + w * 0.2, mapped[i - 1] + w * 0.8, gap]);
        mapped.push(mapped[i - 1] + w);
    }
    const total = mapped[mapped.length - 1] || 1;
    const pos = (t: number) => {
        if (t <= pts[0]) return 0;
        for (let i = 1; i < pts.length; i++) {
            if (t <= pts[i]) {
                const f = (t - pts[i - 1]) / ((pts[i] - pts[i - 1]) || 1);
                return (mapped[i - 1] + f * (mapped[i] - mapped[i - 1])) / total;
            }
        }
        return 1;
    };
    const firstBreakAt = raw.length ? pts[mapped.findIndex(m => m > raw[0][0]) - 1] : pts[pts.length - 1];
    return { pos, firstBreakAt, breaks: raw.map(([a, b, real]) => ({ a: a / total, b: b / total, real })) };
}

// --- Icons ---

// Built on render, never at module load: Discord's React isn't available until webpack loads,
// and JSX evaluated at import time crashes the whole Vencord renderer.
function outcomePaths(icon: OutcomeIcon) {
    switch (icon) {
        case "ok": return <path d="M3 8.5l3 3 7-7" />;
        case "bad": return <path d="M4 4l8 8M12 4l-8 8" />;
        case "wait": return <><circle cx="8" cy="8" r="5.5" /><path d="M8 5v3.2l2 1.3" /></>;
        case "skip": return <><circle cx="8" cy="8" r="5.5" /><path d="M4.2 11.8l7.6-7.6" /></>;
        case "info": return <><path d="M8 7.5v4" /><path d="M8 4.6v.1" /></>;
    }
}

/** A status glyph drawn as SVG, so it sits exactly in the middle of its circle. */
export function OutcomeGlyph({ icon, size = 12 }: { icon: OutcomeIcon; size?: number; }) {
    return (
        <svg viewBox="0 0 16 16" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            {outcomePaths(icon)}
        </svg>
    );
}

// --- Phase bar ---

export function PhaseBar({ entry }: { entry: SnipeEntry; }) {
    const spans = phaseSpans(entry);
    if (!spans.length) return null;
    // Square root keeps a 0.3s join visible next to a 30s wait
    const weights = spans.map(s => Math.sqrt(Math.max(s.end - s.start, 1)));
    const total = weights.reduce((a, b) => a + b, 0);

    return (
        <div className="vc-sora-snipe-pbar">
            <span className="vc-sora-snipe-pbar-total">
                Total processing time: <b>{formatSecs(processingTime(spans))}</b>
            </span>
            <div className="vc-sora-snipe-bar">
                {spans.map((s, i) => <i key={s.key} style={{ flex: weights[i] / total, background: PHASES[s.key].color }} />)}
            </div>
            <div className="vc-sora-snipe-legend">
                {spans.map(s => (
                    <Tooltip key={s.key} text={`${PHASES[s.key].tip} Took ${formatSecs(s.end - s.start)}.`} position="bottom">
                        {props => (
                            <span {...props} className="vc-sora-snipe-legend-item">
                                <i style={{ background: PHASES[s.key].color }} />
                                <span className="vc-sora-snipe-help">{PHASES[s.key].name}</span>
                                <b>{formatSecs(s.end - s.start)}</b>
                            </span>
                        )}
                    </Tooltip>
                ))}
            </div>
        </div>
    );
}

// --- Timeline ---

/** The story: each step shows the time since the step above it, so slow steps stand out. */
export function StoryView({ entry, quote }: { entry: SnipeEntry; quote: React.ReactNode; }) {
    const lines = visibleLines(entry);
    const rows: React.ReactNode[] = [];
    let prev = entry.timestamp;

    lines.forEach((line, i) => {
        const delta = line.timestamp - prev;
        prev = line.timestamp;
        const last = i === lines.length - 1;
        const warn = line.level === "warn" || line.level === "error";

        if (delta >= SLOW_MS) {
            rows.push(
                <div key={`gap${i}`} className="vc-sora-story-row gap">
                    <span className="vc-sora-story-time">{formatSecs(delta)}</span>
                    <span className="vc-sora-story-rail" />
                    <div className="vc-sora-story-msg">nothing happened for {formatSecs(delta)}</div>
                </div>
            );
        }

        const time = delta >= SLOW_MS ? "" : delta < 10 ? "·" : `+${formatSecs(delta)}`;
        rows.push(
            <div key={i} className={`vc-sora-story-row${warn ? " warn" : ""}${last ? " last" : ""}`}>
                <Tooltip text={`${formatSecs(line.timestamp - entry.timestamp)} after the snipe · ${clockMs(line.timestamp)}`}>
                    {props => <span {...props} className={`vc-sora-story-time${delta < 10 ? " zero" : ""}`}>{time}</span>}
                </Tooltip>
                <span className="vc-sora-story-rail"><span className="vc-sora-story-dot" style={{ background: lineColor(line) }} /></span>
                <div className="vc-sora-story-msg">{line.message}</div>
            </div>
        );
    });

    return (
        <div className="vc-sora-story">
            <div className={`vc-sora-story-row head first${lines.length ? "" : " last"}`}>
                <span className="vc-sora-story-time">{formatClock(entry.timestamp)}</span>
                <span className="vc-sora-story-rail"><span className="vc-sora-story-dot" style={{ background: "var(--text-brand)" }} /></span>
                <div className="vc-sora-story-msg">
                    Message matched {entry.triggerName}
                    {quote}
                </div>
            </div>
            {rows}
        </div>
    );
}

// --- Waterfall ---

const STEP_NAME: Partial<Record<StepKey, string>> = {
    dedupe: "Duplicate check",
    macro: "Close macro",
    join: "Open in Roblox",
    link: "Verify link",
    lock: "Join lock",
    biome: "Wait for biome",
    notify: "Notification",
};

interface StepSpan { step: StepKey; start: number; end: number; lines: SnipeLogEntry[]; warn: boolean; }

function stepSpans(entry: SnipeEntry): StepSpan[] {
    const out: StepSpan[] = [];
    for (const line of entry.log) {
        const step = stepOf(line);
        if (!STEP_NAME[step]) continue;
        const t = line.timestamp - entry.timestamp;
        const warn = line.level === "warn" || line.level === "error";
        const span = out.find(s => s.step === step);
        if (span) { span.end = Math.max(span.end, t); span.lines.push(line); span.warn ||= warn; }
        else out.push({ step, start: t, end: t, lines: [line], warn });
    }
    return out;
}

/** Each phase as a parent bar with its steps under it, on one shared time axis. */
export function WaterfallView({ entry }: { entry: SnipeEntry; }) {
    const phases = phaseSpans(entry);
    const steps = stepSpans(entry);
    if (!phases.length) return <div className="vc-sora-snipe-empty">This snipe didn't join, so there is nothing to time.</div>;

    const end = processingTime(phases);
    const axis = traceAxis([0, ...phases.flatMap(p => [p.start, p.end]), ...steps.flatMap(s => [s.start, s.end])]);
    const pct = (t: number) => `${(axis.pos(t) * 100).toFixed(2)}%`;

    const ticks: number[] = [];
    for (let t = 0; t <= Math.min(axis.firstBreakAt, end); t += 250) ticks.push(t);

    const lane = (inner: React.ReactNode) => (
        <div className="vc-sora-wf-lane">
            {ticks.map(t => <span key={t} className="vc-sora-wf-grid" style={{ left: pct(t) }} />)}
            {axis.breaks.map((b, i) => <span key={i} className="vc-sora-wf-break" style={{ left: `${b.a * 100}%`, width: `${(b.b - b.a) * 100}%` }} />)}
            {inner}
        </div>
    );
    const shape = (a: number, b: number, color: string) => b - a < 8
        ? <span className="vc-sora-wf-diamond" style={{ left: pct(a), background: color }} />
        : <span className="vc-sora-wf-span" style={{ left: pct(a), width: `calc(${pct(b)} - ${pct(a)})`, background: color }} />;
    const dur = (ms: number) => <span className={`vc-sora-wf-dur${ms >= SLOW_MS ? " slow" : ""}`}>{ms < 8 ? "" : formatSecs(ms)}</span>;

    return (
        <div className="vc-sora-wf">
            <div className="vc-sora-wf-row ruler">
                <span />
                <div className="vc-sora-wf-lane">
                    {ticks.filter((_, i) => i % 2 === 0).map((t, i) => (
                        <span key={t} className={`vc-sora-wf-tick${i === 0 ? " first" : ""}`} style={{ left: pct(t) }}>{t ? formatSecs(t) : "0"}</span>
                    ))}
                    {axis.breaks.map((b, i) => <span key={`b${i}`} className="vc-sora-wf-tick" style={{ left: `${(b.a + b.b) * 50}%` }}>≈{formatSecs(b.real)}</span>)}
                    <span className="vc-sora-wf-tick last" style={{ left: "100%" }}>{formatSecs(end)}</span>
                </div>
                <span />
            </div>
            {phases.map((p: PhaseSpan) => (
                <React.Fragment key={p.key}>
                    <Tooltip text={PHASES[p.key].tip}>
                        {props => (
                            <div {...props} className="vc-sora-wf-row phase">
                                <span className="vc-sora-wf-label">{PHASES[p.key].name}</span>
                                {lane(shape(p.start, p.end, PHASES[p.key].color))}
                                {dur(p.end - p.start)}
                            </div>
                        )}
                    </Tooltip>
                    {steps.filter(s => phaseOf(s.step) === p.key).map(s => (
                        <Tooltip key={s.step} text={s.lines.map(l => l.message).join("\n")}>
                            {props => (
                                <div {...props} className={`vc-sora-wf-row step${s.warn ? " warn" : ""}`}>
                                    <span className="vc-sora-wf-label">{STEP_NAME[s.step]}</span>
                                    {lane(shape(s.start, s.end, s.warn ? COLORS.warning : `color-mix(in srgb, ${PHASES[p.key].color} 55%, transparent)`))}
                                    {dur(s.end - s.start)}
                                </div>
                            )}
                        </Tooltip>
                    ))}
                </React.Fragment>
            ))}
            <div className="vc-sora-wf-key">
                <span><i className="vc-sora-wf-key-diamond" />Instant step</span>
                <span><i className="vc-sora-wf-key-break" />Long wait, shortened</span>
                <span>Hover a row for the full log</span>
            </div>
        </div>
    );
}

// --- Raw ---

export function RawView({ entry }: { entry: SnipeEntry; }) {
    const [showDebug, setShowDebug] = React.useState(false);
    const lines = showDebug ? entry.log : visibleLines(entry);

    return (
        <div className="vc-sora-raw-wrap">
            <div className="vc-sora-raw-tools">
                <label>
                    <input type="checkbox" checked={showDebug} onChange={e => setShowDebug(e.currentTarget.checked)} />
                    Show debug lines
                </label>
                <span>{lines.length} of {entry.log.length} lines</span>
            </div>
            <div className="vc-sora-raw vc-sora-thin-scroll">
                {lines.map((l, i) => (
                    <div key={i} className={`vc-sora-raw-line ${l.level}`}>
                        <span className="vc-sora-raw-time">{clockMs(l.timestamp)}</span>
                        <span className="vc-sora-raw-level" style={{ color: LEVEL_COLOR[l.level] }}>{l.level.toUpperCase()}</span>
                        <span className="vc-sora-raw-msg">{l.message}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}
