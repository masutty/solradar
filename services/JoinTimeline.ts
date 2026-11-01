/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// Join speed: reads what Roblox logged after a launch and turns snipes into stats.
// Used by the snipe menu's Timing section, the log waterfall and the Developer tab stats.

import { Logger } from "../logger";
import { RobloxTimelineData, SnipeEntry, SnipeStore } from "../stores/SnipeStore";
import { Native } from "../utils";

const logger = new Logger("SolRadar.JoinTimeline");

/** How long after a launch to read Roblox's log. Long enough for a normal join to finish. */
export const CAPTURE_DELAY_MS = 30_000;

export const isTimelineComplete = (t: RobloxTimelineData | undefined) =>
    !!t && t.stages.connected !== undefined;

/**
 * Reads Roblox's log for this snipe's launch and saves the result on the entry.
 * Skips entries that already have a complete timeline, unless forced.
 */
export async function captureRobloxTimeline(id: number, force = false): Promise<RobloxTimelineData | null> {
    const entry = SnipeStore.getById(id);
    const launchedAt = entry?.metrics?.launchedAt;
    if (!entry || !launchedAt) return null;
    if (!force && isTimelineComplete(entry.robloxTimeline)) return entry.robloxTimeline!;

    const res = await Native.getRobloxJoinTimeline(launchedAt);
    if (!res.ok) {
        logger.debug(`No Roblox timeline for snipe ${id}: ${res.error}`);
        return entry.robloxTimeline ?? null;
    }
    const data: RobloxTimelineData = { mode: res.mode, forwarderMs: res.forwarderMs, stages: res.stages, slowHttp: res.slowHttp };
    SnipeStore.update(id, { robloxTimeline: data });
    return data;
}

export function scheduleTimelineCapture(id: number): void {
    setTimeout(() => {
        captureRobloxTimeline(id).catch(err => logger.error("Timeline capture failed:", err));
    }, CAPTURE_DELAY_MS);
}

// --- Join breakdown ---
// One ordered list of steps from the message to the game server, used by the snipe menu,
// the log waterfall, the Developer stats and the CSV, so they always agree.

export type StepCat = "plugin" | "hw" | "net" | "queue";
export type JoinStepKey = "read" | "close" | "open" | "startup" | "helper" | "loading" | "resolve" | "prepare" | "server" | "queue" | "connect";

/**
 * A server request longer than this was a wait in the server's queue, not the network.
 * Roblox logs nothing while it waits; a normal request takes 0.3 to 0.7s.
 */
const QUEUE_MS = 2500;

export const STEP_CATS: Record<StepCat, { name: string; color: string; tip: string; }> = {
    plugin: { name: "Plugin", color: "var(--brand-500)", tip: "Sol Radar's own code: reading the message and finding the trigger." },
    hw: { name: "Hardware", color: "var(--vc-sora-hw)", tip: "Roblox starting and loading on your PC." },
    net: { name: "Network", color: "var(--vc-sora-net)", tip: "Roblox talking to its servers." },
    queue: { name: "Queue", color: "var(--text-muted)", tip: "You waiting in line because the server was full." },
};

export const JOIN_STEPS: Record<JoinStepKey, { name: string; cat: StepCat; tip: string; }> = {
    read: { name: "Read message", cat: "plugin", tip: "Finding the trigger and checking for duplicates." },
    close: { name: "Close Roblox", cat: "hw", tip: "Safe join mode closes the game before joining. Windows ending the Roblox process." },
    open: { name: "Open Roblox", cat: "hw", tip: "Windows creating the Roblox process for the link. Not Sol Radar's code." },
    startup: { name: "Roblox startup", cat: "hw", tip: "A new Roblox process starting before it runs its own code." },
    helper: { name: "Helper", cat: "hw", tip: "The new Roblox passes the link to the Roblox that was already open, then closes." },
    loading: { name: "Roblox loading", cat: "hw", tip: "Roblox loading from closed, then resolving the link. Roblox doesn't log the two apart." },
    resolve: { name: "Link resolve", cat: "net", tip: "Roblox asking where the link points." },
    prepare: { name: "Prepare", cat: "hw", tip: "Roblox setting up the game on your PC." },
    server: { name: "Server request", cat: "net", tip: "Asking the server to let you in. Ends when it does." },
    queue: { name: "Queue", cat: "queue", tip: "The server was full, so you waited in line to get in." },
    connect: { name: "Connect", cat: "net", tip: "Connecting to the server after it let you in." },
};

