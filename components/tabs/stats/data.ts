/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { BOLT_PRESETS, BOLT_STEP_KEYS, boltSum, DEFAULT_BOLT_STEPS, JOIN_STEPS, joinBreakdown, JoinStepKey, sameSteps, summarize, Summary } from "../../../services/JoinTimeline";
import { SnipeEntry } from "../../../stores/SnipeStore";

// Everything the Stats tab shows is read from the snipes already in the history. Nothing here is stored.

// --- Kinds ---

/** What a snipe ended as. Only the first four were joined; they make up the snipe count. */
export type Kind = "real" | "bait" | "timeout" | "unverified" | "failed" | "ignored" | "other";
export type ResultKind = "real" | "bait" | "timeout" | "unverified";

export const RESULT_KINDS: ResultKind[] = ["real", "bait", "timeout", "unverified"];
export const RESULT_LABEL: Record<ResultKind, string> = { real: "Real", bait: "Bait", timeout: "Timed out", unverified: "Not verified" };
export const RESULT_WORD: Record<ResultKind, string> = { real: "real", bait: "bait", timeout: "timed out", unverified: "not verified" };

export function kindOf(entry: SnipeEntry): Kind {
    const t = entry.tags;
    if (t.includes("biome-verified-real")) return "real";
    if (t.includes("biome-verified-bait")) return "bait";
    if (t.includes("biome-verified-timeout")) return "timeout";
    if (t.includes("failed")) return "failed";
    if (t.includes("link-ignored") || t.includes("redundant-biome-ignored") || t.includes("link-verified-unsafe")) return "ignored";
    if (t.includes("biome-not-verified")) return "unverified";
    return "other";
}

export const isResult = (k: Kind): k is ResultKind => k === "real" || k === "bait" || k === "timeout" || k === "unverified";

// --- Timing ---

const timingCache = new WeakMap<SnipeEntry, { metrics: unknown; timeline: unknown; byKey: Map<string, number | null>; }>();

/** The picked join steps added up, like the ⚡ in Snipe History. Null when this snipe has no such timing. */
export function timingOf(entry: SnipeEntry, steps: readonly string[]): number | null {
    let hit = timingCache.get(entry);
    if (!hit || hit.metrics !== entry.metrics || hit.timeline !== entry.robloxTimeline) {
        hit = { metrics: entry.metrics, timeline: entry.robloxTimeline, byKey: new Map() };
        timingCache.set(entry, hit);
    }
    const key = steps.join(",");
    const cached = hit.byKey.get(key);
    if (cached !== undefined) return cached;

    let value: number | null = null;
    if (entry.triggerType !== "fake" && entry.metrics && entry.metrics.timeToJoinMs > 0) {
        const sum = boltSum(entry, steps);
        if (sum != null && sum > 0) value = sum;
    }
    hit.byKey.set(key, value);
    return value;
}

/** What is being timed: the same choice as the ⚡ in Snipe History, set in Settings under Interface. */
export interface Measure { label: string; tip: string; steps: readonly string[]; }

export function measureOf(steps: readonly string[]): Measure {
    const use = steps.length ? steps : DEFAULT_BOLT_STEPS;
    const preset = BOLT_PRESETS.find(p => sameSteps(p.steps, use));
    if (preset) return { label: preset.label, tip: preset.tip, steps: use };
    return { label: "Custom timing", tip: `Sum of ${use.map(k => JOIN_STEPS[k as JoinStepKey]?.name ?? k).join(", ")}.`, steps: use };
}

// --- Period ---

export type PeriodId = "1d" | "7d" | "30d" | "90d" | "all" | "yesterday" | "prev7" | "custom";

/** For "custom", from and to are timestamps inside the first and last day of the range. */
export interface Period { id: PeriodId; from?: number; to?: number; }

export const PERIOD_PRESETS: { id: PeriodId; label: string; }[] = [
    { id: "1d", label: "Today" },
    { id: "7d", label: "7 days" },
    { id: "30d", label: "30 days" },
    { id: "90d", label: "90 days" },
    { id: "all", label: "All time" },
    { id: "yesterday", label: "Yesterday" },
    { id: "prev7", label: "Previous 7 days" },
];

export interface Win {
    since: number;
    until: number;
    days: number;
    /** Fits "snipes in ...". */
    label: string;
    /** Fits a button. */
    short: string;
}

const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;

