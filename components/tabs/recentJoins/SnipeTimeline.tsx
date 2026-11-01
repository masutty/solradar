/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./snipe.css";

import { React, Tooltip } from "@webpack/common";

import { joinBreakdown, JoinStepKey } from "../../../services/JoinTimeline";
import { SnipeEntry, SnipeLogEntry } from "../../../stores/SnipeStore";
import { COLORS } from "../../ui/styles";
import { formatClock } from "./components";
import { OutcomeIcon, phaseOf, PHASES, stepOf, visibleLines } from "./steps";

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
 * Gaps longer than CAP_MS shrink to CAP_MS; those over twice CAP_MS are reported as breaks to draw striped.
 * With onlyBreaks, gaps are kept to scale unless they become a striped break.
 */
export function traceAxis(times: number[], CAP_MS = 500, onlyBreaks = false) {
    const pts = [...new Set(times)].sort((a, b) => a - b);
    const mapped = [0];
    const raw: [number, number, number][] = [];
    for (let i = 1; i < pts.length; i++) {
        const gap = pts[i] - pts[i - 1];
        const w = onlyBreaks && gap <= CAP_MS * 2 ? gap : Math.min(gap, CAP_MS);
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

// --- Roblox steps ---

type StoryLine = SnipeLogEntry & { roblox?: boolean; };

const ROBLOX_STEPS = new Set<JoinStepKey>(["startup", "helper", "loading", "resolve", "prepare", "server", "queue", "connect"]);

/** Roblox's own milestones as log-like lines, on the same clock as the snipe's log. */
function robloxLines(entry: SnipeEntry): StoryLine[] {
    const b = joinBreakdown(entry);
    const at = entry.metrics?.receivedAt;
    if (!b || at === undefined || !b.steps.some(s => ROBLOX_STEPS.has(s.key))) return [];
    const line = (t: number, message: string): StoryLine => ({ timestamp: at + t, level: "info", message, roblox: true });
    const out: StoryLine[] = [];
    const loaded = b.steps.find(s => s.key === "loading");
    const handed = b.steps.find(s => s.key === "helper") ?? b.steps.find(s => s.key === "startup");
    if (loaded?.end != null) out.push(line(loaded.end, "Finished loading and resolved the link."));
    else if (handed?.end != null) out.push(line(handed.end, `Got the link after ${formatSecs(handed.end - b.steps[0].start)}.`));
    const ask = b.steps.find(s => s.key === "server");
    const queue = b.steps.find(s => s.key === "queue");
    if (queue) out.push(line(queue.start, "The server was full, so you waited in its queue."));
    if (b.spot !== null) out.push(line(b.spot, `The server let you in (${formatSecs(b.spot)} after the message).`));
    else if (ask) out.push(line(ask.start, "Asked to join, but the server never let you in."));
    if (b.connected !== null) out.push(line(b.connected, "Connected to the server."));
    return out;
}

// --- Timeline ---

/** The story: each step shows the time since the step above it, so slow steps stand out. */
export function StoryView({ entry, quote }: { entry: SnipeEntry; quote: React.ReactNode; }) {
    const lines: StoryLine[] = [...visibleLines(entry), ...robloxLines(entry)].sort((a, b) => a.timestamp - b.timestamp);
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
                <span className="vc-sora-story-rail"><span className={`vc-sora-story-dot${line.roblox ? " hollow" : ""}`} style={{ background: lineColor(line) }} /></span>
                <div className="vc-sora-story-msg">{line.roblox && <span className="vc-sora-story-tag">Roblox</span>}{line.message}</div>
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