/**
 * When the server answered the request to let you in, not counting a queue.
 * Roblox logs nothing while it waits, so a long wait is all queue and this is where it began.
 */
export function reachedAt(b: JoinBreakdown): number | null {
    const queue = b.steps.find(s => s.key === "queue");
    if (queue) return queue.start;
    const server = b.steps.find(s => s.key === "server");
    return server ? server.end ?? server.start : null;
}

export interface JoinStep {
    key: JoinStepKey;
    /** ms after the message reached Sol Radar */
    start: number;
    /** null: never finished (no spot in the server) */
    end: number | null;
}

/**
 * - joined: Roblox got a spot (warm: Roblox was open, cold: it started from closed)
 * - noSpot: Roblox got the link but never got a spot
 * - pending: Roblox's log hasn't been read yet
 * - noLog: the log was looked for and has nothing for this join
 * - old: snipe made before join-speed metrics existed
 */
export type JoinSituation = "warm" | "cold" | "noSpot" | "pending" | "noLog" | "old";

export interface JoinBreakdown {
    situation: JoinSituation;
    steps: JoinStep[];
    /** ms to a spot in the server */
    spot: number | null;
    connected: number | null;
    /** Time to the spot by category. Connect comes after the spot, so it isn't counted. */
    totals: Record<StepCat, number>;
}

const PENDING_MS = CAPTURE_DELAY_MS + 10_000;

export function joinBreakdown(entry: SnipeEntry, now = Date.now()): JoinBreakdown | null {
    const m = entry.metrics;
    if (!m) return null;

    const steps: JoinStep[] = [];
    let t = 0;
    const push = (key: JoinStepKey, ms: number) => { steps.push({ key, start: t, end: t + ms }); t += ms; };
    push("read", Math.max(0, m.overheadMs));
    if (m.joinMode === "safe" || (m.joinMode === undefined && (m.killDurationMs ?? 0) >= 1)) push("close", Math.max(0, m.killDurationMs ?? 0));
    push("open", Math.max(0, m.openUriDurationMs));
    const openEnd = t;

    const result = (situation: JoinSituation, spot: number | null = null, connected: number | null = null): JoinBreakdown => {
        const totals: Record<StepCat, number> = { plugin: 0, hw: 0, net: 0, queue: 0 };
        for (const s of steps) if (s.end !== null && s.key !== "connect") totals[JOIN_STEPS[s.key].cat] += s.end - s.start;
        return { situation, steps, spot, connected, totals };
    };

    if (!m.receivedAt || !m.launchedAt) return result("old");
    const tl = entry.robloxTimeline;
    if (!tl) return result(now - m.launchedAt < PENDING_MS ? "pending" : "noLog");

    const st = tl.stages;
    const rel = (abs: number | undefined) => abs === undefined ? undefined : abs - m.receivedAt!;
    // Clocks can disagree by a few ms; never draw a step that ends before it starts
    let cursor = openEnd;
    const step = (key: JoinStepKey, end: number | undefined) => {
        if (end === undefined) return false;
        const e = Math.max(end, cursor);
        steps.push({ key, start: cursor, end: e });
        cursor = e;
        return true;
    };

    if (tl.mode === "warm") {
        const helperStart = rel(st.helperStart);
        if (helperStart !== undefined) step("startup", helperStart);
        if (!step(helperStart !== undefined ? "helper" : "startup", rel(st.deeplink))) return result("noLog");
        if (!step("resolve", rel(st.linkResolved))) return result("noSpot");
    } else {
        if (!step("startup", rel(st.processStart))) return result("noLog");
        if (!step("loading", rel(st.linkResolved))) return result("noSpot");
    }
    step("prepare", rel(st.dmReady));

    const spot = rel(st.serverAssigned);
    if (spot === undefined) {
        steps.push({ key: "server", start: cursor, end: null });
        return result("noSpot");
    }
    step(spot - cursor > QUEUE_MS ? "queue" : "server", spot);
    const spotAt = cursor;
    const connected = step("connect", rel(st.connected)) ? cursor : null;
    return result(tl.mode, spotAt, connected);
}