export const startOfDay = (ts: number) => { const d = new Date(ts); d.setHours(0, 0, 0, 0); return d.getTime(); };
const dayAt = (base: number, offset: number) => { const d = new Date(base); d.setDate(d.getDate() + offset); return d.getTime(); };
export const shortDate = (ts: number) => new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric" });

export function windowOf(period: Period, firstTs: number, now = Date.now()): Win {
    const today = startOfDay(now);
    let since = today;
    let until = dayAt(today, 1);
    let label: string;
    let short: string;

    switch (period.id) {
        case "1d": label = "today"; short = "Today"; break;
        case "7d":
        case "30d":
        case "90d": {
            const d = parseInt(period.id, 10);
            since = dayAt(today, -(d - 1));
            label = `the last ${d} days`;
            short = `${d} days`;
            break;
        }
        case "all":
            since = Number.isFinite(firstTs) ? startOfDay(firstTs) : today;
            label = "all time";
            short = "All time";
            break;
        case "yesterday":
            since = dayAt(today, -1);
            until = today;
            label = "yesterday";
            short = "Yesterday";
            break;
        case "prev7":
            since = dayAt(today, -13);
            until = dayAt(today, -6);
            label = "the previous 7 days";
            short = "Previous 7 days";
            break;
        default: {
            const from = startOfDay(period.from ?? dayAt(today, -13));
            const to = startOfDay(period.to ?? today);
            since = Math.min(from, to);
            until = dayAt(Math.max(from, to), 1);
            const last = dayAt(until, -1);
            short = since === last ? shortDate(since) : `${shortDate(since)} to ${shortDate(last)}`;
            label = short;
        }
    }

    return { since, until, days: Math.max(1, Math.round((until - since) / DAY)), label, short };
}

// --- Stats ---

export interface Counts { real: number; bait: number; timeout: number; unverified: number; }

export interface Bucket extends Counts { start: number; }

/** One row of "who and where": a server, channel or author. */
export interface Group extends Counts {
    key: string;
    name: string;
    avatar?: string;
    /** Joined snipes. */
    n: number;
    /** Snipes with a biome result. */
    v: number;
}

export type BucketUnit = "hour" | "day" | "week" | "month";

export interface Stats extends Counts {
    /** Joined snipes: with a biome result, or without one. */
    n: number;
    /** Snipes with a biome result. The real rate is real out of this. */
    v: number;
    failed: number;
    ignored: number;
    /** Every snipe in the period, whatever happened to it. */
    all: number;
    rate: number | null;
    /** Share of joined snipes that got a biome result. */
    cover: number | null;
    /** The measure picked in Settings, over the joined snipes that have it. */
    timing: Summary | null;
    avgBiome: number | null;
    last: number | null;
    unit: BucketUnit;
    buckets: Bucket[];
    /** Joined snipes per hour of the day, local time. */
    hours: number[];
    servers: Group[];
    channels: Group[];
    authors: Group[];
    recent: SnipeEntry[];
}

export interface TriggerRow {
    name: string;
    iconUrl?: string;
    stats: Stats;
}

const DEFAULT_GROUPS = 6;
const RECENT_COUNT = 6;

const emptyCounts = (): Counts => ({ real: 0, bait: 0, timeout: 0, unverified: 0 });

/** Bucket starts for a period: hours for a day, days up to a month, weeks up to six months, then months. */
function bucketStarts(win: Win): { unit: BucketUnit; starts: number[]; } {
    const starts: number[] = [];
    if (win.days <= 1) {
        for (let i = 0; i < 24; i++) starts.push(win.since + i * HOUR);
        return { unit: "hour", starts };
    }
    if (win.days <= 31) {
        for (let t = win.since; t < win.until; t = dayAt(t, 1)) starts.push(t);
        return { unit: "day", starts };
    }
    if (win.days <= 182) {
        for (let t = win.since; t < win.until; t = dayAt(t, 7)) starts.push(t);
        return { unit: "week", starts };
    }
    starts.push(win.since);
    const first = new Date(win.since);
    let next = new Date(first.getFullYear(), first.getMonth() + 1, 1);
    while (next.getTime() < win.until) {
        starts.push(next.getTime());
        next = new Date(next.getFullYear(), next.getMonth() + 1, 1);
    }
    return { unit: "month", starts };
}

function bucketIndex(starts: number[], ts: number): number {
    let lo = 0;
    let hi = starts.length - 1;
    while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (starts[mid] <= ts) lo = mid; else hi = mid - 1;
    }
    return lo;
}