// --- History bolt ---
// The number next to the ⚡ on every snipe in the history: the sum of the steps picked in the Developer tab.

export const BOLT_STEP_KEYS = Object.keys(JOIN_STEPS) as JoinStepKey[];
const stepsOfCat = (cat: StepCat) => BOLT_STEP_KEYS.filter(k => JOIN_STEPS[k].cat === cat);
const upTo = (last: JoinStepKey) => BOLT_STEP_KEYS.slice(0, BOLT_STEP_KEYS.indexOf(last) + 1);

export const DEFAULT_BOLT_STEPS: JoinStepKey[] = ["read", "close", "open"];

export const BOLT_PRESETS: { label: string; tip: string; steps: JoinStepKey[]; }[] = [
    { label: "Reaction time", tip: "From the message until Sol Radar handed the link to Windows.", steps: DEFAULT_BOLT_STEPS },
    { label: "Until server slot request", tip: "From the message until the server answered the request for a slot, not counting any wait in its queue.", steps: upTo("server") },
    { label: "Until you were let in", tip: "From the message until the server let you in.", steps: upTo("queue") },
    { label: "Until connected", tip: "From the message until you were connected to the server.", steps: BOLT_STEP_KEYS },
    { label: "Plugin total", tip: STEP_CATS.plugin.tip, steps: stepsOfCat("plugin") },
    { label: "Hardware total", tip: STEP_CATS.hw.tip, steps: stepsOfCat("hw") },
    { label: "Network total", tip: STEP_CATS.net.tip, steps: stepsOfCat("net") },
];

export const sameSteps = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every(k => b.includes(k));

/** The picked steps added up, or null when this snipe has none of them. A step this join didn't have counts as 0. */
export function boltSum(entry: SnipeEntry, steps: readonly string[]): number | null {
    const b = joinBreakdown(entry);
    if (!b) return null;
    let total = 0;
    let found = false;
    for (const s of b.steps) {
        if (!steps.includes(s.key) || s.end === null) continue;
        total += s.end - s.start;
        found = true;
    }
    return found ? total : null;
}

// --- Phases (Developer stats and CSV) ---

export type PhaseKey =
    | "discord" | "plugin" | "launch"
    | "handoff" | "preStart" | "helper" | "loading" | "resolve" | "prepare" | "gamejoin" | "queue" | "connect"
    | "toServer" | "total";