function groupBy(joined: { entry: SnipeEntry; kind: ResultKind; }[], limit: number, key: (e: SnipeEntry) => { key: string; name: string; avatar?: string; }): Group[] {
    const map = new Map<string, Group>();
    for (const { entry, kind } of joined) {
        const k = key(entry);
        let g = map.get(k.key);
        if (!g) {
            g = { ...emptyCounts(), key: k.key, name: k.name, avatar: k.avatar, n: 0, v: 0 };
            map.set(k.key, g);
        }
        g.n++;
        if (kind !== "unverified") g.v++;
        g[kind]++;
    }
    return [...map.values()].sort((a, b) => b.n - a.n).slice(0, limit);
}

export const serverKey = (e: SnipeEntry) => e.guildId ?? (e.guildName ? `name:${e.guildName}` : "unknown");

/** `entries` must be newest first and already inside the period. `groups` is how many servers, channels and authors to keep; 0 skips them. */
export function computeStats(entries: SnipeEntry[], win: Win, groups = DEFAULT_GROUPS, steps: readonly string[] = DEFAULT_BOLT_STEPS): Stats {
    const counts = emptyCounts();
    let failed = 0;
    let ignored = 0;
    const joined: { entry: SnipeEntry; kind: ResultKind; }[] = [];
    const timings: number[] = [];
    const biomeDurations: number[] = [];

    const { unit, starts } = bucketStarts(win);
    const buckets: Bucket[] = starts.map(start => ({ ...emptyCounts(), start }));
    const hours: number[] = Array(24).fill(0);

    for (const entry of entries) {
        const kind = kindOf(entry);
        if (kind === "failed") { failed++; continue; }
        if (kind === "ignored") { ignored++; continue; }
        if (!isResult(kind)) continue;

        counts[kind]++;
        joined.push({ entry, kind });
        buckets[bucketIndex(starts, entry.timestamp)][kind]++;
        hours[new Date(entry.timestamp).getHours()]++;

        const ms = timingOf(entry, steps);
        if (ms != null) timings.push(ms);
        if (kind === "real" && entry.biomeDurationMs != null) biomeDurations.push(entry.biomeDurationMs);
    }

    const v = counts.real + counts.bait + counts.timeout;
    const n = v + counts.unverified;

    return {
        ...counts,
        n,
        v,
        failed,
        ignored,
        all: entries.length,
        rate: v ? Math.round(counts.real / v * 100) : null,
        cover: n ? Math.round(v / n * 100) : null,
        timing: summarize(timings),
        avgBiome: biomeDurations.length ? biomeDurations.reduce((a, b) => a + b, 0) / biomeDurations.length : null,
        last: joined.length ? joined[0].entry.timestamp : null,
        unit,
        buckets,
        hours,
        servers: groups ? groupBy(joined, groups, e => ({ key: serverKey(e), name: e.guildName ?? "Unknown server" })) : [],
        channels: groups ? groupBy(joined, groups, e => ({ key: `${serverKey(e)}/${e.channelName ?? ""}`, name: e.channelName ? `#${e.channelName.replace(/^#/, "")}` : "Unknown channel" })) : [],
        authors: groups ? groupBy(joined, groups, e => ({ key: e.authorId ?? e.authorName ?? "unknown", name: e.authorName ?? "Unknown", avatar: e.authorAvatarUrl })) : [],
        recent: groups ? entries.slice(0, RECENT_COUNT) : [],
    };
}

export function triggerRows(entries: SnipeEntry[], win: Win, steps: readonly string[] = DEFAULT_BOLT_STEPS): TriggerRow[] {
    const map = new Map<string, { iconUrl?: string; list: SnipeEntry[]; }>();
    for (const entry of entries) {
        let g = map.get(entry.triggerName);
        if (!g) {
            g = { list: [] };
            map.set(entry.triggerName, g);
        }
        g.iconUrl ??= entry.iconUrl; // newest first, so this is the latest icon
        g.list.push(entry);
    }

    return [...map.entries()]
        .map(([name, g]) => ({ name, iconUrl: g.iconUrl, stats: computeStats(g.list, win, 0, steps) }))
        .filter(r => r.stats.n > 0)
        .sort((a, b) => b.stats.n - a.stats.n);
}

// --- Formatting ---

export const pad2 = (n: number) => String(n).padStart(2, "0");
export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
/** Timings are often well under a second, so those show in milliseconds. */
export const fmtSeconds = (ms: number | null) => ms == null ? "-" : ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(ms < 10000 ? 2 : 1)} s`;

export function fmtDuration(ms: number | null): string {
    if (ms == null) return "-";
    const s = Math.round(ms / 1000);
    return s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`;
}

export const fmtRate = (rate: number | null) => rate == null ? "-" : `${rate}%`;

/** The busiest three hours in a row, like "18:00 to 21:00", and how many snipes landed in them. Null when there are too few snipes to say. */
export function peakWindow(hours: number[]): { range: string; count: number; } | null {
    if (hours.reduce((a, b) => a + b, 0) < 5) return null;
    let best = 0;
    let bestSum = -1;
    for (let i = 0; i < 24; i++) {
        const sum = hours[i] + hours[(i + 1) % 24] + hours[(i + 2) % 24];
        if (sum > bestSum) { bestSum = sum; best = i; }
    }
    return { range: `${pad2(best)}:00 to ${pad2((best + 3) % 24)}:00`, count: bestSum };
}

export const peakRange = (hours: number[]): string | null => peakWindow(hours)?.range ?? null;

/** Why the real rate leaves some snipes out, or "" when none were left out. */
export function coverageNote(s: Stats): string {
    if (!s.unverified) return "";
    const one = s.unverified === 1;
    return `${plural(s.unverified, "snipe")} ${one ? "has" : "have"} no biome check, so ${one ? "it is" : "they are"} not in the real rate (${s.cover}% verified).`;
}

export function bucketLabel(unit: BucketUnit, start: number, long = false): string {
    if (unit === "hour") return `${pad2(new Date(start).getHours())}:00`;
    if (unit === "month") return new Date(start).toLocaleDateString("en-US", { month: "short", year: "2-digit" });
    return unit === "week" && long ? `Week of ${shortDate(start)}` : shortDate(start);
}

export const bucketTotal = (b: Counts) => b.real + b.bait + b.timeout + b.unverified;

// --- Timing samples ---

export interface TimingSample { entry: SnipeEntry; ms: number; }

/** Every joined snipe that has the timing, newest first. */
export function timingSamples(entries: SnipeEntry[], steps: readonly string[]): TimingSample[] {
    const out: TimingSample[] = [];
    for (const entry of entries) {
        if (!isResult(kindOf(entry))) continue;
        const ms = timingOf(entry, steps);
        if (ms != null) out.push({ entry, ms });
    }
    return out;
}

export interface Bin { from: number; to: number; count: number; open: boolean; }

/** Evenly sized bins from the fastest timing to the 95th percentile. The last bin also holds anything slower. */
export function timingBins(samples: TimingSample[], count = 12): Bin[] {
    if (!samples.length) return [];
    const sorted = samples.map(s => s.ms).sort((a, b) => a - b);
    const lo = sorted[0];
    const hi = Math.max(sorted[Math.floor(0.95 * (sorted.length - 1))], lo + 1);
    const width = (hi - lo) / count;
    const bins: Bin[] = Array.from({ length: count }, (_, i) => ({ from: lo + i * width, to: lo + (i + 1) * width, count: 0, open: i === count - 1 }));
    for (const ms of sorted) bins[Math.min(count - 1, Math.floor((ms - lo) / width))].count++;
    return bins;
}

// --- Outcome ---

/** Got in = real or bait. Unknown = the biome wasn't checked, so there's no telling if you got in. */
export type Outcome = "got" | "timeout" | "unknown";
export type OutcomeFilter = Outcome | "all";

export function outcomeOf(entry: SnipeEntry): Outcome | null {
    const k = kindOf(entry);
    if (k === "real" || k === "bait") return "got";
    if (k === "timeout") return "timeout";
    if (k === "unverified") return "unknown";
    return null;
}

// A queued join has no Server request step (the wait becomes Queue), so the comparison stops before both
export const REQUEST_SENT_STEPS: readonly string[] = BOLT_STEP_KEYS.slice(0, BOLT_STEP_KEYS.indexOf("prepare") + 1);

export const REQUEST_SENT_MEASURE: Measure = {
    label: "Until the slot request was sent",
    tip: "From the message until Roblox asked the server for a slot. The same point for joins that got in and joins that waited in a queue.",
    steps: REQUEST_SENT_STEPS,
};

export interface OutcomeBin { from: number; to: number; open: boolean; got: TimingSample[]; out: TimingSample[]; }

// Round bin sizes, so the axis reads well whatever the spread
const BIN_STEPS = [50, 100, 200, 250, 500, 1000, 2000, 5000];
const MAX_BINS = 24;