export const PHASES: { key: PhaseKey; label: string; tip: string; }[] = [
    { key: "discord", label: "Discord delivery", tip: "Message created on Discord's servers until it reached the plugin. Includes your clock's drift, so compare it with itself, not as an exact number." },
    { key: "plugin", label: "Plugin", tip: "Reading the message, finding the trigger, checking for duplicates." },
    { key: "launch", label: "Launch call", tip: "Handing the link to Windows. Direct starts Roblox's exe; Shell goes through cmd.exe first." },
    { key: "handoff", label: "Hand-off", tip: "After the launch call until Roblox had the link: Roblox startup, plus the helper when Roblox was already open." },
    { key: "preStart", label: "↳ Roblox startup", tip: JOIN_STEPS.startup.tip },
    { key: "helper", label: "↳ Helper", tip: JOIN_STEPS.helper.tip },
    { key: "loading", label: "Roblox loading", tip: JOIN_STEPS.loading.tip },
    { key: "resolve", label: "Link resolve", tip: JOIN_STEPS.resolve.tip },
    { key: "prepare", label: "Prepare", tip: JOIN_STEPS.prepare.tip },
    { key: "gamejoin", label: "Server request", tip: JOIN_STEPS.server.tip },
    { key: "queue", label: "Queue", tip: JOIN_STEPS.queue.tip },
    { key: "connect", label: "Connect", tip: JOIN_STEPS.connect.tip },
    { key: "toServer", label: "Message → server", tip: "From the message reaching the plugin until the server let you in." },
    { key: "total", label: "Message → connected", tip: "From the message reaching the plugin until connected to the game server." },
];

const STEP_PHASE: Partial<Record<JoinStepKey, PhaseKey>> = {
    startup: "preStart", helper: "helper", loading: "loading", resolve: "resolve", prepare: "prepare", server: "gamejoin", queue: "queue", connect: "connect",
};

/** Every phase this entry has data for, in ms. */
export function phasesOf(entry: SnipeEntry): Partial<Record<PhaseKey, number>> {
    const m = entry.metrics;
    if (!m) return {};
    const out: Partial<Record<PhaseKey, number>> = {};
    if (m.discordDelayMs != null) out.discord = m.discordDelayMs;
    out.plugin = m.overheadMs;
    out.launch = m.openUriDurationMs;

    const b = joinBreakdown(entry);
    if (!b) return out;
    for (const s of b.steps) {
        const k = STEP_PHASE[s.key];
        if (k && s.end !== null) out[k] = s.end - s.start;
    }
    const handoff = (out.preStart ?? 0) + (out.helper ?? 0);
    if (out.preStart !== undefined || out.helper !== undefined) out.handoff = handoff;
    if (b.spot !== null) out.toServer = b.spot;
    if (b.connected !== null) out.total = b.connected;
    return out;
}

// --- Stats ---

export type Summary = { n: number; mean: number; p50: number; p90: number; min: number; max: number; };

export function summarize(values: number[]): Summary | null {
    const xs = values.filter(v => Number.isFinite(v)).sort((a, b) => a - b);
    if (!xs.length) return null;
    const q = (p: number) => xs[Math.min(xs.length - 1, Math.floor(p * (xs.length - 1) + 0.5))];
    return {
        n: xs.length,
        mean: xs.reduce((a, b) => a + b, 0) / xs.length,
        p50: q(0.5),
        p90: q(0.9),
        min: xs[0],
        max: xs[xs.length - 1],
    };
}

/** Entries that actually launched Roblox (have reaction metrics). */
export const joinedEntries = (entries: SnipeEntry[]) =>
    entries.filter(e => e.metrics && e.metrics.timeToJoinMs > 0 && e.triggerType !== "fake");

// --- CSV ---

export function joinSpeedCsv(entries: SnipeEntry[]): string {
    const cols = PHASES.map(p => p.key);
    const head = ["id", "time_utc", "trigger", "launch_method", "discord_focused", "roblox_mode", "helper_ms", "slow_http", ...cols];
    const rows = entries.map(e => {
        const ph = phasesOf(e);
        const m = e.metrics!;
        return [
            e.id,
            new Date(m.receivedAt ?? e.timestamp).toISOString(),
            JSON.stringify(e.triggerName),
            m.launchMethod ?? "",
            m.discordFocused ?? "",
            e.robloxTimeline?.mode ?? "",
            e.robloxTimeline?.forwarderMs ?? "",
            e.robloxTimeline?.slowHttp.length ?? "",
            ...cols.map(k => ph[k] !== undefined ? Math.round(ph[k]!) : ""),
        ].join(",");
    });
    return [head.join(","), ...rows].join("\n");
}