/** Joins that got in or timed out, in round bins up to the 95th percentile. The last bin also holds anything slower. */
export function outcomeBins(entries: SnipeEntry[]): OutcomeBin[] {
    const samples: (TimingSample & { outcome: Outcome; })[] = [];
    for (const entry of entries) {
        const outcome = outcomeOf(entry);
        if (outcome !== "got" && outcome !== "timeout") continue;
        const ms = timingOf(entry, REQUEST_SENT_STEPS);
        if (ms != null) samples.push({ entry, ms, outcome });
    }
    if (!samples.length) return [];

    const sorted = samples.map(s => s.ms).sort((a, b) => a - b);
    const p95 = sorted[Math.floor(0.95 * (sorted.length - 1))];
    const step = BIN_STEPS.find(w => (p95 - Math.floor(sorted[0] / w) * w) / w <= MAX_BINS) ?? BIN_STEPS[BIN_STEPS.length - 1];
    const lo = Math.floor(sorted[0] / step) * step;
    const hi = Math.max(lo + step, Math.ceil(p95 / step) * step);
    const count = Math.round((hi - lo) / step);
    const bins: OutcomeBin[] = Array.from({ length: count }, (_, i) => ({ from: lo + i * step, to: lo + (i + 1) * step, open: i === count - 1, got: [], out: [] }));
    for (const s of samples) {
        const bin = bins[Math.min(count - 1, Math.floor((s.ms - lo) / step))];
        (s.outcome === "got" ? bin.got : bin.out).push(s);
    }
    return bins;
}

/** The first bin from which at least 1 in 4 joins timed out, counting only bins at or above it. Needs 4 joins there. */
export function turningPoint(bins: OutcomeBin[]): { at: number; out: number; total: number; } | null {
    for (let i = 0; i < bins.length; i++) {
        let got = 0, out = 0;
        for (const b of bins.slice(i)) { got += b.got.length; out += b.out.length; }
        if (got + out >= 4 && out / (got + out) >= 0.25) return { at: bins[i].from, out, total: got + out };
    }
    return null;
}

/** The median timing of each bucket, or null where the bucket has none. */
export function medianByBucket(samples: TimingSample[], buckets: Bucket[]): (number | null)[] {
    const starts = buckets.map(b => b.start);
    const per: number[][] = buckets.map(() => []);
    for (const { entry, ms } of samples) per[bucketIndex(starts, entry.timestamp)].push(ms);
    return per.map(list => {
        if (!list.length) return null;
        list.sort((a, b) => a - b);
        return list[Math.floor((list.length - 1) / 2)];
    });
}

export interface StepStat { key: JoinStepKey; n: number; p50: number; }

/** The median time of each step of the join, over the joined snipes whose Roblox log was read. In join order. */
export function stepMedians(entries: SnipeEntry[]): StepStat[] {
    const per = new Map<JoinStepKey, number[]>();
    for (const entry of entries) {
        if (!isResult(kindOf(entry))) continue;
        const b = joinBreakdown(entry);
        if (!b) continue;
        for (const step of b.steps) {
            if (step.end == null) continue;
            const list = per.get(step.key);
            if (list) list.push(step.end - step.start); else per.set(step.key, [step.end - step.start]);
        }
    }
    return BOLT_STEP_KEYS.filter(k => per.has(k)).map(k => {
        const xs = per.get(k)!.sort((a, b) => a - b);
        return { key: k, n: xs.length, p50: xs[Math.floor((xs.length - 1) / 2)] };
    });
}

// --- When ---

export interface WhenData {
    /** Joined snipes per hour of the day, by result. */
    hours: Counts[];
    /** Joined snipes per weekday, by result. Monday first. */
    days: Counts[];
    /** Snipes per weekday (Monday first) and hour. */
    grid: number[][];
}

export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function whenBreakdown(entries: SnipeEntry[]): WhenData {
    const hours = Array.from({ length: 24 }, emptyCounts);
    const days = Array.from({ length: 7 }, emptyCounts);
    const grid = Array.from({ length: 7 }, () => Array<number>(24).fill(0));

    for (const entry of entries) {
        const kind = kindOf(entry);
        if (!isResult(kind)) continue;
        const d = new Date(entry.timestamp);
        const day = (d.getDay() + 6) % 7;
        hours[d.getHours()][kind]++;
        days[day][kind]++;
        grid[day][d.getHours()]++;
    }
    return { hours, days, grid };
}
